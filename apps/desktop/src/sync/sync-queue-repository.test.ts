import { beforeEach, describe, expect, it } from "vitest";
import { SyncQueueRepository } from "./sync-queue-repository.js";

describe("SyncQueueRepository", () => {
  beforeEach(() => window.localStorage.clear());

  it("round trips the local queue through the browser adapter", async () => {
    const repository = new SyncQueueRepository();
    const item = { id: "queue-1", entityType: "item" as const, entityId: "item-1", operation: "update" as const, payload: { title: "new" }, status: "pending" as const, attempts: 0, createdAt: 1, updatedAt: 1 };
    await repository.replaceBrowser([item]);
    await expect(repository.load()).resolves.toEqual([item]);
  });
});
