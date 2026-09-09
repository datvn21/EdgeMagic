import Database from "@tauri-apps/plugin-sql";
import { configureDesktopStore } from "./desktop-store.js";

const databasePath = "sqlite:edgemagic.db";
const migrationKey = "legacy.localStorage.migrated.v1";

export interface DesktopDatabase {
  connection: Database;
  migratedLegacyStorage: boolean;
}

export async function initializeDesktopDatabase(
  storage: Storage = window.localStorage
): Promise<DesktopDatabase | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  const connection = await Database.load(databasePath);
  configureDesktopStore(connection);
  const migratedLegacyStorage = await migrateLegacyStorage(connection, storage);
  return { connection, migratedLegacyStorage };
}

export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const tauriWindow = window as typeof window & { __TAURI_INTERNALS__?: unknown };
  return "__TAURI_INTERNALS__" in tauriWindow;
}

async function migrateLegacyStorage(connection: Database, storage: Storage): Promise<boolean> {
  const marker = await connection.select<Array<{ value_json: string }>>(
    "SELECT value_json FROM settings WHERE key = $1 LIMIT 1",
    [migrationKey]
  );
  if (marker.length > 0) {
    return false;
  }

  const now = Date.now();
  await copyLegacyCaptures(connection, storage.getItem("edgemagic.capture-inbox"), now);
  await copyLegacyProductivity(connection, storage.getItem("edgemagic.productivity-workspace"), now);
  await copyLegacyJsonSettings(connection, storage, now);
  await connection.execute(
    "INSERT INTO settings (key, value_json, updated_at) VALUES ($1, $2, $3)",
    [migrationKey, JSON.stringify({ completedAt: now }), now]
  );
  return true;
}

async function copyLegacyJsonSettings(connection: Database, storage: Storage, now: number): Promise<void> {
  const keys = [
    "edgemagic.capture-inbox",
    "edgemagic.productivity-workspace",
    "edgemagic.edge-settings",
    "edgemagic.browser-bookmarks"
  ];
  for (const key of keys) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      JSON.parse(raw);
    } catch {
      continue;
    }
    await connection.execute(
      "INSERT OR IGNORE INTO settings (key, value_json, updated_at) VALUES ($1, $2, $3)",
      [key, raw, now]
    );
  }
}

async function copyLegacyCaptures(connection: Database, raw: string | null, fallbackTime: number): Promise<void> {
  const records = parseArray(raw);
  for (const record of records) {
    const item = record.item as Record<string, unknown> | undefined;
    if (!item || typeof item.id !== "string" || typeof item.type !== "string" || typeof item.source !== "string") {
      continue;
    }
    await connection.execute(
      `INSERT OR IGNORE INTO items
        (id, type, title, content, url, path, source, metadata_json, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        item.id,
        item.type,
        nullableString(item.title),
        nullableString(item.content),
        nullableString(item.url),
        nullableString(item.path),
        item.source,
        JSON.stringify(item.metadata ?? {}),
        numberOr(item.createdAt, fallbackTime),
        numberOr(item.updatedAt, fallbackTime),
        item.deletedAt ?? null
      ]
    );
  }
}

async function copyLegacyProductivity(connection: Database, raw: string | null, fallbackTime: number): Promise<void> {
  const parsed = parseObject(raw);
  for (const kind of ["notes", "todos", "reminders", "saved"] as const) {
    const records = Array.isArray(parsed[kind]) ? parsed[kind] : [];
    for (const record of records) {
      if (!record || typeof record !== "object" || typeof record.id !== "string") {
        continue;
      }
      await connection.execute(
        `INSERT OR IGNORE INTO module_records
          (id, kind, payload_json, created_at, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          record.id,
          kind,
          JSON.stringify(record),
          numberOr(record.createdAt, fallbackTime),
          numberOr(record.updatedAt, fallbackTime),
          record.deletedAt ?? null
        ]
      );
      if (kind === "notes") {
        await connection.execute(
          `INSERT OR IGNORE INTO notes
            (id, title, content, source_item_id, created_at, updated_at, deleted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            record.id,
            nullableString(record.title) ?? firstLine(nullableString(record.content) ?? "") ?? "Untitled note",
            nullableString(record.content) ?? "",
            nullableString(record.sourceItemId),
            numberOr(record.createdAt, fallbackTime),
            numberOr(record.updatedAt, fallbackTime),
            record.deletedAt ?? null
          ]
        );
      } else if (kind === "todos") {
        await connection.execute(
          `INSERT OR IGNORE INTO todos
            (id, title, completed, source_item_id, created_at, updated_at, deleted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            record.id,
            nullableString(record.title) ?? "Untitled task",
            record.completed === true ? 1 : 0,
            nullableString(record.sourceItemId),
            numberOr(record.createdAt, fallbackTime),
            numberOr(record.updatedAt, fallbackTime),
            record.deletedAt ?? null
          ]
        );
      } else if (kind === "reminders") {
        await connection.execute(
          `INSERT OR IGNORE INTO reminders
            (id, title, remind_at, status, source_item_id, created_at, updated_at, deleted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            record.id,
            nullableString(record.title) ?? "Untitled reminder",
            numberOr(record.remindAt, fallbackTime),
            record.status === "fired" ? "fired" : "scheduled",
            nullableString(record.sourceItemId),
            numberOr(record.createdAt, fallbackTime),
            numberOr(record.updatedAt, fallbackTime),
            record.deletedAt ?? null
          ]
        );
      } else {
        await connection.execute(
          `INSERT OR IGNORE INTO saved_items
            (id, title, url, path, source_item_id, created_at, updated_at, deleted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            record.id,
            nullableString(record.title) ?? nullableString(record.url) ?? nullableString(record.path) ?? "Saved item",
            nullableString(record.url),
            nullableString(record.path),
            nullableString(record.sourceItemId),
            numberOr(record.createdAt, fallbackTime),
            numberOr(record.updatedAt, fallbackTime),
            record.deletedAt ?? null
          ]
        );
      }
    }
  }
}

function parseArray(raw: string | null): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    return [];
  }
}

function parseObject(raw: string | null): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw ?? "{}") as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function firstLine(text: string): string | null {
  const line = text.trim().split(/\r?\n/, 1)[0]?.slice(0, 120) ?? "";
  return line || null;
}
