import type {
  ActionRegistry,
  CommandRegistry,
  EdgeAction,
  EdgeCommand,
  EdgePlugin,
  Logger,
  ModuleContext,
  PluginAuditLogger,
  PluginContributionRegistry,
  PluginContext,
  PluginPermission,
  PluginPermissionStore,
  Unregister,
  ViewRegistry
} from "@edgemagic/module-api";
import type { EdgeItem } from "@edgemagic/types";
import { RuntimePluginAuditLogger } from "./audit-logger.js";
import { RuntimePluginPermissionStore } from "./permission-store.js";

interface PluginRegistration {
  plugin: EdgePlugin;
  active: boolean;
  unregister: Unregister[];
}

export interface PluginRuntimeOptions {
  commands: CommandRegistry;
  actions: ActionRegistry;
  views?: ViewRegistry;
  context: ModuleContext;
  permissions?: PluginPermissionStore;
  auditLog?: PluginAuditLogger;
  enabledPlugins?: Iterable<string>;
}

export class PluginRuntime implements PluginContributionRegistry {
  private readonly plugins = new Map<string, PluginRegistration>();
  private readonly enabledPlugins: Set<string>;
  private readonly hasExplicitEnabledPlugins: boolean;
  readonly permissions: PluginPermissionStore;
  readonly auditLog: PluginAuditLogger;

  constructor(private readonly options: PluginRuntimeOptions) {
    this.hasExplicitEnabledPlugins = options.enabledPlugins !== undefined;
    this.enabledPlugins = new Set(options.enabledPlugins);
    this.permissions = options.permissions ?? new RuntimePluginPermissionStore();
    this.auditLog = options.auditLog ?? new RuntimePluginAuditLogger();
  }

  register(plugin: EdgePlugin): void {
    if (this.plugins.has(plugin.manifest.id)) {
      throw new Error(`Plugin already registered: ${plugin.manifest.id}`);
    }

    this.plugins.set(plugin.manifest.id, {
      plugin,
      active: false,
      unregister: []
    });
  }

  async enable(plugin: EdgePlugin): Promise<void> {
    if (!this.plugins.has(plugin.manifest.id)) {
      this.register(plugin);
    }

    const registration = this.getRegistration(plugin.manifest.id);
    if (registration.active || !this.isConfiguredEnabled(plugin)) {
      return;
    }

    const unregister: Unregister[] = [];
    const context = this.createPluginContext(plugin, unregister);

    try {
      await plugin.activate(context);
      registration.unregister = unregister;
      registration.active = true;
      this.auditLog.record({
        pluginId: plugin.manifest.id,
        event: "plugin.enabled",
        message: "Plugin enabled.",
        metadata: { pluginVersion: plugin.manifest.version }
      });
    } catch (error) {
      for (const cleanup of unregister.reverse()) {
        cleanup();
      }
      this.auditLog.record({
        pluginId: plugin.manifest.id,
        event: "plugin.failed",
        message: "Plugin activation failed.",
        metadata: { error: error instanceof Error ? error.message : "Unknown error" }
      });
    }
  }

  async disable(pluginId: string): Promise<void> {
    const registration = this.getRegistration(pluginId);
    if (!registration.active) {
      return;
    }

    for (const cleanup of registration.unregister.splice(0).reverse()) {
      cleanup();
    }

    try {
      await registration.plugin.deactivate?.();
    } finally {
      registration.active = false;
      this.auditLog.record({
        pluginId,
        event: "plugin.disabled",
        message: "Plugin disabled.",
        metadata: {}
      });
    }
  }

  isEnabled(pluginId: string): boolean {
    return this.plugins.get(pluginId)?.active ?? false;
  }

  grant(pluginId: string, permission: PluginPermission): void {
    this.permissions.grant(pluginId, permission);
    this.auditLog.record({
      pluginId,
      event: "permission.granted",
      message: "Plugin permission granted.",
      metadata: { permission }
    });
  }

  revoke(pluginId: string, permission: PluginPermission): void {
    this.permissions.revoke(pluginId, permission);
    this.auditLog.record({
      pluginId,
      event: "permission.revoked",
      message: "Plugin permission revoked.",
      metadata: { permission }
    });
  }

  private createPluginContext(plugin: EdgePlugin, unregister: Unregister[]): PluginContext {
    const pluginId = plugin.manifest.id;

    return {
      manifest: plugin.manifest,
      commands: this.scopedCommandRegistry(pluginId, unregister),
      actions: this.scopedActionRegistry(pluginId, unregister),
      views: this.scopedViewRegistry(pluginId, unregister),
      items: {
        create: (input) => {
          this.requirePermission(pluginId, "items.write");
          return this.options.context.items.create({ ...input, source: "plugin" });
        },
        get: (id) => {
          this.requirePermission(pluginId, "items.read");
          return this.options.context.items.get(id);
        },
        update: (id, patch) => {
          this.requirePermission(pluginId, "items.write");
          return this.options.context.items.update(id, patch);
        },
        list: (query) => {
          this.requirePermission(pluginId, "items.read");
          return this.options.context.items.list(query);
        }
      },
      settings: {
        get: (key) => {
          this.requirePermission(pluginId, "settings.read");
          return this.options.context.settings.get(`plugins.${pluginId}.${key}`);
        },
        set: (key, value) => {
          this.requirePermission(pluginId, "settings.write");
          return this.options.context.settings.set(`plugins.${pluginId}.${key}`, value);
        }
      },
      logger: this.scopedLogger(pluginId)
    };
  }

  private scopedCommandRegistry(pluginId: string, unregister: Unregister[]): CommandRegistry {
    return {
      register: (command: EdgeCommand) => {
        this.requirePermission(pluginId, "commands.register");
        const cleanup = this.options.commands.register({
          ...command,
          id: `plugin.${pluginId}.${command.id}`,
          moduleId: `plugin:${pluginId}`
        });
        unregister.push(cleanup);
        return cleanup;
      },
      execute: (id, input) => this.options.commands.execute(id, input),
      search: (query) => this.options.commands.search(query)
    };
  }

  private scopedActionRegistry(pluginId: string, unregister: Unregister[]): ActionRegistry {
    return {
      register: (action: EdgeAction) => {
        this.requirePermission(pluginId, "actions.register");
        const cleanup = this.options.actions.register({
          ...action,
          id: `plugin.${pluginId}.${action.id}`,
          moduleId: `plugin:${pluginId}`
        });
        unregister.push(cleanup);
        return cleanup;
      },
      listForItem: (item: EdgeItem) => this.options.actions.listForItem(item),
      run: (id, item, input) => this.options.actions.run(id, item, input)
    };
  }

  private scopedViewRegistry(pluginId: string, unregister: Unregister[]): ViewRegistry {
    return {
      register: (view) => {
        this.requirePermission(pluginId, "views.register");
        const cleanup = this.options.views?.register({
          ...view,
          id: `plugin.${pluginId}.${view.id}`,
          moduleId: `plugin:${pluginId}`
        }) ?? (() => {});
        unregister.push(cleanup);
        return cleanup;
      }
    };
  }

  private scopedLogger(pluginId: string): Logger {
    const wrapContext = (context?: Record<string, unknown>) => ({
      pluginId,
      ...(context ? redactAuditContext(context) : {})
    });

    return {
      debug: (message, context) => this.options.context.logger.debug(message, wrapContext(context)),
      info: (message, context) => this.options.context.logger.info(message, wrapContext(context)),
      warn: (message, context) => this.options.context.logger.warn(message, wrapContext(context)),
      error: (message, context) => this.options.context.logger.error(message, wrapContext(context))
    };
  }

  private requirePermission(pluginId: string, permission: PluginPermission): void {
    if (this.permissions.has(pluginId, permission)) {
      return;
    }

    this.auditLog.record({
      pluginId,
      event: "permission.denied",
      message: "Plugin permission denied.",
      metadata: { permission }
    });
    throw new Error(`Plugin ${pluginId} missing permission: ${permission}`);
  }

  private isConfiguredEnabled(plugin: EdgePlugin): boolean {
    return this.hasExplicitEnabledPlugins
      ? this.enabledPlugins.has(plugin.manifest.id)
      : plugin.manifest.defaultEnabled;
  }

  private getRegistration(pluginId: string): PluginRegistration {
    const registration = this.plugins.get(pluginId);
    if (!registration) {
      throw new Error(`Plugin not registered: ${pluginId}`);
    }

    return registration;
  }
}

export function redactAuditContext(context: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (/(content|body|text|token|secret|password|url)/i.test(key)) {
      redacted[key] = "[redacted]";
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}
