import type {
  ActionRegistry,
  CommandRegistry,
  EdgeModule,
  ModuleContext,
  Unregister,
  ViewRegistry
} from "@edgemagic/module-api";

interface ModuleRegistration {
  module: EdgeModule;
  active: boolean;
  unregister: Unregister[];
}

export interface ModuleManagerOptions {
  commands: CommandRegistry;
  actions: ActionRegistry;
  views?: ViewRegistry;
  context: ModuleContext;
  enabledModules?: Iterable<string>;
}

export class ModuleManager {
  private readonly modules = new Map<string, ModuleRegistration>();
  private readonly enabledModules: Set<string>;

  constructor(private readonly options: ModuleManagerOptions) {
    this.enabledModules = new Set(options.enabledModules);
  }

  register(module: EdgeModule): void {
    if (this.modules.has(module.manifest.id)) {
      throw new Error(`Module already registered: ${module.manifest.id}`);
    }

    this.modules.set(module.manifest.id, {
      module,
      active: false,
      unregister: []
    });
  }

  async activate(moduleId: string): Promise<void> {
    const registration = this.getRegistration(moduleId);
    if (registration.active || !this.isEnabled(registration.module)) {
      return;
    }

    await registration.module.activate(this.options.context);

    const unregister: Unregister[] = [];
    const commandRegistry = this.scopedCommandRegistry(registration.module.manifest.id, unregister);
    const actionRegistry = this.scopedActionRegistry(registration.module.manifest.id, unregister);

    registration.module.registerCommands?.(commandRegistry);
    registration.module.registerActions?.(actionRegistry);
    if (this.options.views) {
      registration.module.registerViews?.(this.options.views);
    }

    registration.unregister = unregister;
    registration.active = true;
  }

  async deactivate(moduleId: string): Promise<void> {
    const registration = this.getRegistration(moduleId);
    if (!registration.active) {
      return;
    }

    for (const unregister of registration.unregister.splice(0).reverse()) {
      unregister();
    }

    await registration.module.deactivate?.();
    registration.active = false;
  }

  async activateAll(): Promise<void> {
    for (const moduleId of this.modules.keys()) {
      await this.activate(moduleId);
    }
  }

  async deactivateAll(): Promise<void> {
    for (const moduleId of [...this.modules.keys()].reverse()) {
      await this.deactivate(moduleId);
    }
  }

  isActive(moduleId: string): boolean {
    return this.modules.get(moduleId)?.active ?? false;
  }

  private isEnabled(module: EdgeModule): boolean {
    return this.enabledModules.size === 0 ? module.manifest.defaultEnabled : this.enabledModules.has(module.manifest.id);
  }

  private getRegistration(moduleId: string): ModuleRegistration {
    const registration = this.modules.get(moduleId);
    if (!registration) {
      throw new Error(`Module not registered: ${moduleId}`);
    }

    return registration;
  }

  private scopedCommandRegistry(moduleId: string, unregister: Unregister[]): CommandRegistry {
    return {
      register: (command) => {
        const cleanup = this.options.commands.register({ ...command, moduleId });
        unregister.push(cleanup);
        return cleanup;
      },
      execute: (id, input) => this.options.commands.execute(id, input),
      search: (query) => this.options.commands.search(query)
    };
  }

  private scopedActionRegistry(moduleId: string, unregister: Unregister[]): ActionRegistry {
    return {
      register: (action) => {
        const cleanup = this.options.actions.register({ ...action, moduleId });
        unregister.push(cleanup);
        return cleanup;
      },
      listForItem: (item) => this.options.actions.listForItem(item),
      run: (id, item, input) => this.options.actions.run(id, item, input)
    };
  }
}

