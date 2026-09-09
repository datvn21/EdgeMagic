import { DatabaseSync } from "node:sqlite";
import { SqliteAttachmentService } from "./sqlite-attachment-service.js";
import { SqliteItemService } from "./sqlite-item-service.js";
import { CURRENT_SCHEMA_VERSION } from "./sqlite-migrations.js";
import { SqliteSearchService } from "./sqlite-search-service.js";
import { SqliteStorageService } from "./sqlite-storage-service.js";

export interface SqliteCoreServices {
  db: DatabaseSync;
  storage: SqliteStorageService;
  search: SqliteSearchService;
  items: SqliteItemService;
  attachments: SqliteAttachmentService;
}

export function createSqliteCoreServices(filename = ":memory:"): SqliteCoreServices {
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON;");
  const storage = new SqliteStorageService(db);
  const search = new SqliteSearchService(db);
  return { db, storage, search, items: new SqliteItemService(db, search), attachments: new SqliteAttachmentService(db) };
}

export { CURRENT_SCHEMA_VERSION, SqliteAttachmentService, SqliteItemService, SqliteSearchService, SqliteStorageService };
