export const CURRENT_SCHEMA_VERSION = 1;

export const SQLITE_MIGRATIONS = [{
  version: 1,
  name: "core_foundation",
  sql: `CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT, content TEXT, url TEXT, path TEXT, source TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER);
    CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
    CREATE INDEX IF NOT EXISTS idx_items_source ON items(source);
    CREATE INDEX IF NOT EXISTS idx_items_updated_at ON items(updated_at);
    CREATE INDEX IF NOT EXISTS idx_items_deleted_at ON items(deleted_at);
    CREATE VIRTUAL TABLE IF NOT EXISTS item_search USING fts5(item_id UNINDEXED, title, content, url, tags);
    CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, color TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS item_tags (item_id TEXT NOT NULL, tag_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (item_id, tag_id), FOREIGN KEY (item_id) REFERENCES items(id), FOREIGN KEY (tag_id) REFERENCES tags(id));
    CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, item_id TEXT NOT NULL, kind TEXT NOT NULL, filename TEXT NOT NULL, mime_type TEXT, byte_size INTEGER, local_path TEXT NOT NULL, content_hash TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, FOREIGN KEY (item_id) REFERENCES items(id));
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL);`
}] as const;
