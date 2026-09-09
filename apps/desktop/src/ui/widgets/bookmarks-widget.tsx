import { useState } from "react";
import { detectSupportedBookmarkStores } from "../../bookmarks/browser-bookmarks.js";
import type { BrowserBookmarkRecord } from "../../bookmarks/browser-bookmarks.js";

interface BookmarksWidgetProps {
  bookmarks: BrowserBookmarkRecord[];
  importChromium: (
    raw: string,
    browser?: BrowserBookmarkRecord["browser"],
  ) => BrowserBookmarkRecord[];
  clearBookmarks: () => void;
  saveBookmark: (bookmark: BrowserBookmarkRecord) => void;
}

export function BookmarksWidget({
  bookmarks,
  importChromium,
  clearBookmarks,
  saveBookmark,
}: BookmarksWidgetProps) {
  const [rawBookmarks, setRawBookmarks] = useState("");
  const [message, setMessage] = useState("");
  const supportedStores = detectSupportedBookmarkStores();

  function importBookmarks() {
    try {
      const imported = importChromium(rawBookmarks, "edge");
      setRawBookmarks("");
      setMessage(`Imported ${imported.length} browser bookmarks.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not import bookmarks.",
      );
    }
  }

  return (
    <section className="module-workspace" aria-label="Bookmarks workspace">
      <div className="bookmark-source">
        <div>
          <h3>External browser source</h3>
          <p>
            {supportedStores.length > 0
              ? supportedStores
                  .map((store) => `${store.displayName}: ${store.pathTemplate}`)
                  .join(" | ")
              : "Automatic browser store detection is not available on this platform."}
          </p>
        </div>
        <button type="button" onClick={clearBookmarks}>Clear source</button>
      </div>
      <div className="quick-form">
        <textarea
          aria-label="Browser bookmark JSON"
          value={rawBookmarks}
          onChange={(event) => setRawBookmarks(event.target.value)}
          placeholder="Paste Chrome or Edge Bookmarks JSON"
        />
        <button type="button" onClick={importBookmarks}>Import bookmarks</button>
      </div>
      {message ? <p className="backup-status">{message}</p> : null}
      <div className="record-list">
        {bookmarks.length === 0 ? (
          <p className="empty-state">No browser bookmarks imported.</p>
        ) : null}
        {bookmarks.map((bookmark) => (
          <article key={bookmark.id} className="record-row">
            <div>
              <h3>{bookmark.title}</h3>
              <p>{bookmark.url}</p>
            </div>
            <div className="record-actions">
              <button type="button"
                onClick={() =>
                  window.open(bookmark.url, "_blank", "noopener,noreferrer")
                }
              >
                Open
              </button>
              <button type="button"
                onClick={() =>
                  void navigator.clipboard?.writeText(bookmark.url)
                }
              >
                Copy
              </button>
              <button type="button" onClick={() => saveBookmark(bookmark)}>Save</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
