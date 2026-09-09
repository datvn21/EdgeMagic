import { useState } from "react";
import type {
  ProductivityWorkspace,
  SyncChangeHandler,
} from "./widget-types.js";

export function SavedWidget({
  workspace,
  onSyncChange,
}: {
  workspace: ProductivityWorkspace;
  onSyncChange: SyncChangeHandler;
}) {
  const [title, setTitle] = useState("");

  return (
    <section className="module-workspace" aria-label="Saved workspace">
      <form
        className="quick-form inline"
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim()) return;
          const saved = workspace.saveItem({ title });
          void onSyncChange("module-record", saved.id, "create", saved);
          setTitle("");
        }}
      >
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Save a reference"
        />
        <button type="submit">Save</button>
      </form>
      <div className="record-list">
        {workspace.saved.map((saved) => (
          <article key={saved.id} className="record-row">
            <div>
              <h3>{saved.title}</h3>
              <p>{saved.url ?? saved.path ?? "Saved locally"}</p>
            </div>
            <button type="button"
              onClick={() => {
                workspace.softDelete("saved", saved.id);
                void onSyncChange("module-record", saved.id, "delete", saved);
              }}
            >
              Delete
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
