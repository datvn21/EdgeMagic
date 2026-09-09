import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, createSqliteCoreServices } from "./sqlite-services.js";

describe("SQLite storage foundation", () => {
  it("runs versioned migrations", async () => {
    const { db, storage } = createSqliteCoreServices();
    try {
      await storage.migrate();
      await expect(storage.getSchemaVersion()).resolves.toBe(CURRENT_SCHEMA_VERSION);
    } finally {
      db.close();
    }
  });

  it("creates, reads, updates, lists, converts, soft-deletes, and restores items", async () => {
    const { db, storage, items, search } = createSqliteCoreServices();
    try {
      await storage.migrate();

      const created = await items.create({
        type: "text",
        title: "Copied command",
        content: "npm run build",
        source: "clipboard",
        metadata: { "clipboard.mimeHint": "text/plain" }
      });

      await expect(items.get(created.id)).resolves.toMatchObject({
        id: created.id,
        type: "text",
        content: "npm run build"
      });

      const updated = await items.update(created.id, { title: "Build command" });
      expect(updated.title).toBe("Build command");

      const converted = await items.convert(created.id, "note", { noteFormat: "markdown" });
      expect(converted.type).toBe("note");
      expect(converted.metadata).toMatchObject({
        "clipboard.mimeHint": "text/plain",
        noteFormat: "markdown",
        conversion: { fromType: "text" }
      });

      expect(await items.list({ types: ["note"] })).toHaveLength(1);
      expect((await search.search({ text: "build" })).map((result) => result.item.id)).toContain(created.id);

      await items.softDelete(created.id);
      expect(await items.list()).toHaveLength(0);
      expect(await search.search({ text: "build" })).toHaveLength(0);

      const restored = await items.restore(created.id);
      expect(restored.deletedAt).toBeUndefined();
      expect(await items.list()).toHaveLength(1);
      expect(await search.search({ text: "build" })).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it("stores attachment metadata without embedding binary data in item rows", async () => {
    const { db, storage, items, attachments } = createSqliteCoreServices();
    try {
      await storage.migrate();

      const item = await items.create({
        type: "file",
        title: "Assignment PDF",
        path: "C:/Users/Dash/Downloads/assignment.pdf",
        source: "drag-drop"
      });

      const attachment = await attachments.attach(item.id, {
        kind: "file",
        filename: "assignment.pdf",
        mimeType: "application/pdf",
        byteSize: 1234,
        localPath: "C:/Users/Dash/Downloads/assignment.pdf",
        contentHash: "hash-1"
      });

      expect(await attachments.listForItem(item.id)).toEqual([attachment]);
      expect((await items.get(item.id))?.metadata).toEqual({});
    } finally {
      db.close();
    }
  });

  it("rolls back failed transactions", async () => {
    const { db, storage, items } = createSqliteCoreServices();
    try {
      await storage.migrate();

      await expect(
        storage.transaction(async () => {
          await items.create({
            type: "text",
            content: "temporary",
            source: "manual"
          });
          throw new Error("stop");
        })
      ).rejects.toThrow("stop");

      expect(await items.list()).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it("rebuilds the derived search index", async () => {
    const { db, storage, items, search } = createSqliteCoreServices();
    try {
      await storage.migrate();

      const item = await items.create({
        type: "link",
        title: "React docs",
        url: "https://react.dev",
        source: "manual"
      });

      await search.removeItem(item.id);
      expect(await search.search({ text: "React" })).toHaveLength(0);

      await search.rebuild();
      expect(await search.search({ text: "React" })).toHaveLength(1);
    } finally {
      db.close();
    }
  });
});

