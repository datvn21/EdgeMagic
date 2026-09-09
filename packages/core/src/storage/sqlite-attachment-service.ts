import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AttachmentService, CreateAttachmentInput } from "@edgemagic/module-api";
import type { Attachment } from "@edgemagic/types";
import { mapAttachmentRow, type AttachmentRow } from "./sqlite-types.js";

export class SqliteAttachmentService implements AttachmentService {
  constructor(private readonly db: DatabaseSync) {}
  async attach(itemId: string, input: CreateAttachmentInput): Promise<Attachment> {
    if (!this.db.prepare("SELECT id FROM items WHERE id = ? AND deleted_at IS NULL").get(itemId)) throw new Error(`Cannot attach to missing item: ${itemId}`);
    const now = Date.now();
    const attachment: Attachment = { id: randomUUID(), itemId, kind: input.kind, filename: input.filename, ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}), ...(input.byteSize !== undefined ? { byteSize: input.byteSize } : {}), localPath: input.localPath, ...(input.contentHash !== undefined ? { contentHash: input.contentHash } : {}), createdAt: now, updatedAt: now };
    this.db.prepare("INSERT INTO attachments (id, item_id, kind, filename, mime_type, byte_size, local_path, content_hash, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)").run(attachment.id, attachment.itemId, attachment.kind, attachment.filename, attachment.mimeType ?? null, attachment.byteSize ?? null, attachment.localPath, attachment.contentHash ?? null, attachment.createdAt, attachment.updatedAt);
    return attachment;
  }
  async listForItem(itemId: string): Promise<Attachment[]> {
    const rows = this.db.prepare("SELECT * FROM attachments WHERE item_id = ? AND deleted_at IS NULL ORDER BY created_at ASC").all(itemId) as unknown as AttachmentRow[];
    return rows.map(mapAttachmentRow);
  }
  async remove(id: string): Promise<void> { const now = Date.now(); this.db.prepare("UPDATE attachments SET deleted_at = ?, updated_at = ? WHERE id = ?").run(now, now, id); }
}
