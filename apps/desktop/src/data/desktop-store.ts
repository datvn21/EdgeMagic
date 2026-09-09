import type Database from "@tauri-apps/plugin-sql";

let connection: Database | null = null;

export function configureDesktopStore(database: Database): void {
  connection = database;
}

export async function queryDesktop<T>(sql: string, bindValues: unknown[] = []): Promise<T[]> {
  if (connection) {
    return connection.select<T[]>(sql, bindValues);
  }
  if (isNativeRuntime()) {
    throw new Error("Desktop database is not initialized.");
  }
  return [];
}

export async function executeDesktop(sql: string, bindValues: unknown[] = []): Promise<void> {
  if (connection) {
    await connection.execute(sql, bindValues);
    return;
  }
  if (isNativeRuntime()) {
    throw new Error("Desktop database is not initialized.");
  }
}

export function hasDesktopDatabase(): boolean {
  return connection !== null;
}

export async function readDesktopJson<T>(key: string, fallback: T): Promise<T> {
  if (connection) {
    const rows = await connection.select<Array<{ value_json: string }>>(
      "SELECT value_json FROM settings WHERE key = $1 LIMIT 1",
      [key]
    );
    return parseJson(rows[0]?.value_json, fallback);
  }
  if (isNativeRuntime()) {
    throw new Error("Desktop database is not initialized.");
  }
  if (typeof window === "undefined") return fallback;
  return parseJson(window.localStorage.getItem(key), fallback);
}

export async function writeDesktopJson<T>(key: string, value: T): Promise<void> {
  const serialized = JSON.stringify(value);
  if (connection) {
    await connection.execute(
      "INSERT INTO settings (key, value_json, updated_at) VALUES ($1, $2, $3) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
      [key, serialized, Date.now()]
    );
    return;
  }
  if (isNativeRuntime()) {
    throw new Error("Desktop database is not initialized.");
  }
  if (typeof window !== "undefined") window.localStorage.setItem(key, serialized);
}

function isNativeRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
