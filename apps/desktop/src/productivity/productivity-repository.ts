import { executeDesktop, hasDesktopDatabase, queryDesktop, readDesktopJson, writeDesktopJson } from "../data/desktop-store.js";
import type {
  NoteRecord,
  ProductivityKind,
  ProductivityRecord,
  ProductivityState,
  ReminderRecord,
  SavedRecord,
  TodoRecord
} from "./use-productivity-workspace.js";

const browserStorageKey = "edgemagic.productivity-workspace";
export class ProductivityRepository {
  async load(): Promise<ProductivityState> {
    if (!hasDesktopDatabase()) {
      return normalizeState(await readDesktopJson(browserStorageKey, emptyState()));
    }

    const [notes, todos, reminders, saved] = await Promise.all([
      queryDesktop<NoteRow>("SELECT * FROM notes ORDER BY updated_at DESC"),
      queryDesktop<TodoRow>("SELECT * FROM todos ORDER BY updated_at DESC"),
      queryDesktop<ReminderRow>("SELECT * FROM reminders ORDER BY updated_at DESC"),
      queryDesktop<SavedRow>("SELECT * FROM saved_items ORDER BY updated_at DESC")
    ]);
    return {
      notes: notes.map(mapNote),
      todos: todos.map(mapTodo),
      reminders: reminders.map(mapReminder),
      saved: saved.map(mapSaved)
    };
  }

  async upsert(kind: ProductivityKind, record: ProductivityRecord): Promise<void> {
    if (!hasDesktopDatabase()) {
      return;
    }
    const table = tableFor(kind);
    const values = valuesFor(kind, record);
    await executeDesktop(
      `INSERT INTO ${table} (${values.columns.join(", ")}) VALUES (${values.columns.map(() => "?").join(", ")})
       ON CONFLICT(id) DO UPDATE SET ${values.columns.slice(1).map((column) => `${column} = excluded.${column}`).join(", ")}`,
      values.values
    );
  }

  async remove(kind: ProductivityKind, id: string): Promise<void> {
    if (hasDesktopDatabase()) {
      await executeDesktop(`DELETE FROM ${tableFor(kind)} WHERE id = ?`, [id]);
    }
  }

  async persistBrowser(state: ProductivityState): Promise<void> {
    if (!hasDesktopDatabase()) {
      await writeDesktopJson(browserStorageKey, state);
    }
  }
}

interface NoteRow { id: string; title: string; content: string; source_item_id: string | null; created_at: number; updated_at: number; deleted_at: number | null }
interface TodoRow { id: string; title: string; completed: number; source_item_id: string | null; created_at: number; updated_at: number; deleted_at: number | null }
interface ReminderRow { id: string; title: string; remind_at: number; status: ReminderRecord["status"]; source_item_id: string | null; created_at: number; updated_at: number; deleted_at: number | null }
interface SavedRow { id: string; title: string; url: string | null; path: string | null; source_item_id: string | null; created_at: number; updated_at: number; deleted_at: number | null }

function tableFor(kind: ProductivityKind): string {
  return kind === "saved" ? "saved_items" : kind;
}

function valuesFor(kind: ProductivityKind, record: ProductivityRecord): { columns: string[]; values: unknown[] } {
  if (kind === "notes") {
    const note = record as NoteRecord;
    return { columns: ["id", "title", "content", "source_item_id", "created_at", "updated_at", "deleted_at"], values: [note.id, note.title, note.content, note.sourceItemId ?? null, note.createdAt, note.updatedAt, note.deletedAt ?? null] };
  }
  if (kind === "todos") {
    const todo = record as TodoRecord;
    return { columns: ["id", "title", "completed", "source_item_id", "created_at", "updated_at", "deleted_at"], values: [todo.id, todo.title, todo.completed ? 1 : 0, todo.sourceItemId ?? null, todo.createdAt, todo.updatedAt, todo.deletedAt ?? null] };
  }
  if (kind === "reminders") {
    const reminder = record as ReminderRecord;
    return { columns: ["id", "title", "remind_at", "status", "source_item_id", "created_at", "updated_at", "deleted_at"], values: [reminder.id, reminder.title, reminder.remindAt, reminder.status, reminder.sourceItemId ?? null, reminder.createdAt, reminder.updatedAt, reminder.deletedAt ?? null] };
  }
  const saved = record as SavedRecord;
  return { columns: ["id", "title", "url", "path", "source_item_id", "created_at", "updated_at", "deleted_at"], values: [saved.id, saved.title, saved.url ?? null, saved.path ?? null, saved.sourceItemId ?? null, saved.createdAt, saved.updatedAt, saved.deletedAt ?? null] };
}

function mapNote(row: NoteRow): NoteRecord { return { id: row.id, title: row.title, content: row.content, ...(row.source_item_id ? { sourceItemId: row.source_item_id } : {}), createdAt: row.created_at, updatedAt: row.updated_at, ...(row.deleted_at !== null ? { deletedAt: row.deleted_at } : {}) }; }
function mapTodo(row: TodoRow): TodoRecord { return { id: row.id, title: row.title, completed: row.completed === 1, ...(row.source_item_id ? { sourceItemId: row.source_item_id } : {}), createdAt: row.created_at, updatedAt: row.updated_at, ...(row.deleted_at !== null ? { deletedAt: row.deleted_at } : {}) }; }
function mapReminder(row: ReminderRow): ReminderRecord { return { id: row.id, title: row.title, remindAt: row.remind_at, status: row.status, ...(row.source_item_id ? { sourceItemId: row.source_item_id } : {}), createdAt: row.created_at, updatedAt: row.updated_at, ...(row.deleted_at !== null ? { deletedAt: row.deleted_at } : {}) }; }
function mapSaved(row: SavedRow): SavedRecord { return { id: row.id, title: row.title, ...(row.url !== null ? { url: row.url } : {}), ...(row.path !== null ? { path: row.path } : {}), ...(row.source_item_id ? { sourceItemId: row.source_item_id } : {}), createdAt: row.created_at, updatedAt: row.updated_at, ...(row.deleted_at !== null ? { deletedAt: row.deleted_at } : {}) }; }

function emptyState(): ProductivityState { return { notes: [], todos: [], reminders: [], saved: [] }; }
function normalizeState(state: Partial<ProductivityState>): ProductivityState { return { notes: Array.isArray(state.notes) ? state.notes : [], todos: Array.isArray(state.todos) ? state.todos : [], reminders: Array.isArray(state.reminders) ? state.reminders : [], saved: Array.isArray(state.saved) ? state.saved : [] }; }
