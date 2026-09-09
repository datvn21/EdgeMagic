import { Bookmark, Library, ExternalLink, Copy, Trash2, Upload } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { BrowserBookmarkRecord } from "../../bookmarks/browser-bookmarks.js";
import { detectSupportedBookmarkStores } from "../../bookmarks/browser-bookmarks.js";
import type { ProductivityWorkspace, SyncChangeHandler } from "./widget-types.js";

type LibraryTab = "saved" | "bookmarks";

export function LibraryWidget({ workspace, onSyncChange, bookmarks, importChromium, clearBookmarks, saveBookmark }: {
  workspace: ProductivityWorkspace;
  onSyncChange: SyncChangeHandler;
  bookmarks: BrowserBookmarkRecord[];
  importChromium: (raw: string, browser?: BrowserBookmarkRecord["browser"]) => BrowserBookmarkRecord[];
  clearBookmarks: () => void;
  saveBookmark: (bookmark: BrowserBookmarkRecord) => void;
}) {
  const [tab, setTab] = useState<LibraryTab>("saved");
  const [title, setTitle] = useState("");
  const [raw, setRaw] = useState("");
  const [message, setMessage] = useState("");
  const stores = detectSupportedBookmarkStores();
  const addSaved = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    const saved = workspace.saveItem({ title });
    void onSyncChange("module-record", saved.id, "create", saved);
    setTitle("");
  };
  const importBookmarks = () => {
    try { const imported = importChromium(raw, "edge"); setRaw(""); setMessage(`Imported ${imported.length} browser bookmarks.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not import bookmarks."); }
  };
  return <section className="module-workspace library-workspace">
    <div className="library-tabs" role="tablist" aria-label="Library sections">
      <button type="button" role="tab" aria-selected={tab === "saved"} onClick={() => setTab("saved")}><Library size={16} aria-hidden="true" />Saved</button>
      <button type="button" role="tab" aria-selected={tab === "bookmarks"} onClick={() => setTab("bookmarks")}><Bookmark size={16} aria-hidden="true" />Bookmarks</button>
    </div>
    {tab === "saved" ? <>
      <form className="quick-form inline" onSubmit={addSaved}><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Save a reference" aria-label="Save a reference" /><button type="submit">Save</button></form>
      <div className="record-list">{workspace.saved.length === 0 ? <p className="empty-state">No saved references yet.</p> : workspace.saved.map((saved) => <article key={saved.id} className="record-row"><div><h3>{saved.title}</h3><p>{saved.url ?? saved.path ?? "Saved locally"}</p></div><button type="button" aria-label={`Delete ${saved.title}`} onClick={() => { workspace.softDelete("saved", saved.id); void onSyncChange("module-record", saved.id, "delete", saved); }}><Trash2 size={16} aria-hidden="true" /></button></article>)}</div>
    </> : <>
      <div className="bookmark-source"><div><h3>Browser bookmarks</h3><p>{stores.length > 0 ? stores.map((store) => store.displayName).join(" · ") : "Automatic browser detection is unavailable."}</p></div><button type="button" onClick={clearBookmarks}>Clear</button></div>
      <div className="quick-form"><textarea aria-label="Browser bookmark JSON" value={raw} onChange={(event) => setRaw(event.target.value)} placeholder="Paste Chrome or Edge Bookmarks JSON" /><button type="button" onClick={importBookmarks}><Upload size={16} aria-hidden="true" />Import bookmarks</button></div>
      {message ? <p className="backup-status">{message}</p> : null}
      <div className="record-list">{bookmarks.length === 0 ? <p className="empty-state">No browser bookmarks imported.</p> : bookmarks.map((bookmark) => <article key={bookmark.id} className="record-row"><div><h3>{bookmark.title}</h3><p>{bookmark.url}</p></div><div className="record-actions"><button type="button" aria-label={`Open ${bookmark.title}`} onClick={() => window.open(bookmark.url, "_blank", "noopener,noreferrer")}><ExternalLink size={16} aria-hidden="true" /></button><button type="button" aria-label={`Copy ${bookmark.title}`} onClick={() => void navigator.clipboard?.writeText(bookmark.url)}><Copy size={16} aria-hidden="true" /></button><button type="button" onClick={() => saveBookmark(bookmark)}>Save</button></div></article>)}</div>
    </>}
  </section>;
}
