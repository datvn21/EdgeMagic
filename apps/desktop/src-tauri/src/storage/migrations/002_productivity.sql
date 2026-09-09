CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source_item_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    source_item_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    remind_at INTEGER NOT NULL,
    status TEXT NOT NULL,
    source_item_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS saved_items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    url TEXT,
    path TEXT,
    source_item_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
CREATE INDEX IF NOT EXISTS idx_todos_updated_at ON todos(updated_at);
CREATE INDEX IF NOT EXISTS idx_reminders_updated_at ON reminders(updated_at);
CREATE INDEX IF NOT EXISTS idx_saved_items_updated_at ON saved_items(updated_at);
INSERT OR IGNORE INTO notes (id, title, content, source_item_id, created_at, updated_at, deleted_at)
  SELECT json_extract(payload_json, '$.id'), json_extract(payload_json, '$.title'), json_extract(payload_json, '$.content'), json_extract(payload_json, '$.sourceItemId'), created_at, updated_at, deleted_at FROM module_records WHERE kind = 'notes';
INSERT OR IGNORE INTO todos (id, title, completed, source_item_id, created_at, updated_at, deleted_at)
  SELECT json_extract(payload_json, '$.id'), json_extract(payload_json, '$.title'), COALESCE(json_extract(payload_json, '$.completed'), 0), json_extract(payload_json, '$.sourceItemId'), created_at, updated_at, deleted_at FROM module_records WHERE kind = 'todos';
INSERT OR IGNORE INTO reminders (id, title, remind_at, status, source_item_id, created_at, updated_at, deleted_at)
  SELECT json_extract(payload_json, '$.id'), json_extract(payload_json, '$.title'), json_extract(payload_json, '$.remindAt'), COALESCE(json_extract(payload_json, '$.status'), 'scheduled'), json_extract(payload_json, '$.sourceItemId'), created_at, updated_at, deleted_at FROM module_records WHERE kind = 'reminders';
INSERT OR IGNORE INTO saved_items (id, title, url, path, source_item_id, created_at, updated_at, deleted_at)
  SELECT json_extract(payload_json, '$.id'), json_extract(payload_json, '$.title'), json_extract(payload_json, '$.url'), json_extract(payload_json, '$.path'), json_extract(payload_json, '$.sourceItemId'), created_at, updated_at, deleted_at FROM module_records WHERE kind = 'saved';
