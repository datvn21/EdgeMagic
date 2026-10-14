using Microsoft.Data.Sqlite;
using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace EdgeMagic.App;

internal sealed class ProductivityStore
{
    private readonly string _databasePath;
    private readonly string _connectionString;

    public ProductivityStore()
    {
        var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "app.edgemagic.desktop");
        _databasePath = Path.Combine(directory, "edgemagic.db");
        _connectionString = new SqliteConnectionStringBuilder { DataSource = _databasePath }.ToString();
    }

    public BackupService CreateBackupService() => new(_connectionString);

    public async Task InitializeAsync()
    {
        using var legacyApp = Process.GetProcessesByName("edgemagic").FirstOrDefault();
        if (legacyApp is not null)
            throw new InvalidOperationException("Close the existing EdgeMagic app before using this migration build.");

        if (!File.Exists(_databasePath))
            throw new FileNotFoundException($"The existing EdgeMagic database was not found at {_databasePath}. Open the Tauri version once so it can initialize its database, then restart this app.");

        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS items (
                id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT, content TEXT, url TEXT, path TEXT,
                source TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL, deleted_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS item_search (
                item_id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
                url TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, source_item_id TEXT,
                created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS todos (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
                source_item_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS reminders (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, remind_at INTEGER NOT NULL, status TEXT NOT NULL,
                source_item_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS saved_items (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT, path TEXT, source_item_id TEXT,
                created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sync_queue (
                id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, operation TEXT NOT NULL,
                payload_json TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity_type, entity_id);
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
            """;
        await command.ExecuteNonQueryAsync();
        await EnsureSyncQueueTriggersAsync();
    }

    public async Task<int> GetPendingSyncCountAsync()
    {
        await using var connection = await OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM sync_queue WHERE status IN ('pending','failed')";
        return Convert.ToInt32(await command.ExecuteScalarAsync());
    }

    private async Task EnsureSyncQueueTriggersAsync()
    {
        var syncedTables = new (string Table, string EntityType, string Payload)[]
        {
            ("notes", "module-record", "json_object('id',NEW.id,'title',NEW.title,'content',NEW.content,'sourceItemId',NEW.source_item_id,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at,'deletedAt',NEW.deleted_at)"),
            ("todos", "module-record", "json_object('id',NEW.id,'title',NEW.title,'completed',json(CASE WHEN NEW.completed=0 THEN 'false' ELSE 'true' END),'sourceItemId',NEW.source_item_id,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at,'deletedAt',NEW.deleted_at)"),
            ("reminders", "module-record", "json_object('id',NEW.id,'title',NEW.title,'remindAt',NEW.remind_at,'status',NEW.status,'sourceItemId',NEW.source_item_id,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at,'deletedAt',NEW.deleted_at)"),
            ("saved_items", "module-record", "json_object('id',NEW.id,'title',NEW.title,'url',NEW.url,'path',NEW.path,'sourceItemId',NEW.source_item_id,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at,'deletedAt',NEW.deleted_at)"),
            ("items", "item", "json_object('id',NEW.id,'type',NEW.type,'title',NEW.title,'content',NEW.content,'url',NEW.url,'path',NEW.path,'source',NEW.source,'metadata',json(NEW.metadata_json),'createdAt',NEW.created_at,'updatedAt',NEW.updated_at,'deletedAt',NEW.deleted_at)")
        };

        await using var connection = await OpenAsync();
        foreach (var (table, entityType, payload) in syncedTables)
        foreach (var operation in new[] { "INSERT", "UPDATE" })
        {
            var name = $"edgemagic_sync_{table}_{operation.ToLowerInvariant()}";
            var enqueueOperation = operation == "INSERT"
                ? "CASE WHEN NEW.deleted_at IS NULL THEN 'create' ELSE 'delete' END"
                : "CASE WHEN NEW.deleted_at IS NULL THEN 'update' ELSE 'delete' END";
            await using var trigger = connection.CreateCommand();
            trigger.CommandText = $"""
                CREATE TRIGGER IF NOT EXISTS {name} AFTER {operation} ON {table}
                BEGIN
                  INSERT INTO sync_queue(id,entity_type,entity_id,operation,payload_json,status,attempts,last_error,created_at,updated_at)
                  VALUES(lower(hex(randomblob(16))),'{entityType}',NEW.id,{enqueueOperation},{payload},'pending',0,NULL,NEW.updated_at,NEW.updated_at)
                  ON CONFLICT(entity_type,entity_id) DO UPDATE SET operation=excluded.operation,payload_json=excluded.payload_json,
                    status='pending',attempts=0,last_error=NULL,updated_at=excluded.updated_at;
                END;
                """;
            await trigger.ExecuteNonQueryAsync();
        }
    }

    public async Task<(List<NoteItem> Notes, List<TodoItem> Todos, List<ReminderItem> Reminders, List<SavedItem> Saved, List<CaptureItem> Captures)> LoadAsync()
    {
        await using var connection = await OpenAsync();
        var notes = new List<NoteItem>();
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT id, title, content, updated_at FROM notes WHERE deleted_at IS NULL ORDER BY updated_at DESC";
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync()) notes.Add(new(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetInt64(3)));
        }
        var todos = new List<TodoItem>();
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT id, title, completed FROM todos WHERE deleted_at IS NULL ORDER BY completed, updated_at DESC";
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync()) todos.Add(new(reader.GetString(0), reader.GetString(1), reader.GetInt64(2) != 0));
        }
        var reminders = new List<ReminderItem>();
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT id, title, remind_at, status FROM reminders WHERE deleted_at IS NULL ORDER BY remind_at";
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync()) reminders.Add(new(reader.GetString(0), reader.GetString(1), reader.GetInt64(2), reader.GetString(3)));
        }
        var saved = new List<SavedItem>();
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT id, title, url, path FROM saved_items WHERE deleted_at IS NULL ORDER BY updated_at DESC";
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync()) saved.Add(new(reader.GetString(0), reader.GetString(1), reader.IsDBNull(2) ? null : reader.GetString(2), reader.IsDBNull(3) ? null : reader.GetString(3)));
        }
        var captures = new List<CaptureItem>();
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT id, type, title, content, url, path, source, created_at FROM items WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 200";
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync()) captures.Add(new(reader.GetString(0), reader.GetString(1), reader.IsDBNull(2) ? null : reader.GetString(2), reader.IsDBNull(3) ? null : reader.GetString(3), reader.IsDBNull(4) ? null : reader.GetString(4), reader.IsDBNull(5) ? null : reader.GetString(5), reader.GetString(6), reader.GetInt64(7)));
        }
        return (notes, todos, reminders, saved, captures);
    }

    public Task AddNoteAsync(string content) => InsertAsync("INSERT INTO notes(id, title, content, created_at, updated_at, deleted_at) VALUES($id,$title,$content,$now,$now,NULL)",
        ("$id", Guid.NewGuid().ToString()), ("$title", content.Trim().Split('\n', 2)[0].Trim()), ("$content", content.Trim()), ("$now", Now));
    public async Task UpdateNoteAsync(string id, string content)
    {
        await using var connection = await OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "UPDATE notes SET title=$title,content=$content,updated_at=$now WHERE id=$id AND deleted_at IS NULL";
        command.Parameters.AddWithValue("$id", id); command.Parameters.AddWithValue("$title", content.Trim().Split('\n', 2)[0].Trim());
        command.Parameters.AddWithValue("$content", content.Trim()); command.Parameters.AddWithValue("$now", Now);
        await command.ExecuteNonQueryAsync();
    }
    public Task AddTodoAsync(string title) => InsertAsync("INSERT INTO todos(id,title,completed,created_at,updated_at,deleted_at) VALUES($id,$title,0,$now,$now,NULL)",
        ("$id", Guid.NewGuid().ToString()), ("$title", title.Trim()), ("$now", Now));
    public Task ToggleTodoAsync(string id, bool completed) => UpdateAsync("UPDATE todos SET completed=$value,updated_at=$now WHERE id=$id AND deleted_at IS NULL", id, completed ? 1 : 0);
    public Task DeleteNoteAsync(string id) => SoftDeleteAsync("notes", id);
    public Task DeleteTodoAsync(string id) => SoftDeleteAsync("todos", id);

    public Task AddReminderAsync(string title, DateTimeOffset remindAt) => InsertAsync("INSERT INTO reminders(id,title,remind_at,status,created_at,updated_at,deleted_at) VALUES($id,$title,$at,'scheduled',$now,$now,NULL)",
        ("$id", Guid.NewGuid().ToString()), ("$title", title.Trim()), ("$at", remindAt.ToUnixTimeMilliseconds()), ("$now", Now));
    public Task DeleteReminderAsync(string id) => SoftDeleteAsync("reminders", id);
    public async Task<List<ReminderItem>> GetDueRemindersAsync(long now)
    {
        await using var connection = await OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT id,title,remind_at,status FROM reminders WHERE deleted_at IS NULL AND status='scheduled' AND remind_at <= $now ORDER BY remind_at";
        command.Parameters.AddWithValue("$now", now);
        await using var reader = await command.ExecuteReaderAsync();
        var reminders = new List<ReminderItem>();
        while (await reader.ReadAsync()) reminders.Add(new(reader.GetString(0), reader.GetString(1), reader.GetInt64(2), reader.GetString(3)));
        return reminders;
    }

    public async Task MarkReminderFiredAsync(string id)
    {
        await using var connection = await OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "UPDATE reminders SET status='fired',updated_at=$now WHERE id=$id AND status='scheduled' AND deleted_at IS NULL";
        command.Parameters.AddWithValue("$id", id); command.Parameters.AddWithValue("$now", Now);
        await command.ExecuteNonQueryAsync();
    }
    public Task AddSavedAsync(string title, string? url, string? path) => InsertAsync("INSERT INTO saved_items(id,title,url,path,created_at,updated_at,deleted_at) VALUES($id,$title,$url,$path,$now,$now,NULL)",
        ("$id", Guid.NewGuid().ToString()), ("$title", title.Trim()), ("$url", (object?)url ?? DBNull.Value), ("$path", (object?)path ?? DBNull.Value), ("$now", Now));
    public Task DeleteSavedAsync(string id) => SoftDeleteAsync("saved_items", id);

    public async Task<bool> GetClipboardCaptureEnabledAsync()
    {
        var settings = await GetEdgeSettingsAsync();
        return settings?["clipboardCaptureEnabled"]?.GetValue<bool>() ?? true;
    }

    public async Task<string> GetEdgePositionAsync()
    {
        var settings = await GetEdgeSettingsAsync();
        return settings?["position"]?.GetValue<string>() == "left" ? "left" : "right";
    }

    public async Task<int> GetAutoHideDelayAsync()
    {
        var settings = await GetEdgeSettingsAsync();
        return Math.Clamp(settings?["autoHideDelayMs"]?.GetValue<int>() ?? 450, 0, 10000);
    }

    public Task SetClipboardCaptureEnabledAsync(bool enabled) => UpdateEdgeSettingAsync("clipboardCaptureEnabled", JsonValue.Create(enabled));
    public Task SetEdgePositionAsync(string position) => UpdateEdgeSettingAsync("position", JsonValue.Create(position));
    public Task SetAutoHideDelayAsync(int delay) => UpdateEdgeSettingAsync("autoHideDelayMs", JsonValue.Create(Math.Clamp(delay, 0, 10000)));

    public async Task<List<BrowserBookmark>> GetBookmarksAsync()
    {
        await using var connection = await OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT value_json FROM settings WHERE key='edgemagic.browser-bookmarks'";
        var raw = await command.ExecuteScalarAsync() as string;
        if (raw is null) return [];
        try { return JsonSerializer.Deserialize<List<BrowserBookmark>>(raw, JsonSerializerOptions.Web) ?? []; }
        catch (JsonException) { return []; }
    }

    public async Task SaveBookmarksAsync(IReadOnlyCollection<BrowserBookmark> bookmarks)
    {
        await using var connection = await OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "INSERT INTO settings(key,value_json,updated_at) VALUES('edgemagic.browser-bookmarks',$value,$now) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at";
        command.Parameters.AddWithValue("$value", JsonSerializer.Serialize(bookmarks, JsonSerializerOptions.Web));
        command.Parameters.AddWithValue("$now", Now);
        await command.ExecuteNonQueryAsync();
    }

    private async Task<JsonObject?> GetEdgeSettingsAsync()
    {
        await using var connection = await OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT value_json FROM settings WHERE key='edgemagic.edge-settings'";
        var value = await command.ExecuteScalarAsync() as string;
        return value is null ? null : JsonNode.Parse(value) as JsonObject;
    }

    private async Task UpdateEdgeSettingAsync(string key, JsonNode? value)
    {
        await using var connection = await OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT value_json FROM settings WHERE key='edgemagic.edge-settings'";
        var raw = await command.ExecuteScalarAsync() as string;
        var settings = raw is null ? new JsonObject() : JsonNode.Parse(raw) as JsonObject ?? new JsonObject();
        settings[key] = value?.DeepClone();
        command.CommandText = "INSERT INTO settings(key,value_json,updated_at) VALUES('edgemagic.edge-settings',$value,$now) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at";
        command.Parameters.AddWithValue("$value", settings.ToJsonString());
        command.Parameters.AddWithValue("$now", Now);
        await command.ExecuteNonQueryAsync();
    }

    public async Task AddCaptureAsync(string text, string source = "manual")
    {
        text = text.Trim();
        var id = Guid.NewGuid().ToString();
        var now = Now;
        var uri = Uri.TryCreate(text, UriKind.Absolute, out var parsed) && parsed.Scheme is "http" or "https" ? parsed : null;
        var type = uri is null ? "text" : "link";
        var title = uri?.Host ?? text.Split('\n', 2)[0].Trim();
        await using var connection = await OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        await using (var command = connection.CreateCommand())
        {
            command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = "INSERT INTO items(id,type,title,content,url,source,metadata_json,created_at,updated_at,deleted_at) VALUES($id,$type,$title,$content,$url,$source,'{}',$now,$now,NULL)";
            command.Parameters.AddWithValue("$id", id); command.Parameters.AddWithValue("$type", type); command.Parameters.AddWithValue("$title", title);
            command.Parameters.AddWithValue("$content", uri is null ? text : ""); command.Parameters.AddWithValue("$url", uri is null ? DBNull.Value : text); command.Parameters.AddWithValue("$now", now);
            command.Parameters.AddWithValue("$source", source);
            await command.ExecuteNonQueryAsync();
        }
        await using (var command = connection.CreateCommand())
        {
            command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = "INSERT OR REPLACE INTO item_search(item_id,title,content,url,tags) VALUES($id,$title,$content,$url,'')";
            command.Parameters.AddWithValue("$id", id); command.Parameters.AddWithValue("$title", title); command.Parameters.AddWithValue("$content", uri is null ? text : ""); command.Parameters.AddWithValue("$url", uri?.ToString() ?? "");
            await command.ExecuteNonQueryAsync();
        }
        await transaction.CommitAsync();
    }

    public async Task AddFileCaptureAsync(string path, string filename, long size, string mimeType, string source = "drag-drop")
    {
        var id = Guid.NewGuid().ToString();
        var now = Now;
        var kind = mimeType.StartsWith("image/", StringComparison.OrdinalIgnoreCase) ? "image" : "file";
        await using var connection = await OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        await using (var command = connection.CreateCommand())
        {
            command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = "INSERT INTO items(id,type,title,path,source,metadata_json,created_at,updated_at,deleted_at) VALUES($id,$type,$title,$path,$source,$metadata,$now,$now,NULL)";
            command.Parameters.AddWithValue("$id", id); command.Parameters.AddWithValue("$type", kind); command.Parameters.AddWithValue("$title", filename);
            command.Parameters.AddWithValue("$path", path); command.Parameters.AddWithValue("$source", source);
            command.Parameters.AddWithValue("$metadata", JsonSerializer.Serialize(new { fileName = filename, fileSize = size, fileType = mimeType, captureMethod = source }));
            command.Parameters.AddWithValue("$now", now);
            await command.ExecuteNonQueryAsync();
        }
        await using (var command = connection.CreateCommand())
        {
            command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = "INSERT INTO attachments(id,item_id,kind,filename,mime_type,byte_size,local_path,created_at,updated_at,deleted_at) VALUES($id,$item,$kind,$filename,$mime,$size,$path,$now,$now,NULL)";
            command.Parameters.AddWithValue("$id", Guid.NewGuid().ToString()); command.Parameters.AddWithValue("$item", id); command.Parameters.AddWithValue("$kind", kind);
            command.Parameters.AddWithValue("$filename", filename); command.Parameters.AddWithValue("$mime", mimeType); command.Parameters.AddWithValue("$size", size);
            command.Parameters.AddWithValue("$path", path); command.Parameters.AddWithValue("$now", now);
            await command.ExecuteNonQueryAsync();
        }
        await using (var command = connection.CreateCommand())
        {
            command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = "INSERT OR REPLACE INTO item_search(item_id,title,content,url,tags) VALUES($id,$title,'','','')";
            command.Parameters.AddWithValue("$id", id); command.Parameters.AddWithValue("$title", filename);
            await command.ExecuteNonQueryAsync();
        }
        await transaction.CommitAsync();
    }

    public async Task AddClipboardImageCaptureAsync(byte[] imageBytes, string filename, string mimeType)
    {
        var directory = Path.Combine(Path.GetDirectoryName(_databasePath)!, "attachments");
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, $"{Guid.NewGuid():N}-{Path.GetFileName(filename)}");
        await File.WriteAllBytesAsync(path, imageBytes);
        try { await AddFileCaptureAsync(path, filename, imageBytes.LongLength, mimeType, "clipboard"); }
        catch
        {
            File.Delete(path);
            throw;
        }
    }

    public async Task DeleteCaptureAsync(string id)
    {
        await using var connection = await OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        await using (var command = connection.CreateCommand())
        {
            command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = "UPDATE items SET deleted_at=$now,updated_at=$now WHERE id=$id AND deleted_at IS NULL";
            command.Parameters.AddWithValue("$id", id); command.Parameters.AddWithValue("$now", Now);
            await command.ExecuteNonQueryAsync();
        }
        await using (var command = connection.CreateCommand())
        {
            command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = "DELETE FROM item_search WHERE item_id=$id";
            command.Parameters.AddWithValue("$id", id);
            await command.ExecuteNonQueryAsync();
        }
        await transaction.CommitAsync();
    }

    private static long Now => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    private async Task<SqliteConnection> OpenAsync()
    {
        var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        return connection;
    }
    private async Task InsertAsync(string sql, params (string Name, object Value)[] values)
    {
        await using var connection = await OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        foreach (var (name, value) in values) command.Parameters.AddWithValue(name, value);
        await command.ExecuteNonQueryAsync();
    }
    private async Task UpdateAsync(string sql, string id, int value)
    {
        await using var connection = await OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.Parameters.AddWithValue("$id", id); command.Parameters.AddWithValue("$value", value); command.Parameters.AddWithValue("$now", Now);
        await command.ExecuteNonQueryAsync();
    }
    private async Task SoftDeleteAsync(string table, string id)
    {
        await using var connection = await OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"UPDATE {table} SET deleted_at=$now,updated_at=$now WHERE id=$id AND deleted_at IS NULL";
        command.Parameters.AddWithValue("$id", id); command.Parameters.AddWithValue("$now", Now);
        await command.ExecuteNonQueryAsync();
    }
}

internal sealed record NoteItem(string Id, string Title, string Content, long UpdatedAt);
internal sealed record TodoItem(string Id, string Title, bool Completed);
internal sealed record ReminderItem(string Id, string Title, long RemindAt, string Status);
internal sealed record SavedItem(string Id, string Title, string? Url, string? Path);
internal sealed record CaptureItem(string Id, string Type, string? Title, string? Content, string? Url, string? Path, string Source, long CreatedAt);
internal sealed record BrowserBookmark(string Id, string Title, string Url, string Browser, string[] FolderPath, long CreatedAt, long UpdatedAt);
