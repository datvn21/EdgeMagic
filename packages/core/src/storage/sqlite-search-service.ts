import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { SearchService } from "@edgemagic/module-api";
import type { EdgeItem, SearchQuery, SearchResult } from "@edgemagic/types";
import { mapItemRow, type ItemRow } from "./sqlite-types.js";

export class SqliteSearchService implements SearchService {
  constructor(private readonly db: DatabaseSync) {}
  async indexItem(item: EdgeItem): Promise<void> { await this.removeItem(item.id); if (item.deletedAt !== undefined) return; this.db.prepare("INSERT INTO item_search (item_id, title, content, url, tags) VALUES (?, ?, ?, ?, ?)").run(item.id, item.title ?? "", item.content ?? "", item.url ?? "", ""); }
  async removeItem(itemId: string): Promise<void> { this.db.prepare("DELETE FROM item_search WHERE item_id = ?").run(itemId); }
  async search(query: SearchQuery): Promise<SearchResult[]> {
    const text = query.text.trim(); const params: SQLInputValue[] = []; const where = ["items.deleted_at IS NULL"];
    if (query.types?.length) { where.push(`items.type IN (${query.types.map(() => "?").join(", ")})`); params.push(...query.types); }
    if (query.sources?.length) { where.push(`items.source IN (${query.sources.map(() => "?").join(", ")})`); params.push(...query.sources); }
    const limit = query.limit ?? 25;
    if (!text) { const rows = this.db.prepare(`SELECT items.*, 0 AS score FROM items WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT ?`).all(...params, limit) as unknown as Array<ItemRow & { score: number }>; return rows.map((row) => ({ item: mapItemRow(row), score: row.score })); }
    const rows = this.db.prepare(`SELECT items.*, bm25(item_search) AS score FROM item_search JOIN items ON items.id = item_search.item_id WHERE item_search MATCH ? AND ${where.join(" AND ")} ORDER BY score ASC, items.updated_at DESC LIMIT ?`).all(buildFtsQuery(text), ...params, limit) as unknown as Array<ItemRow & { score: number }>;
    return rows.map((row) => ({ item: mapItemRow(row), score: row.score }));
  }
  async rebuild(): Promise<void> { this.db.prepare("DELETE FROM item_search").run(); const rows = this.db.prepare("SELECT * FROM items WHERE deleted_at IS NULL").all() as unknown as ItemRow[]; for (const row of rows) await this.indexItem(mapItemRow(row)); }
}

function buildFtsQuery(text: string): string { return text.split(/\s+/).map((token) => token.replace(/"/g, "")).filter(Boolean).map((token) => `"${token}"*`).join(" "); }
