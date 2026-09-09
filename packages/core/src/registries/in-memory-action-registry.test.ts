import { describe, expect, it } from "vitest";
import type { EdgeItem } from "@edgemagic/types";
import { RuntimeActionRegistry } from "./action-registry.js";

const textItem: EdgeItem = {
  id: "item-1",
  type: "text",
  title: "Copied text",
  source: "clipboard",
  metadata: {},
  createdAt: 1,
  updatedAt: 1
};

describe("RuntimeActionRegistry", () => {
  it("lists supported actions, runs them, and unregisters them", async () => {
    const registry = new RuntimeActionRegistry();
    const unregister = registry.register({
      id: "notes.from-text",
      titleKey: "actions.notes.fromText",
      itemTypes: ["text"],
      run: (item) => ({ handled: true, message: item.id })
    });

    expect(registry.listForItem(textItem).map((action) => action.id)).toEqual(["notes.from-text"]);
    await expect(registry.run("notes.from-text", textItem)).resolves.toEqual({
      handled: true,
      message: "item-1"
    });

    unregister();

    expect(registry.listForItem(textItem)).toHaveLength(0);
  });

  it("rejects actions for unsupported item types", async () => {
    const registry = new RuntimeActionRegistry();
    registry.register({
      id: "saved.from-link",
      titleKey: "actions.saved.fromLink",
      itemTypes: ["link"],
      run: () => ({ handled: true })
    });

    await expect(registry.run("saved.from-link", textItem)).rejects.toThrow("does not support item type");
  });
});
