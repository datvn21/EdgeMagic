import { describe, expect, it } from "vitest";
import { RuntimeCommandRegistry } from "./command-registry.js";

describe("RuntimeCommandRegistry", () => {
  it("registers, searches, executes, and unregisters commands", async () => {
    const registry = new RuntimeCommandRegistry();
    const unregister = registry.register({
      id: "notes.create",
      titleKey: "commands.notes.create",
      keywords: ["note", "new note"],
      run: (input) => ({ handled: true, message: input?.text ?? "" })
    });

    expect(registry.search("note")).toHaveLength(1);
    await expect(registry.execute("notes.create", { text: "hello" })).resolves.toEqual({
      handled: true,
      message: "hello"
    });

    unregister();

    expect(registry.search("note")).toHaveLength(0);
    await expect(registry.execute("notes.create")).rejects.toThrow("Command not registered");
  });
});
