using Microsoft.Data.Sqlite;
using System.Diagnostics;

namespace EdgeMagic.App;

internal sealed class ProductivityStore
{
    private readonly string _connectionString;

    public ProductivityStore()
    {
        var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "app.edgemagic.desktop");
        Directory.CreateDirectory(directory);
        _connectionString = new SqliteConnectionStringBuilder { DataSource = Path.Combine(directory, "edgemagic.db") }.ToString();
    }

    public async Task InitializeAsync()
    {
        using var legacyApp = Process.GetProcessesByName("edgemagic").FirstOrDefault();
        if (legacyApp is not null)
            throw new InvalidOperationException("Close the existing EdgeMagic app before using this migration build.");

        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, source_item_id TEXT,
                created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
            CREATE TABLE IF NOT EXISTS todos (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, source_item_id TEXT,
                created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_todos_updated_at ON todos(updated_at);
            """;
        await command.ExecuteNonQueryAsync();
    }

    public async Task<(List<NoteItem> Notes, List<TodoItem> Todos)> LoadAsync()
    {
        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        var notes = new List<NoteItem>();
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT id, title, content FROM notes WHERE deleted_at IS NULL ORDER BY updated_at DESC";
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync()) notes.Add(new(reader.GetString(0), reader.GetString(1), reader.GetString(2)));
        }
        var todos = new List<TodoItem>();
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT id, title, completed FROM todos WHERE deleted_at IS NULL ORDER BY updated_at DESC";
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync()) todos.Add(new(reader.GetString(0), reader.GetString(1), reader.GetInt64(2) != 0));
        }
        return (notes, todos);
    }

    public Task AddNoteAsync(string content) => InsertAsync("""
        INSERT INTO notes(id, title, content, created_at, updated_at, deleted_at)
        VALUES($id, $title, $content, $now, $now, NULL)
        """, new() { ["$id"] = Guid.NewGuid().ToString(), ["$title"] = content.Trim().Split('\n', 2)[0].Trim(), ["$content"] = content, ["$now"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });

    public Task AddTodoAsync(string title) => InsertAsync("""
        INSERT INTO todos(id, title, completed, created_at, updated_at, deleted_at)
        VALUES($id, $title, 0, $now, $now, NULL)
        """, new() { ["$id"] = Guid.NewGuid().ToString(), ["$title"] = title.Trim(), ["$now"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });

    public Task ToggleTodoAsync(string id, bool completed) => UpdateAsync("UPDATE todos SET completed = $completed, updated_at = $now WHERE id = $id AND deleted_at IS NULL", id, completed ? 1 : 0);
    public Task DeleteNoteAsync(string id) => SoftDeleteAsync("notes", id);
    public Task DeleteTodoAsync(string id) => SoftDeleteAsync("todos", id);

    private async Task InsertAsync(string sql, Dictionary<string, object> values)
    {
        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        foreach (var (key, value) in values) command.Parameters.AddWithValue(key, value);
        await command.ExecuteNonQueryAsync();
    }

    private async Task UpdateAsync(string sql, string id, int completed)
    {
        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$completed", completed);
        command.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        await command.ExecuteNonQueryAsync();
    }

    private async Task SoftDeleteAsync(string table, string id)
    {
        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"UPDATE {table} SET deleted_at = $now, updated_at = $now WHERE id = $id AND deleted_at IS NULL";
        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        await command.ExecuteNonQueryAsync();
    }
}

internal sealed record NoteItem(string Id, string Title, string Content);
internal sealed record TodoItem(string Id, string Title, bool Completed);
