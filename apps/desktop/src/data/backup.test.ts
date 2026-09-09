import { describe, expect, it } from "vitest";
import {
  createBackup,
  filterClipboardRetention,
  parseBackup,
  previewBackup,
  recordsFromBackup,
  serializeBackup
} from "./backup.js";

describe("EdgeMagic backup", () => {
  it("round trips items, module records, settings, and attachment manifests", () => {
    const backup = createBackup({
      now: 123,
      captures: [
        {
          item: {
            id: "item-1",
            type: "file",
            source: "drag-drop",
            title: "paper.pdf",
            metadata: {},
            createdAt: 1,
            updatedAt: 1
          },
          attachment: {
            id: "attachment-1",
            itemId: "item-1",
            kind: "file",
            filename: "paper.pdf",
            byteSize: 10,
            localPath: "paper.pdf",
            createdAt: 1,
            updatedAt: 1
          }
        }
      ],
      productivity: {
        notes: [{ id: "note-1", title: "Note", content: "Body", createdAt: 1, updatedAt: 1 }],
        todos: [],
        reminders: [],
        saved: []
      },
      deletedProductivityRecords: [],
      settings: {
        position: "right",
        density: "comfortable",
        theme: "system",
        autoHideDelayMs: 450,
        clipboardCaptureEnabled: true,
        clipboardRetentionDays: 30,
        visibleModules: ["search"],
        oauthToken: "super-secret-token"
      } as never
    });

    const parsed = parseBackup(serializeBackup(backup));

    expect(parsed.manifest.exportedAt).toBe(123);
    expect(parsed.data.items).toHaveLength(1);
    expect(parsed.data.moduleRecords.notes[0]?.title).toBe("Note");
    expect(parsed.data.attachments[0]?.filename).toBe("paper.pdf");
    expect(JSON.stringify(parsed)).not.toContain("super-secret-token");
    expect(recordsFromBackup(parsed)[0]?.attachment?.filename).toBe("paper.pdf");
  });

  it("previews invalid backups without throwing", () => {
    expect(previewBackup("{nope").valid).toBe(false);
  });

  it("rejects a corrupted backup before import", () => {
    const backup = createBackup({
      captures: [],
      productivity: { notes: [], todos: [], reminders: [], saved: [] },
      deletedProductivityRecords: [],
      settings: {} as never,
      now: 123
    });
    const serialized = serializeBackup(backup).replace('"exportedAt": 123', '"exportedAt": 124');
    expect(() => parseBackup(serialized)).toThrow(/checksum/i);
    expect(previewBackup(serialized).valid).toBe(false);
  });

  it("rejects orphan attachment manifests", () => {
    const backup = createBackup({
      captures: [],
      productivity: { notes: [], todos: [], reminders: [], saved: [] },
      deletedProductivityRecords: [],
      settings: {} as never,
      now: 123
    });
    const orphaned = { ...backup, data: { ...backup.data, attachments: [{ id: "a", itemId: "missing", kind: "file" as const, filename: "x", localPath: "x" }] } };
    expect(() => parseBackup(serializeBackup(orphaned))).toThrow(/matching item/i);
  });

  it("retains old clipboard records when they are protected by saved items", () => {
    const now = 30 * 24 * 60 * 60 * 1000;
    const records = [
      record("old", "clipboard", 1),
      record("protected", "clipboard", 1),
      record("drop", "drag-drop", 1)
    ];

    expect(filterClipboardRetention(records, 7, ["protected"], now).map((entry) => entry.item.id)).toEqual([
      "protected",
      "drop"
    ]);
  });
});

function record(id: string, source: "clipboard" | "drag-drop", createdAt: number) {
  return {
    item: {
      id,
      type: "text" as const,
      source,
      title: id,
      metadata: {},
      createdAt,
      updatedAt: createdAt
    }
  };
}
