import { beforeEach, describe, expect, it } from "vitest";
import { ProductivityRepository } from "./productivity-repository.js";

describe("ProductivityRepository", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("loads legacy browser data through the adapter boundary", async () => {
    window.localStorage.setItem(
      "edgemagic.productivity-workspace",
      JSON.stringify({
        notes: [{ id: "note-1", title: "Keep", content: "Unicode ✓", createdAt: 1, updatedAt: 1 }],
        todos: [],
        reminders: [],
        saved: []
      })
    );

    await expect(new ProductivityRepository().load()).resolves.toMatchObject({
      notes: [{ id: "note-1", content: "Unicode ✓" }]
    });
  });

  it("persists browser fallback only through repository API", async () => {
    const state = { notes: [], todos: [], reminders: [], saved: [] };
    await new ProductivityRepository().persistBrowser(state);
    expect(window.localStorage.getItem("edgemagic.productivity-workspace")).toBe(JSON.stringify(state));
  });
});
