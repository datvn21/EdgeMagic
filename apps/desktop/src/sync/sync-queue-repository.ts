import type { SyncQueueItem } from "@edgemagic/module-api";
import { executeDesktop, hasDesktopDatabase, queryDesktop, readDesktopJson, writeDesktopJson } from "../data/desktop-store.js";

const browserKey = "edgemagic.sync-queue";

interface SyncQueueRow {
  id: string;
  entity_type: SyncQueueItem["entityType"];
  entity_id: string;
  operation: SyncQueueItem["operation"];
  payload_json: string;
  status: SyncQueueItem["status"];
  attempts: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

export class SyncQueueRepository {
  async load(): Promise<SyncQueueItem[]> {
    if (!hasDesktopDatabase()) {
      return readDesktopJson(browserKey, [] as SyncQueueItem[]);
    }
    const rows = await queryDesktop<SyncQueueRow>("SELECT * FROM sync_queue ORDER BY created_at ASC");
    return rows.map((row) => ({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      operation: row.operation,
      payload: parsePayload(row.payload_json),
      status: row.status,
      attempts: row.attempts,
      ...(row.last_error !== null ? { lastError: row.last_error } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  async upsert(item: SyncQueueItem): Promise<void> {
    if (!hasDesktopDatabase()) return;
    await executeDesktop(
      `INSERT INTO sync_queue
        (id, entity_type, entity_id, operation, payload_json, status, attempts, last_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(entity_type, entity_id) DO UPDATE SET id = excluded.id,
         operation = excluded.operation, payload_json = excluded.payload_json, status = excluded.status,
         attempts = excluded.attempts, last_error = excluded.last_error, updated_at = excluded.updated_at`,
      [item.id, item.entityType, item.entityId, item.operation, JSON.stringify(item.payload), item.status, item.attempts, item.lastError ?? null, item.createdAt, item.updatedAt]
    );
  }

  async replaceBrowser(items: SyncQueueItem[]): Promise<void> {
    if (!hasDesktopDatabase()) await writeDesktopJson(browserKey, items);
  }
}

function parsePayload(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}
