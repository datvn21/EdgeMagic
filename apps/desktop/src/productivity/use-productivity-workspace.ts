import type { CapturedRecord } from "../capture/use-capture-inbox.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NotificationPlatform } from "@edgemagic/module-api";
import { ProductivityRepository } from "./productivity-repository.js";

export interface NoteRecord {
  id: string;
  title: string;
  content: string;
  sourceItemId?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface TodoRecord {
  id: string;
  title: string;
  completed: boolean;
  sourceItemId?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface ReminderRecord {
  id: string;
  title: string;
  remindAt: number;
  sourceItemId?: string;
  status: "scheduled" | "fired";
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface SavedRecord {
  id: string;
  title: string;
  url?: string;
  path?: string;
  sourceItemId?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface ProductivityState {
  notes: NoteRecord[];
  todos: TodoRecord[];
  reminders: ReminderRecord[];
  saved: SavedRecord[];
}

export type ProductivityKind = keyof ProductivityState;
export type ProductivityRecord = NoteRecord | TodoRecord | ReminderRecord | SavedRecord;
export interface DeletedProductivityRecord {
  kind: ProductivityKind;
  record: ProductivityRecord;
}

const defaultState: ProductivityState = {
  notes: [],
  todos: [],
  reminders: [],
  saved: []
};
const maxReminderTimeoutDelayMs = 2_147_483_647;

export function useProductivityWorkspace(options: { notifications?: NotificationPlatform } = {}) {
  const [state, setState] = useState<ProductivityState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const repository = useMemo(() => new ProductivityRepository(), []);
  const stateRef = useRef(state);
  const reminderTimers = useRef(new Map<string, number>());
  const notificationsRef = useRef(options.notifications);
  const activeState = {
    notes: state.notes.filter((note) => note.deletedAt === undefined),
    todos: state.todos.filter((todo) => todo.deletedAt === undefined),
    reminders: state.reminders.filter((reminder) => reminder.deletedAt === undefined),
    saved: state.saved.filter((saved) => saved.deletedAt === undefined)
  };
  const deletedRecords = collectDeletedRecords(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    notificationsRef.current = options.notifications;
  }, [options.notifications]);

  useEffect(() => {
    let mounted = true;
    void repository.load().then((loaded) => {
      if (mounted) {
        setState(normalizeState(loaded));
        setHydrated(true);
      }
    });
    return () => { mounted = false; };
  }, [repository]);

  useEffect(() => {
    if (hydrated) void repository.persistBrowser(state);
  }, [hydrated, repository, state]);

  const cancelReminderNotification = useCallback((id: string) => {
    const timer = reminderTimers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      reminderTimers.current.delete(id);
    }
  }, []);

  const markReminderFired = useCallback((reminder: ReminderRecord) => {
    const fired = { ...reminder, status: "fired" as const, updatedAt: Date.now() };
    stateRef.current = {
      ...stateRef.current,
      reminders: stateRef.current.reminders.map((item) => item.id === reminder.id ? fired : item)
    };
    setState((current) => ({
      ...current,
      reminders: current.reminders.map((item) => item.id === reminder.id ? fired : item)
    }));
    void repository.upsert("reminders", fired);
  }, [repository]);

  const sendReminderNotification = useCallback((id: string) => {
    reminderTimers.current.delete(id);
    const reminder = stateRef.current.reminders.find((item) => item.id === id);
    if (!reminder || reminder.deletedAt !== undefined || reminder.status !== "scheduled") return;

    if (reminder.remindAt > Date.now()) {
      scheduleReminderNotification(reminder);
      return;
    }

    markReminderFired(reminder);
    const request = { id: reminder.id, title: reminder.title, body: "EdgeMagic reminder", at: reminder.remindAt };
    const notifications = notificationsRef.current;
    if (notifications) {
      void notifications.send(request);
      return;
    }
    void sendBrowserNotification(request);
  }, [markReminderFired]);

  const scheduleReminderNotification = useCallback((reminder: ReminderRecord) => {
    cancelReminderNotification(reminder.id);
    if (reminder.deletedAt !== undefined || reminder.status !== "scheduled") return;

    const delay = Math.max(0, reminder.remindAt - Date.now());
    const timer = window.setTimeout(
      () => sendReminderNotification(reminder.id),
      Math.min(delay, maxReminderTimeoutDelayMs)
    );
    reminderTimers.current.set(reminder.id, timer);
  }, [cancelReminderNotification, sendReminderNotification]);

  useEffect(() => {
    if (!hydrated) return;
    for (const reminder of stateRef.current.reminders) {
      scheduleReminderNotification(reminder);
    }
    return () => {
      for (const timer of reminderTimers.current.values()) window.clearTimeout(timer);
      reminderTimers.current.clear();
    };
  }, [hydrated, scheduleReminderNotification]);

  const workspace = {
    ...activeState,
    allRecords: state,
    deletedRecords,
    replaceState(nextState: ProductivityState) {
      const normalized = normalizeState(nextState);
      setState(normalized);
      stateRef.current = normalized;
      for (const timer of reminderTimers.current.values()) window.clearTimeout(timer);
      reminderTimers.current.clear();
      for (const kind of Object.keys(normalized) as ProductivityKind[]) {
        for (const record of normalized[kind]) void repository.upsert(kind, record);
      }
      for (const reminder of normalized.reminders) scheduleReminderNotification(reminder);
    },
    softDelete(kind: ProductivityKind, id: string) {
      const now = Date.now();
      if (kind === "reminders") cancelReminderNotification(id);
      setState((current) => {
        const next = {
          ...current,
        [kind]: current[kind].map((record) =>
          record.id === id ? { ...record, deletedAt: now, updatedAt: now } : record
        )
        };
        stateRef.current = next;
        return next;
      });
      const record = state[kind].find((item) => item.id === id);
      if (record) void repository.upsert(kind, { ...record, deletedAt: now, updatedAt: now });
    },
    restoreDeleted(kind: ProductivityKind, id: string) {
      const now = Date.now();
      let restoredReminder: ReminderRecord | undefined;
      setState((current) => {
        const next = {
          ...current,
          [kind]: current[kind].map((record) => {
            if (record.id !== id) {
              return record;
            }
            const { deletedAt: _deletedAt, ...restored } = record;
            if (kind === "reminders") {
              restoredReminder = { ...restored, updatedAt: now, status: "scheduled" } as ReminderRecord;
              return restoredReminder;
            }
            return { ...restored, updatedAt: now };
          })
        };
        stateRef.current = next;
        return next;
      });
      const record = state[kind].find((item) => item.id === id);
      if (record) {
        const { deletedAt: _deletedAt, ...restored } = record;
        const nextRecord = kind === "reminders" ? { ...restored, updatedAt: now, status: "scheduled" as const } : { ...restored, updatedAt: now };
        void repository.upsert(kind, nextRecord);
        if (kind === "reminders") scheduleReminderNotification(nextRecord as ReminderRecord);
      } else if (restoredReminder) {
        scheduleReminderNotification(restoredReminder);
      }
    },
    purgeDeleted(kind: ProductivityKind, id: string) {
      if (kind === "reminders") cancelReminderNotification(id);
      setState((current) => {
        const next = { ...current, [kind]: current[kind].filter((record) => record.id !== id) };
        stateRef.current = next;
        return next;
      });
      void repository.remove(kind, id);
    },
    createNote(input: { title?: string; content: string; sourceItemId?: string }) {
      const now = Date.now();
      const note: NoteRecord = {
        id: crypto.randomUUID(),
        title: input.title?.trim() || firstLine(input.content) || "Untitled note",
        content: input.content,
        ...(input.sourceItemId !== undefined ? { sourceItemId: input.sourceItemId } : {}),
        createdAt: now,
        updatedAt: now
      };
      setState((current) => ({ ...current, notes: [note, ...current.notes] }));
      void repository.upsert("notes", note);
      return note;
    },
    updateNote(id: string, patch: Partial<Pick<NoteRecord, "title" | "content">>) {
      const now = Date.now();
      setState((current) => ({
        ...current,
        notes: current.notes.map((note) => (note.id === id ? { ...note, ...patch, updatedAt: now } : note))
      }));
      const note = state.notes.find((item) => item.id === id);
      if (note) void repository.upsert("notes", { ...note, ...patch, updatedAt: now });
    },
    createTodo(input: { title: string; sourceItemId?: string }) {
      const now = Date.now();
      const todo: TodoRecord = {
        id: crypto.randomUUID(),
        title: input.title.trim() || "Untitled task",
        completed: false,
        ...(input.sourceItemId !== undefined ? { sourceItemId: input.sourceItemId } : {}),
        createdAt: now,
        updatedAt: now
      };
      setState((current) => ({ ...current, todos: [todo, ...current.todos] }));
      void repository.upsert("todos", todo);
      return todo;
    },
    toggleTodo(id: string) {
      const now = Date.now();
      setState((current) => ({
        ...current,
        todos: current.todos.map((todo) =>
          todo.id === id ? { ...todo, completed: !todo.completed, updatedAt: now } : todo
        )
      }));
      const todo = state.todos.find((item) => item.id === id);
      if (todo) void repository.upsert("todos", { ...todo, completed: !todo.completed, updatedAt: now });
    },
    createReminder(input: { title: string; remindAt: number; sourceItemId?: string }) {
      const now = Date.now();
      const reminder: ReminderRecord = {
        id: crypto.randomUUID(),
        title: input.title.trim() || "Untitled reminder",
        remindAt: input.remindAt,
        ...(input.sourceItemId !== undefined ? { sourceItemId: input.sourceItemId } : {}),
        status: "scheduled",
        createdAt: now,
        updatedAt: now
      };
      setState((current) => {
        const next = { ...current, reminders: [reminder, ...current.reminders] };
        stateRef.current = next;
        return next;
      });
      void repository.upsert("reminders", reminder);
      scheduleReminderNotification(reminder);
      return reminder;
    },
    updateReminder(id: string, patch: Partial<Pick<ReminderRecord, "title" | "remindAt">>) {
      const now = Date.now();
      setState((current) => {
        const next = {
          ...current,
          reminders: current.reminders.map((reminder) => reminder.id === id ? { ...reminder, ...patch, updatedAt: now, status: "scheduled" as const } : reminder)
        };
        stateRef.current = next;
        return next;
      });
      const reminder = state.reminders.find((item) => item.id === id);
      if (reminder) {
        const updated = { ...reminder, ...patch, updatedAt: now, status: "scheduled" as const };
        void repository.upsert("reminders", updated);
        scheduleReminderNotification(updated);
      }
    },
    saveItem(input: { title: string; url?: string; path?: string; sourceItemId?: string }) {
      const now = Date.now();
      const saved: SavedRecord = {
        id: crypto.randomUUID(),
        title: input.title.trim() || input.url || input.path || "Saved item",
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.path !== undefined ? { path: input.path } : {}),
        ...(input.sourceItemId !== undefined ? { sourceItemId: input.sourceItemId } : {}),
        createdAt: now,
        updatedAt: now
      };
      setState((current) => ({ ...current, saved: [saved, ...current.saved] }));
      void repository.upsert("saved", saved);
      return saved;
    },
    createFromCapture(record: CapturedRecord, target: "note" | "todo" | "reminder" | "saved") {
      const title = capturedTitle(record);
      const content = capturedContent(record);

      if (target === "note") {
        return workspace.createNote({ title, content, sourceItemId: record.item.id });
      }
      if (target === "todo") {
        return workspace.createTodo({ title, sourceItemId: record.item.id });
      }
      if (target === "reminder") {
        return workspace.createReminder({ title, remindAt: Date.now() + 10 * 60 * 1000, sourceItemId: record.item.id });
      }
      return workspace.saveItem({
        title,
        ...(record.item.url !== undefined ? { url: record.item.url } : {}),
        ...(record.item.path !== undefined ? { path: record.item.path } : {}),
        sourceItemId: record.item.id
      });
    }
  };
  return workspace;
}

export function capturedTitle(record: CapturedRecord): string {
  return record.item.title ?? record.item.url ?? record.item.path ?? firstLine(record.item.content ?? "") ?? "Captured item";
}

export function capturedContent(record: CapturedRecord): string {
  return [record.item.content, record.item.url, record.item.path, record.attachment?.filename].filter(Boolean).join("\n");
}

function normalizeState(parsed: Partial<ProductivityState>): ProductivityState {
  return {
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    todos: Array.isArray(parsed.todos) ? parsed.todos : [],
    reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
    saved: Array.isArray(parsed.saved) ? parsed.saved : []
  };
}

function collectDeletedRecords(state: ProductivityState): DeletedProductivityRecord[] {
  return (Object.entries(state) as Array<[ProductivityKind, ProductivityRecord[]]>).flatMap(([kind, records]) =>
    records.filter((record) => record.deletedAt !== undefined).map((record) => ({ kind, record }))
  );
}

function firstLine(text: string): string {
  return text.trim().split(/\r?\n/, 1)[0]?.slice(0, 120) ?? "";
}

async function sendBrowserNotification(request: { title: string; body?: string }): Promise<void> {
  if (!("Notification" in window) || Notification.permission === "denied") {
    return;
  }

  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
  }
  new Notification(request.title, { ...(request.body ? { body: request.body } : {}) });
}
