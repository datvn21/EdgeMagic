import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { EdgePlugin, ItemService, ModuleContext, PluginContext, ViewRegistry } from "@edgemagic/module-api";
import type { EdgeItem } from "@edgemagic/types";
import { RuntimeCommandRegistry } from "../registries/command-registry.js";
import { RuntimeActionRegistry } from "../registries/action-registry.js";
import { RuntimePluginPermissionStore } from "./permission-store.js";
import { PluginRuntime, redactAuditContext } from "./plugin-runtime.js";

const item: EdgeItem = {
  id: "item-1",
  type: "text",
  title: "Secret source",
  content: "do not leak",
  source: "manual",
  metadata: {},
  createdAt: 1,
  updatedAt: 1
};

function createViewRegistry() {
  const views: Array<{ id: string; moduleId: string; titleKey: string }> = [];
  const registry: ViewRegistry = {
    register(view) {
      views.push(view);
      return () => {
        const index = views.findIndex((candidate) => candidate.id === view.id);
        if (index >= 0) {
          views.splice(index, 1);
        }
      };
    }
  };
  return { registry, views };
}

function createRuntime(options: { items?: Partial<ItemService>; permissions?: RuntimePluginPermissionStore } = {}) {
  const commands = new RuntimeCommandRegistry();
  const actions = new RuntimeActionRegistry();
  const views = createViewRegistry();
  const items: ItemService = {
    create: vi.fn(async (input) => ({
      ...item,
      ...input,
      id: "plugin-item",
      metadata: input.metadata ?? {},
      createdAt: 2,
      updatedAt: 2
    })),
    get: vi.fn(async () => item),
    update: vi.fn(async (_id, patch) => ({ ...item, ...patch })),
    softDelete: vi.fn(async () => {}),
    restore: vi.fn(async () => item),
    list: vi.fn(async () => [item]),
    convert: vi.fn(async () => item),
    ...options.items
  };
  const runtime = new PluginRuntime({
    commands,
    actions,
    views: views.registry,
    ...(options.permissions ? { permissions: options.permissions } : {}),
    context: { items, logger: console } as unknown as ModuleContext
  });

  return { runtime, commands, actions, views, items };
}

function createTestPlugin(): EdgePlugin {
  return {
    manifest: {
      id: "test-capture",
      name: "Test Capture",
      version: "0.0.0",
      defaultEnabled: true,
      permissions: ["commands.register", "views.register", "items.write"]
    },
    activate(ctx) {
      ctx.views.register({ id: "panel", moduleId: ctx.manifest.id, titleKey: "Test Capture Panel" });
      ctx.commands.register({
        id: "quick-text",
        titleKey: "Test quick capture",
        keywords: ["plugin", "capture"],
        async run(input) {
          const text = input?.text?.trim() || "Plugin capture";
          const created = await ctx.items.create({ type: "text", title: text, content: text, source: "plugin", metadata: { pluginId: ctx.manifest.id } });
          return { handled: true, item: created };
        }
      });
    }
  };
}

describe("PluginRuntime", () => {
  it("registers plugin contributions only after explicit grants", async () => {
    const { runtime, commands, views, items } = createRuntime();
    const plugin = createTestPlugin();

    await runtime.enable(plugin);

    expect(runtime.isEnabled(plugin.manifest.id)).toBe(false);
    expect(commands.search("plugin")).toHaveLength(0);

    for (const permission of plugin.manifest.permissions) {
      runtime.grant(plugin.manifest.id, permission);
    }

    await runtime.enable(plugin);

    expect(runtime.isEnabled(plugin.manifest.id)).toBe(true);
    expect(commands.search("plugin")).toHaveLength(1);
    expect(views.views).toEqual([
      {
        id: "plugin.test-capture.panel",
        moduleId: "plugin:test-capture",
        titleKey: "Test Capture Panel"
      }
    ]);

    const result = await commands.execute("plugin.test-capture.quick-text", { text: "Captured by plugin" });

    expect(result.handled).toBe(true);
    expect(items.create).toHaveBeenCalledWith(expect.objectContaining({ source: "plugin" }));
  });

  it("revoking a permission disables affected plugin capability", async () => {
    const { runtime, commands } = createRuntime();
    const plugin = createTestPlugin();
    for (const permission of plugin.manifest.permissions) {
      runtime.grant(plugin.manifest.id, permission);
    }
    await runtime.enable(plugin);

    runtime.revoke(plugin.manifest.id, "items.write");

    await expect(commands.execute("plugin.test-capture.quick-text", { text: "blocked content" })).rejects.toThrow(
      "missing permission: items.write"
    );
    expect(runtime.auditLog.list(plugin.manifest.id).at(-1)).toMatchObject({
      event: "permission.denied",
      metadata: { permission: "items.write" }
    });
  });

  it("blocks denied action execution and keeps audit logs content-free", async () => {
    const plugin: EdgePlugin = {
      manifest: {
        id: "action-denied",
        name: "Action Denied",
        version: "0.0.0",
        defaultEnabled: true,
        permissions: ["actions.register"]
      },
      activate(ctx) {
        ctx.actions.register({
          id: "read-item",
          titleKey: "plugins.actionDenied.readItem",
          itemTypes: ["text"],
          async run(target) {
            await ctx.items.get(target.id);
            return { handled: true };
          }
        });
      }
    };
    const { runtime, actions } = createRuntime();
    runtime.grant(plugin.manifest.id, "actions.register");
    await runtime.enable(plugin);

    await expect(actions.run("plugin.action-denied.read-item", item)).rejects.toThrow("missing permission: items.read");

    const serializedAudit = JSON.stringify(runtime.auditLog.list(plugin.manifest.id));
    expect(serializedAudit).toContain("items.read");
    expect(serializedAudit).not.toContain(item.content);
    expect(serializedAudit).not.toContain(item.title);
  });

  it("isolates plugin activation failures from registries", async () => {
    const plugin: EdgePlugin = {
      manifest: {
        id: "broken",
        name: "Broken",
        version: "0.0.0",
        defaultEnabled: true,
        permissions: ["commands.register"]
      },
      activate(ctx) {
        ctx.commands.register({
          id: "half-registered",
          titleKey: "plugins.broken.halfRegistered",
          keywords: ["broken"],
          run: () => ({ handled: true })
        });
        throw new Error("activation exploded");
      }
    };
    const { runtime, commands } = createRuntime();
    runtime.grant(plugin.manifest.id, "commands.register");

    await runtime.enable(plugin);

    expect(runtime.isEnabled(plugin.manifest.id)).toBe(false);
    expect(commands.search("broken")).toHaveLength(0);
    expect(runtime.auditLog.list(plugin.manifest.id).at(-1)).toMatchObject({
      event: "plugin.failed",
      metadata: { error: "activation exploded" }
    });
  });

  it("does not expose platform or native services in plugin context", async () => {
    let captured: PluginContext | null = null;
    const plugin: EdgePlugin = {
      manifest: {
        id: "boundary",
        name: "Boundary",
        version: "0.0.0",
        defaultEnabled: true,
        permissions: []
      },
      activate(ctx) {
        captured = ctx;
      }
    };
    const { runtime } = createRuntime();

    await runtime.enable(plugin);

    expect(captured).not.toBeNull();
    expect(captured).not.toHaveProperty("platform");
    expect(captured).not.toHaveProperty("notifications");
  });

  it("keeps plugin runtime free from desktop/native imports", () => {
    const source = readFileSync(join(process.cwd(), "packages/core/src/plugins/plugin-runtime.ts"), "utf8");

    expect(source).not.toMatch(/apps\/desktop|src-tauri|@tauri-apps|desktop-platform/);
  });

  it("redacts sensitive audit context values", () => {
    expect(
      redactAuditContext({
        content: "note body",
        oauthToken: "secret-token",
        itemId: "item-1",
        count: 2
      })
    ).toEqual({
      content: "[redacted]",
      oauthToken: "[redacted]",
      itemId: "item-1",
      count: 2
    });
  });
});
