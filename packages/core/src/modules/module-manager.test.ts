import { describe, expect, it } from "vitest";
import type { EdgeModule, ModuleContext } from "@edgemagic/module-api";
import type { EdgeItem } from "@edgemagic/types";
import { RuntimeActionRegistry } from "../registries/action-registry.js";
import { RuntimeCommandRegistry } from "../registries/command-registry.js";
import { ModuleManager } from "./module-manager.js";

const item: EdgeItem = {
  id: "item-1",
  type: "text",
  source: "clipboard",
  metadata: {},
  createdAt: 1,
  updatedAt: 1
};

function createMockModule(): EdgeModule {
  return {
    manifest: {
      id: "mock",
      nameKey: "modules.mock",
      version: "0.0.0",
      icon: "test",
      defaultEnabled: true,
      permissions: ["items.read"],
      itemTypes: ["text"]
    },
    activate: () => {},
    deactivate: () => {},
    registerCommands: (commands) => {
      commands.register({
        id: "mock.command",
        titleKey: "commands.mock",
        keywords: ["mock"],
        run: () => ({ handled: true })
      });
    },
    registerActions: (actions) => {
      actions.register({
        id: "mock.action",
        titleKey: "actions.mock",
        itemTypes: ["text"],
        run: () => ({ handled: true })
      });
    }
  };
}

describe("ModuleManager", () => {
  it("activates a module and unregisters contributions on deactivate", async () => {
    const commands = new RuntimeCommandRegistry();
    const actions = new RuntimeActionRegistry();
    const manager = new ModuleManager({
      commands,
      actions,
      context: {} as ModuleContext
    });

    manager.register(createMockModule());
    await manager.activate("mock");

    expect(manager.isActive("mock")).toBe(true);
    expect(commands.search("mock")).toHaveLength(1);
    expect(actions.listForItem(item)).toHaveLength(1);

    await manager.deactivate("mock");

    expect(manager.isActive("mock")).toBe(false);
    expect(commands.search("mock")).toHaveLength(0);
    expect(actions.listForItem(item)).toHaveLength(0);
  });

  it("does not activate disabled modules", async () => {
    const commands = new RuntimeCommandRegistry();
    const actions = new RuntimeActionRegistry();
    const manager = new ModuleManager({
      commands,
      actions,
      enabledModules: ["other"],
      context: {} as ModuleContext
    });

    manager.register(createMockModule());
    await manager.activate("mock");

    expect(manager.isActive("mock")).toBe(false);
    expect(commands.search("mock")).toHaveLength(0);
  });
});
