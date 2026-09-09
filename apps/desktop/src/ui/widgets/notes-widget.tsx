import { Check, FileText, Pencil, Plus, Trash2, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type TextareaHTMLAttributes } from "react";
import type { ProductivityWorkspace, SyncChangeHandler } from "./widget-types.js";
import { IconButton } from "../../shared/ui/atoms/icon-button.js";
import { Button } from "../../shared/ui/atoms/button.js";
import { useWidgetShellAction } from "../../shared/ui/organisms/widget-shell.js";

export function NotesWidget({ workspace, onSyncChange }: { workspace: ProductivityWorkspace; onSyncChange: SyncChangeHandler }) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [content, setContent] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const addAction = useMemo(() => <IconButton label={composerOpen ? "Close new note" : "Add note"} title={composerOpen ? "Close new note" : "Add note"} onClick={() => setComposerOpen((open) => !open)}>{composerOpen ? <X size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}</IconButton>, [composerOpen]);
  useWidgetShellAction(addAction);

  function createNote() {
    if (!content.trim()) return;
    const note = workspace.createNote({ content });
    void onSyncChange("module-record", note.id, "create", note);
    setContent("");
    setComposerOpen(false);
  }

  return <section className="module-workspace notes-workspace" aria-label="Notes workspace">
    {composerOpen ? <form className="quick-form notes-composer" onSubmit={(event) => { event.preventDefault(); createNote(); }}>
      <textarea autoFocus value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write a note" aria-label="New note" />
      <div className="composer-actions"><Button type="button" variant="ghost" size="sm" onClick={() => { setComposerOpen(false); setContent(""); }}>Cancel</Button><Button type="submit" variant="primary" size="sm">Add note</Button></div>
    </form> : null}
    {editingId ? (() => { const note = workspace.notes.find((item) => item.id === editingId); if (!note) return null; return <form className="quick-form notes-editor" onSubmit={(event) => { event.preventDefault(); setEditingId(null); }}><AutoResizeTextarea aria-label="Edit note" value={note.content} onChange={(event) => { workspace.updateNote(note.id, { content: event.target.value }); void onSyncChange("module-record", note.id, "update", { content: event.target.value }); }} /><Button type="submit" size="sm"><Check size={14} aria-hidden="true" />Done</Button></form>; })() : null}
    <div className="record-list notes-list">
      {workspace.notes.length === 0 ? <div className="notes-empty"><FileText size={18} aria-hidden="true" /><span>No notes yet. Click + to create one.</span></div> : workspace.notes.map((note) => {
        const expanded = expandedId === note.id;
        return <article key={note.id} className={`record-row note-item ${expanded ? "is-expanded" : ""}`}>
          <button type="button" className="note-item-main" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : note.id)}>
            <span className="note-item-title">{note.content}</span>
          </button>
          {expanded ? <div className="note-item-footer"><span className="note-item-date">{new Date(note.updatedAt).toLocaleString()}</span><div className="record-actions"><IconButton label={`Edit ${note.title}`} title="Edit note" onClick={() => setEditingId(note.id)}><Pencil size={15} aria-hidden="true" /></IconButton><IconButton label={`Delete ${note.title}`} title="Delete note" onClick={() => { workspace.softDelete("notes", note.id); void onSyncChange("module-record", note.id, "delete", note); }}><Trash2 size={15} aria-hidden="true" /></IconButton></div></div> : null}
        </article>;
      })}
    </div>
  </section>;
}

function AutoResizeTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [props.value]);

  return <textarea {...props} ref={textareaRef} />;
}
