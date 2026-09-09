import { randomUUID } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { CreateItemInput, ItemListQuery, ItemService, SearchService, UpdateItemInput } from "@edgemagic/module-api";
import type { EdgeItem, ItemMetadata, ItemType } from "@edgemagic/types";
import { mapItemRow, type ItemRow } from "./sqlite-types.js";

export class SqliteItemService implements ItemService {
  constructor(private readonly db: DatabaseSync, private readonly search: SearchService) {}
  async create(input: CreateItemInput): Promise<EdgeItem> {
    const now = Date.now();
    const item: EdgeItem = { id: randomUUID(), type: input.type, ...(input.title !== undefined ? { title: input.title } : {}), ...(input.content !== undefined ? { content: input.content } : {}), ...(input.url !== undefined ? { url: input.url } : {}), ...(input.path !== undefined ? { path: input.path } : {}), source: input.source, metadata: input.metadata ?? {}, createdAt: now, updatedAt: now };
    this.db.prepare("INSERT INTO items (id, type, title, content, url, path, source, metadata_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)").run(item.id, item.type, item.title ?? null, item.content ?? null, item.url ?? null, item.path ?? null, item.source, JSON.stringify(item.metadata), item.createdAt, item.updatedAt);
    await this.search.indexItem(item); return item;
  }
  async get(id: string): Promise<EdgeItem | null> { const row = this.db.prepare("SELECT * FROM items WHERE id = ?").get(id) as ItemRow | undefined; return row ? mapItemRow(row) : null; }
  async update(id: string, patch: UpdateItemInput): Promise<EdgeItem> {
    const existing = await this.requireItem(id); const updatedAt = Date.now(); const metadata = patch.metadata ?? existing.metadata;
    const title = "title" in patch ? patch.title : existing.title; const content = "content" in patch ? patch.content : existing.content; const url = "url" in patch ? patch.url : existing.url; const path = "path" in patch ? patch.path : existing.path;
    this.db.prepare("UPDATE items SET title = ?, content = ?, url = ?, path = ?, metadata_json = ?, updated_at = ? WHERE id = ?").run(title ?? null, content ?? null, url ?? null, path ?? null, JSON.stringify(metadata), updatedAt, id);
    const item = await this.requireItem(id); await this.search.indexItem(item); return item;
  }
  async softDelete(id: string): Promise<void> { await this.requireItem(id); const now = Date.now(); this.db.prepare("UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?").run(now, now, id); await this.search.removeItem(id); }
  async restore(id: string): Promise<EdgeItem> { await this.requireItem(id); const now = Date.now(); this.db.prepare("UPDATE items SET deleted_at = NULL, updated_at = ? WHERE id = ?").run(now, id); const item = await this.requireItem(id); await this.search.indexItem(item); return item; }
  async list(query: ItemListQuery = {}): Promise<EdgeItem[]> {
    const where: string[] = []; const params: SQLInputValue[] = [];
    if (!query.includeDeleted) where.push("deleted_at IS NULL");
    if (query.types?.length) { where.push(`type IN (${query.types.map(() => "?").join(", ")})`); params.push(...query.types); }
    const sql = ["SELECT * FROM items", where.length ? `WHERE ${where.join(" AND ")}` : "", "ORDER BY updated_at DESC", query.limit ? "LIMIT ?" : ""].filter(Boolean).join(" ");
    if (query.limit) params.push(query.limit);
    return (this.db.prepare(sql).all(...params) as unknown as ItemRow[]).map(mapItemRow);
  }
  async convert(id: string, targetType: ItemType, input: ItemMetadata = {}): Promise<EdgeItem> {
    const existing = await this.requireItem(id); const now = Date.now(); const metadata = { ...existing.metadata, ...input, conversion: { fromType: existing.type, convertedAt: now } };
    this.db.prepare("UPDATE items SET type = ?, metadata_json = ?, updated_at = ? WHERE id = ?").run(targetType, JSON.stringify(metadata), now, id);
    const item = await this.requireItem(id); await this.search.indexItem(item); return item;
  }
  private async requireItem(id: string): Promise<EdgeItem> { const item = await this.get(id); if (!item) throw new Error(`Item not found: ${id}`); return item; }
}
