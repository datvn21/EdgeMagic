import type { Attachment, ItemMetadata, ItemSource, ItemType } from "@edgemagic/types";

export interface ItemRow {
  id: string; type: ItemType; title: string | null; content: string | null; url: string | null;
  path: string | null; source: ItemSource; metadata_json: string; created_at: number; updated_at: number; deleted_at: number | null;
}

export interface AttachmentRow {
  id: string; item_id: string; kind: Attachment["kind"]; filename: string; mime_type: string | null;
  byte_size: number | null; local_path: string; content_hash: string | null; created_at: number; updated_at: number; deleted_at: number | null;
}

export function mapItemRow(row: ItemRow) {
  return { id: row.id, type: row.type, ...(row.title !== null ? { title: row.title } : {}), ...(row.content !== null ? { content: row.content } : {}), ...(row.url !== null ? { url: row.url } : {}), ...(row.path !== null ? { path: row.path } : {}), source: row.source, metadata: parseMetadata(row.metadata_json), createdAt: row.created_at, updatedAt: row.updated_at, ...(row.deleted_at !== null ? { deletedAt: row.deleted_at } : {}) };
}

export function mapAttachmentRow(row: AttachmentRow): Attachment {
  return { id: row.id, itemId: row.item_id, kind: row.kind, filename: row.filename, ...(row.mime_type !== null ? { mimeType: row.mime_type } : {}), ...(row.byte_size !== null ? { byteSize: row.byte_size } : {}), localPath: row.local_path, ...(row.content_hash !== null ? { contentHash: row.content_hash } : {}), createdAt: row.created_at, updatedAt: row.updated_at, ...(row.deleted_at !== null ? { deletedAt: row.deleted_at } : {}) };
}

function parseMetadata(json: string): ItemMetadata {
  const parsed = JSON.parse(json) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ItemMetadata : {};
}
