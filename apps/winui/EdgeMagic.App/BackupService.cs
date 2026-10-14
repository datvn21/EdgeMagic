using Microsoft.Data.Sqlite;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace EdgeMagic.App;

internal sealed class BackupService(string connectionString)
{
    private const int ExportVersion = 1;
    private const int SchemaVersion = 1;
    private const string AppVersion = "0.1.0";
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = true
    };
    private static readonly JsonSerializerOptions CompactJsonOptions = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        WriteIndented = false
    };

    public async Task<string> ExportAsync()
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        var items = await ReadItemsAsync(connection);
        var attachments = await ReadAttachmentsAsync(connection);
        var (moduleRecords, deletedRecords) = await ReadProductivityAsync(connection);
        var settings = await ReadSettingsAsync(connection);
        var manifest = new JsonObject
        {
            ["app"] = "EdgeMagic",
            ["appVersion"] = AppVersion,
            ["schemaVersion"] = SchemaVersion,
            ["exportVersion"] = ExportVersion,
            ["exportedAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            ["includesClipboardHistory"] = items.Any(item => item["source"]?.GetValue<string>() == "clipboard"),
            ["includesAttachments"] = attachments.Count > 0,
            ["encrypted"] = false,
            ["warnings"] = new JsonArray(
                "Backup is not encrypted.",
                "Clipboard history may be included.",
                "Attachment entries are manifest records only; file contents are not copied.",
                "Provider tokens and OAuth secrets are never exported.")
        };
        var data = new JsonObject
        {
            ["items"] = ToArray(items),
            ["tags"] = new JsonArray(),
            ["moduleRecords"] = moduleRecords,
            ["deletedModuleRecords"] = deletedRecords,
            ["settings"] = settings,
            ["attachments"] = ToArray(attachments)
        };
        var payload = new JsonObject { ["manifest"] = manifest, ["data"] = data };
        var checksum = Checksum(payload);
        payload["checksum"] = checksum;
        return payload.ToJsonString(JsonOptions);
    }

    public async Task<BackupImportSummary> ImportAsync(string raw)
    {
        JsonObject backup;
        try { backup = JsonNode.Parse(raw) as JsonObject ?? throw new InvalidDataException("Backup root must be a JSON object."); }
        catch (JsonException ex) { throw new InvalidDataException("Backup JSON is invalid.", ex); }

        var manifest = backup["manifest"] as JsonObject;
        var data = backup["data"] as JsonObject;
        if (manifest?["app"]?.GetValue<string>() != "EdgeMagic" || manifest["exportVersion"]?.GetValue<int>() != ExportVersion || data is null)
            throw new InvalidDataException("Unsupported EdgeMagic backup format.");
        if (backup["checksum"] is JsonValue checksumNode && checksumNode.TryGetValue<string>(out var checksum) && checksum != Checksum(backup))
            throw new InvalidDataException("Backup checksum is invalid or the file is corrupted.");

        var items = data["items"] as JsonArray ?? [];
        var attachments = data["attachments"] as JsonArray ?? [];
        var modules = data["moduleRecords"] as JsonObject ?? new JsonObject();
        ValidateBackup(items, attachments, modules);

        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        foreach (var item in items.OfType<JsonObject>()) await UpsertItemAsync(connection, (SqliteTransaction)transaction, item);
        foreach (var attachment in attachments.OfType<JsonObject>()) await UpsertAttachmentAsync(connection, (SqliteTransaction)transaction, attachment);
        foreach (var kind in new[] { "notes", "todos", "reminders", "saved" })
        {
            foreach (var record in (modules[kind] as JsonArray ?? []).OfType<JsonObject>())
                await UpsertModuleRecordAsync(connection, (SqliteTransaction)transaction, kind, record);
        }
        if (data["settings"] is JsonObject importedSettings)
            await UpsertSettingsAsync(connection, (SqliteTransaction)transaction, StripSensitive(importedSettings));
        await transaction.CommitAsync();

        return new(items.Count, attachments.Count, modules.Sum(kind => (kind.Value as JsonArray)?.Count ?? 0));
    }

    private static async Task<List<JsonObject>> ReadItemsAsync(SqliteConnection connection)
    {
        var result = new List<JsonObject>();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT id,type,title,content,url,path,source,metadata_json,created_at,updated_at FROM items WHERE deleted_at IS NULL ORDER BY created_at";
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            JsonObject metadata;
            try { metadata = JsonNode.Parse(reader.GetString(7)) as JsonObject ?? new JsonObject(); }
            catch (JsonException) { metadata = new JsonObject(); }
            var item = new JsonObject
            {
                ["id"] = reader.GetString(0), ["type"] = reader.GetString(1),
                ["title"] = OptionalString(reader, 2), ["content"] = OptionalString(reader, 3),
                ["url"] = OptionalString(reader, 4), ["path"] = OptionalString(reader, 5),
                ["source"] = reader.GetString(6), ["metadata"] = metadata,
                ["createdAt"] = reader.GetInt64(8), ["updatedAt"] = reader.GetInt64(9)
            };
            result.Add(item);
        }
        return result;
    }

    private static async Task<List<JsonObject>> ReadAttachmentsAsync(SqliteConnection connection)
    {
        var result = new List<JsonObject>();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT a.id,a.item_id,a.kind,a.filename,a.byte_size,a.content_hash,a.local_path FROM attachments a JOIN items i ON i.id=a.item_id WHERE a.deleted_at IS NULL AND i.deleted_at IS NULL ORDER BY a.created_at";
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            result.Add(new JsonObject
            {
                ["id"] = reader.GetString(0), ["itemId"] = reader.GetString(1), ["kind"] = reader.GetString(2),
                ["filename"] = reader.GetString(3), ["byteSize"] = OptionalInt64(reader, 4),
                ["contentHash"] = OptionalString(reader, 5), ["localPath"] = reader.GetString(6)
            });
        return result;
    }

    private static async Task<(JsonObject State, JsonArray Deleted)> ReadProductivityAsync(SqliteConnection connection)
    {
        var state = new JsonObject();
        var deleted = new JsonArray();
        foreach (var kind in new[] { "notes", "todos", "reminders", "saved" })
        {
            var records = new JsonArray();
            var columns = kind switch
            {
                "notes" => "id,title,content,source_item_id,created_at,updated_at,deleted_at",
                "todos" => "id,title,completed,source_item_id,created_at,updated_at,deleted_at",
                "reminders" => "id,title,remind_at,status,source_item_id,created_at,updated_at,deleted_at",
                _ => "id,title,url,path,source_item_id,created_at,updated_at,deleted_at"
            };
            var table = kind == "saved" ? "saved_items" : kind;
            await using var command = connection.CreateCommand();
            command.CommandText = $"SELECT {columns} FROM {table} ORDER BY updated_at";
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var record = ReadModuleRecord(kind, reader);
                records.Add(record);
                if (record["deletedAt"] is not null)
                    deleted.Add(new JsonObject { ["kind"] = kind, ["record"] = record.DeepClone() });
            }
            state[kind] = records;
        }
        return (state, deleted);
    }

    private static JsonObject ReadModuleRecord(string kind, SqliteDataReader reader)
    {
        if (kind == "notes") return new JsonObject
        {
            ["id"] = reader.GetString(0), ["title"] = reader.GetString(1), ["content"] = reader.GetString(2),
            ["sourceItemId"] = OptionalString(reader, 3), ["createdAt"] = reader.GetInt64(4), ["updatedAt"] = reader.GetInt64(5), ["deletedAt"] = OptionalInt64(reader, 6)
        };
        if (kind == "todos") return new JsonObject
        {
            ["id"] = reader.GetString(0), ["title"] = reader.GetString(1), ["completed"] = reader.GetInt64(2) != 0,
            ["sourceItemId"] = OptionalString(reader, 3), ["createdAt"] = reader.GetInt64(4), ["updatedAt"] = reader.GetInt64(5), ["deletedAt"] = OptionalInt64(reader, 6)
        };
        if (kind == "reminders") return new JsonObject
        {
            ["id"] = reader.GetString(0), ["title"] = reader.GetString(1), ["remindAt"] = reader.GetInt64(2), ["status"] = reader.GetString(3),
            ["sourceItemId"] = OptionalString(reader, 4), ["createdAt"] = reader.GetInt64(5), ["updatedAt"] = reader.GetInt64(6), ["deletedAt"] = OptionalInt64(reader, 7)
        };
        return new JsonObject
        {
            ["id"] = reader.GetString(0), ["title"] = reader.GetString(1), ["url"] = OptionalString(reader, 2), ["path"] = OptionalString(reader, 3),
            ["sourceItemId"] = OptionalString(reader, 4), ["createdAt"] = reader.GetInt64(5), ["updatedAt"] = reader.GetInt64(6), ["deletedAt"] = OptionalInt64(reader, 7)
        };
    }

    private static async Task<JsonObject> ReadSettingsAsync(SqliteConnection connection)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT value_json FROM settings WHERE key='edgemagic.edge-settings'";
        var raw = await command.ExecuteScalarAsync() as string;
        try { return raw is null ? new JsonObject() : StripSensitive(JsonNode.Parse(raw) as JsonObject ?? new JsonObject()); }
        catch (JsonException) { return new JsonObject(); }
    }

    private static void ValidateBackup(JsonArray items, JsonArray attachments, JsonObject modules)
    {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in items)
        {
            if (item is not JsonObject obj || string.IsNullOrWhiteSpace(ReadString(obj, "id")) ||
                string.IsNullOrWhiteSpace(ReadString(obj, "type")) || string.IsNullOrWhiteSpace(ReadString(obj, "source")))
                throw new InvalidDataException("Backup contains an item with missing required fields.");
            ids.Add(ReadString(obj, "id")!);
        }
        foreach (var attachment in attachments)
            if (attachment is not JsonObject obj || !ids.Contains(ReadString(obj, "itemId")!))
                throw new InvalidDataException("Backup contains an attachment without a matching item.");
        foreach (var kind in new[] { "notes", "todos", "reminders", "saved" })
            foreach (var record in (modules[kind] as JsonArray ?? []))
                if (record is not JsonObject obj || string.IsNullOrWhiteSpace(ReadString(obj, "id")))
                    throw new InvalidDataException($"Backup contains an invalid {kind} record.");
    }

    private static async Task UpsertItemAsync(SqliteConnection connection, SqliteTransaction transaction, JsonObject item)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO items(id,type,title,content,url,path,source,metadata_json,created_at,updated_at,deleted_at)
            VALUES($id,$type,$title,$content,$url,$path,$source,$metadata,$created,$updated,$deleted)
            ON CONFLICT(id) DO UPDATE SET type=excluded.type,title=excluded.title,content=excluded.content,url=excluded.url,path=excluded.path,
              source=excluded.source,metadata_json=excluded.metadata_json,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
            """;
        command.Parameters.AddWithValue("$id", ReadString(item, "id")!); command.Parameters.AddWithValue("$type", ReadString(item, "type")!);
        command.Parameters.AddWithValue("$title", DbString(item, "title")); command.Parameters.AddWithValue("$content", DbString(item, "content"));
        command.Parameters.AddWithValue("$url", DbString(item, "url")); command.Parameters.AddWithValue("$path", DbString(item, "path"));
        command.Parameters.AddWithValue("$source", ReadString(item, "source")!); command.Parameters.AddWithValue("$metadata", item["metadata"]?.ToJsonString(CompactJsonOptions) ?? "{}");
        command.Parameters.AddWithValue("$created", ReadLong(item, "createdAt", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()));
        command.Parameters.AddWithValue("$updated", ReadLong(item, "updatedAt", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds())); command.Parameters.AddWithValue("$deleted", DbLong(item, "deletedAt"));
        await command.ExecuteNonQueryAsync();
        await using var search = connection.CreateCommand();
        search.Transaction = transaction;
        search.CommandText = "INSERT OR REPLACE INTO item_search(item_id,title,content,url,tags) VALUES($id,$title,$content,$url,'')";
        search.Parameters.AddWithValue("$id", ReadString(item, "id")!); search.Parameters.AddWithValue("$title", DbString(item, "title") ?? "");
        search.Parameters.AddWithValue("$content", DbString(item, "content") ?? ""); search.Parameters.AddWithValue("$url", DbString(item, "url") ?? "");
        await search.ExecuteNonQueryAsync();
    }

    private static async Task UpsertAttachmentAsync(SqliteConnection connection, SqliteTransaction transaction, JsonObject attachment)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO attachments(id,item_id,kind,filename,mime_type,byte_size,local_path,content_hash,created_at,updated_at,deleted_at)
            VALUES($id,$item,$kind,$filename,$mime,$size,$path,$hash,$now,$now,NULL)
            ON CONFLICT(id) DO UPDATE SET item_id=excluded.item_id,kind=excluded.kind,filename=excluded.filename,
              byte_size=excluded.byte_size,local_path=excluded.local_path,content_hash=excluded.content_hash,updated_at=excluded.updated_at,deleted_at=NULL
            """;
        command.Parameters.AddWithValue("$id", ReadString(attachment, "id")!); command.Parameters.AddWithValue("$item", ReadString(attachment, "itemId")!);
        command.Parameters.AddWithValue("$kind", ReadString(attachment, "kind") ?? "file"); command.Parameters.AddWithValue("$filename", ReadString(attachment, "filename") ?? "attachment");
        command.Parameters.AddWithValue("$mime", DbString(attachment, "mimeType")); command.Parameters.AddWithValue("$size", DbLong(attachment, "byteSize"));
        command.Parameters.AddWithValue("$path", ReadString(attachment, "localPath") ?? ""); command.Parameters.AddWithValue("$hash", DbString(attachment, "contentHash"));
        command.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        await command.ExecuteNonQueryAsync();
    }

    private static async Task UpsertModuleRecordAsync(SqliteConnection connection, SqliteTransaction transaction, string kind, JsonObject record)
    {
        var id = ReadString(record, "id")!;
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var title = ReadString(record, "title") ?? ReadString(record, "url") ?? ReadString(record, "path") ?? "Saved item";
        var created = ReadLong(record, "createdAt", now);
        var updated = ReadLong(record, "updatedAt", now);
        var deleted = DbLong(record, "deletedAt");
        await using (var module = connection.CreateCommand())
        {
            module.Transaction = transaction;
            module.CommandText = "INSERT INTO module_records(id,kind,payload_json,created_at,updated_at,deleted_at) VALUES($id,$kind,$payload,$created,$updated,$deleted) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,payload_json=excluded.payload_json,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at";
            module.Parameters.AddWithValue("$id", id); module.Parameters.AddWithValue("$kind", kind); module.Parameters.AddWithValue("$payload", record.ToJsonString(CompactJsonOptions));
            module.Parameters.AddWithValue("$created", created); module.Parameters.AddWithValue("$updated", updated); module.Parameters.AddWithValue("$deleted", deleted);
            await module.ExecuteNonQueryAsync();
        }
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        var table = kind == "saved" ? "saved_items" : kind;
        switch (kind)
        {
            case "notes":
                command.CommandText = "INSERT INTO notes(id,title,content,source_item_id,created_at,updated_at,deleted_at) VALUES($id,$title,$content,$source,$created,$updated,$deleted) ON CONFLICT(id) DO UPDATE SET title=excluded.title,content=excluded.content,source_item_id=excluded.source_item_id,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at";
                command.Parameters.AddWithValue("$content", ReadString(record, "content") ?? "");
                break;
            case "todos":
                command.CommandText = "INSERT INTO todos(id,title,completed,source_item_id,created_at,updated_at,deleted_at) VALUES($id,$title,$completed,$source,$created,$updated,$deleted) ON CONFLICT(id) DO UPDATE SET title=excluded.title,completed=excluded.completed,source_item_id=excluded.source_item_id,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at";
                command.Parameters.AddWithValue("$completed", ReadBool(record, "completed") ? 1 : 0);
                break;
            case "reminders":
                command.CommandText = "INSERT INTO reminders(id,title,remind_at,status,source_item_id,created_at,updated_at,deleted_at) VALUES($id,$title,$at,$status,$source,$created,$updated,$deleted) ON CONFLICT(id) DO UPDATE SET title=excluded.title,remind_at=excluded.remind_at,status=excluded.status,source_item_id=excluded.source_item_id,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at";
                command.Parameters.AddWithValue("$at", ReadLong(record, "remindAt", now)); command.Parameters.AddWithValue("$status", ReadString(record, "status") == "fired" ? "fired" : "scheduled");
                break;
            default:
                command.CommandText = "INSERT INTO saved_items(id,title,url,path,source_item_id,created_at,updated_at,deleted_at) VALUES($id,$title,$url,$path,$source,$created,$updated,$deleted) ON CONFLICT(id) DO UPDATE SET title=excluded.title,url=excluded.url,path=excluded.path,source_item_id=excluded.source_item_id,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at";
                command.Parameters.AddWithValue("$url", DbString(record, "url")); command.Parameters.AddWithValue("$path", DbString(record, "path"));
                break;
        }
        command.Parameters.AddWithValue("$id", id); command.Parameters.AddWithValue("$title", title);
        command.Parameters.AddWithValue("$source", DbString(record, "sourceItemId")); command.Parameters.AddWithValue("$created", created);
        command.Parameters.AddWithValue("$updated", updated); command.Parameters.AddWithValue("$deleted", deleted);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task UpsertSettingsAsync(SqliteConnection connection, SqliteTransaction transaction, JsonObject settings)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "INSERT INTO settings(key,value_json,updated_at) VALUES('edgemagic.edge-settings',$value,$now) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at";
        command.Parameters.AddWithValue("$value", settings.ToJsonString(CompactJsonOptions)); command.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        await command.ExecuteNonQueryAsync();
    }

    private static JsonObject StripSensitive(JsonObject value)
    {
        var result = new JsonObject();
        foreach (var (key, node) in value)
            if (!System.Text.RegularExpressions.Regex.IsMatch(key, "token|secret|oauth|credential|password", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                result[key] = node?.DeepClone();
        return result;
    }

    private static string Checksum(JsonObject backup)
    {
        var payload = backup["manifest"] is JsonNode manifest && backup["data"] is JsonNode data
            ? new JsonObject { ["manifest"] = manifest.DeepClone(), ["data"] = data.DeepClone() }
            : backup;
        var json = payload.ToJsonString(CompactJsonOptions);
        uint first = 0x811c9dc5;
        uint second = 0x9e3779b9;
        unchecked
        {
            foreach (var character in json)
            {
                first = (first ^ character) * 0x01000193;
                second = (second ^ character) * 0x85ebca6b;
            }
        }
        return $"{first:x8}{second:x8}";
    }

    private static string? ReadString(JsonObject value, string key)
    {
        try { return value[key]?.GetValue<string>(); } catch (InvalidOperationException) { return null; }
    }
    private static string? DbString(JsonObject value, string key) => ReadString(value, key) is { } text ? text : null;
    private static long ReadLong(JsonObject value, string key, long fallback)
    {
        try { return value[key]?.GetValue<long>() ?? fallback; } catch (InvalidOperationException) { return fallback; }
    }
    private static bool ReadBool(JsonObject value, string key)
    {
        try { return value[key]?.GetValue<bool>() ?? false; } catch (InvalidOperationException) { return false; }
    }
    private static object DbLong(JsonObject value, string key) => value[key] is null ? DBNull.Value : ReadLong(value, key, 0);
    private static long? OptionalInt64(SqliteDataReader reader, int ordinal) => reader.IsDBNull(ordinal) ? null : reader.GetInt64(ordinal);
    private static string? OptionalString(SqliteDataReader reader, int ordinal) => reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
    private static JsonArray ToArray(IEnumerable<JsonObject> nodes) => new(nodes.Select(node => (JsonNode?)node).ToArray());
}

internal sealed record BackupImportSummary(int Items, int Attachments, int ModuleRecords);
