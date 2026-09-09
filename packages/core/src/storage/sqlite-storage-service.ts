import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { StorageService, StorageTransaction } from "@edgemagic/module-api";
import { SQLITE_MIGRATIONS } from "./sqlite-migrations.js";

export class SqliteStorageService implements StorageService {
  private inTransaction = false;
  constructor(private readonly db: DatabaseSync) {}
  async migrate(): Promise<void> {
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL);");
    for (const migration of SQLITE_MIGRATIONS) {
      if (this.db.prepare("SELECT version FROM schema_migrations WHERE version = ?").get(migration.version)) continue;
      await this.transaction(async () => {
        this.db.exec(migration.sql);
        this.db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(migration.version, migration.name, Date.now());
      });
    }
  }
  async transaction<T>(fn: (tx: StorageTransaction) => Promise<T>): Promise<T> {
    if (this.inTransaction) return fn({ id: "nested" });
    this.inTransaction = true;
    this.db.exec("BEGIN IMMEDIATE;");
    try { const result = await fn({ id: randomUUID() }); this.db.exec("COMMIT;"); return result; }
    catch (error) { this.db.exec("ROLLBACK;"); throw error; }
    finally { this.inTransaction = false; }
  }
  async getSchemaVersion(): Promise<number> {
    if (!this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get()) return 0;
    const row = this.db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as { version: number } | undefined;
    return row?.version ?? 0;
  }
}
