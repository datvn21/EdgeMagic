import { Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  ProductivityWorkspace,
  SyncChangeHandler,
} from "./widget-types.js";
import { Button } from "../../shared/ui/atoms/button.js";
import { Checkbox } from "../../shared/ui/atoms/checkbox.js";
import { IconButton } from "../../shared/ui/atoms/icon-button.js";
import { useWidgetShellAction } from "../../shared/ui/organisms/widget-shell.js";

export function TodoWidget({
  workspace,
  onSyncChange,
}: {
  workspace: ProductivityWorkspace;
  onSyncChange: SyncChangeHandler;
}) {
  const [title, setTitle] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const addAction = useMemo(() => <IconButton label={composerOpen ? "Close new task" : "Add task"} title={composerOpen ? "Close new task" : "Add task"} onClick={() => setComposerOpen((open) => !open)}>{composerOpen ? <X size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}</IconButton>, [composerOpen]);
  useWidgetShellAction(addAction);

  function createTodo() {
    if (!title.trim()) return;
    const todo = workspace.createTodo({ title });
    void onSyncChange("module-record", todo.id, "create", todo);
    setTitle("");
    setComposerOpen(false);
  }

  return (
    <section className="module-workspace" aria-label="Todo workspace">
      {composerOpen ? <form
        className="quick-form todo-form todo-composer"
        onSubmit={(event) => {
          event.preventDefault();
          createTodo();
        }}
      >
        <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Add a task" aria-label="New todo" />
        <div className="todo-composer-actions"><Button type="button" variant="ghost" size="sm" onClick={() => { setComposerOpen(false); setTitle(""); }}>Cancel</Button><Button type="submit" variant="primary" size="sm">Add</Button></div>
      </form> : null}
      <div className="record-list">
        {workspace.todos.length === 0 ? (
          <div className="todo-empty">
            <span>No tasks yet</span>
          </div>
        ) : (
          workspace.todos.map((todo) => (
            <div key={todo.id} className="todo-row">
              <Checkbox
                type="checkbox"
                checked={todo.completed}
                label=""
                aria-label={`Mark ${todo.title} as ${todo.completed ? "incomplete" : "complete"}`}
                onChange={() => {
                  workspace.toggleTodo(todo.id);
                  void onSyncChange("module-record", todo.id, "update", {
                    completed: !todo.completed,
                  });
                }}
              />
              <span data-completed={todo.completed}>{todo.title}</span>
              <IconButton
                type="button"
                label={`Delete ${todo.title}`}
                title="Delete task"
                onClick={() => {
                  workspace.softDelete("todos", todo.id);
                  void onSyncChange("module-record", todo.id, "delete", todo);
                }}
              >
                <Trash2 size={16} aria-hidden="true" />
              </IconButton>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
