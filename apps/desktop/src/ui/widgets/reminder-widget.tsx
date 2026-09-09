import { Bell, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ProductivityWorkspace, SyncChangeHandler } from "./widget-types.js";
import { Button } from "../../shared/ui/atoms/button.js";
import { IconButton } from "../../shared/ui/atoms/icon-button.js";
import { useWidgetShellAction } from "../../shared/ui/organisms/widget-shell.js";

const defaultReminderMinutes = 10;
const defaultReminderMinutesText = String(defaultReminderMinutes);

export function ReminderWidget({ workspace, onSyncChange }: { workspace: ProductivityWorkspace; onSyncChange: SyncChangeHandler }) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(defaultReminderMinutesText);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingTime, setEditingTime] = useState("");
  const addAction = useMemo(
    () => <IconButton label={composerOpen ? "Close new reminder" : "Add reminder"} title={composerOpen ? "Close new reminder" : "Add reminder"} onClick={() => setComposerOpen((open) => !open)}>{composerOpen ? <X size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}</IconButton>,
    [composerOpen]
  );
  useWidgetShellAction(addAction);

  function createReminder() {
    if (!title.trim()) return;
    const reminderMinutes = parseReminderMinutes(minutes);
    const reminder = workspace.createReminder({ title, remindAt: Date.now() + reminderMinutes * 60 * 1000 });
    void onSyncChange("module-record", reminder.id, "create", reminder);
    setTitle("");
    setMinutes(defaultReminderMinutesText);
    setComposerOpen(false);
  }

  function beginEdit(id: string, title: string, remindAt: number) {
    setEditingId(id);
    setEditingTitle(title);
    setEditingTime(toDateTimeLocal(remindAt));
  }

  function saveEdit(id: string) {
    const nextTitle = editingTitle.trim();
    if (!nextTitle) return;
    const remindAt = new Date(editingTime).getTime();
    if (!Number.isFinite(remindAt)) return;
    const existing = workspace.reminders.find((reminder) => reminder.id === id);
    const updatedAt = Date.now();
    workspace.updateReminder(id, { title: nextTitle, remindAt });
    if (existing) {
      void onSyncChange("module-record", id, "update", {
        ...existing,
        title: nextTitle,
        remindAt,
        status: "scheduled",
        updatedAt
      });
    }
    setEditingId(null);
    setEditingTitle("");
  }

  return <section className="module-workspace reminder-workspace" aria-label="Reminder workspace">
    {composerOpen ? <form className="quick-form reminder-composer" onSubmit={(event) => { event.preventDefault(); createReminder(); }}>
      <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Reminder title" aria-label="New reminder" />
      <div className="quick-buttons">
        <label>
          Remind me in
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            placeholder={defaultReminderMinutesText}
            aria-label="Reminder duration in minutes"
          />
        </label>
        <Button type="submit" variant="primary" size="sm">Save</Button>
      </div>
    </form> : null}
    <div className="record-list reminder-list">
      {workspace.reminders.length === 0 ? <div className="notes-empty"><Bell size={18} aria-hidden="true" /><span>No reminders yet. Click + to create one.</span></div> : workspace.reminders.map((reminder) => (
        <article key={reminder.id} className="record-row reminder-item">
          {editingId === reminder.id ? <form className="quick-form reminder-edit-form" onSubmit={(event) => { event.preventDefault(); saveEdit(reminder.id); }}>
            <input autoFocus value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} placeholder="Reminder title" aria-label={`Edit title for ${reminder.title}`} />
            <input type="datetime-local" value={editingTime} onChange={(event) => setEditingTime(event.target.value)} aria-label={`Edit time for ${reminder.title}`} />
            <div className="composer-actions"><Button type="button" variant="ghost" size="sm" onClick={() => { setEditingId(null); setEditingTitle(""); }}>Cancel</Button><Button type="submit" variant="primary" size="sm">Save</Button></div>
          </form> : <button type="button" className="reminder-item-main" onClick={() => beginEdit(reminder.id, reminder.title, reminder.remindAt)}>
            <span><strong>{reminder.title}</strong><small>{new Date(reminder.remindAt).toLocaleString()}</small></span>
          </button>}
          {editingId !== reminder.id ? <IconButton label={`Delete ${reminder.title}`} title="Delete reminder" onClick={() => {
            workspace.softDelete("reminders", reminder.id);
            void onSyncChange("module-record", reminder.id, "delete", reminder);
          }}><Trash2 size={15} aria-hidden="true" /></IconButton> : null}
        </article>
      ))}
    </div>
  </section>;
}

function parseReminderMinutes(value: string): number {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 1) return defaultReminderMinutes;
  return Math.floor(minutes);
}

function toDateTimeLocal(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
