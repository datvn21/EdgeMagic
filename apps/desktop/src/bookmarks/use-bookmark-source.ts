import { useEffect, useMemo, useState } from "react";
import { readDesktopJson, writeDesktopJson } from "../data/desktop-store.js";
import {
  bookmarkToItem,
  parseChromiumBookmarks,
  type BrowserBookmarkRecord
} from "./browser-bookmarks.js";

const storageKey = "edgemagic.browser-bookmarks";

export function useBookmarkSource() {
  const [bookmarks, setBookmarks] = useState<BrowserBookmarkRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    void readDesktopJson(storageKey, []).then((loaded) => {
      if (mounted) {
        setBookmarks(Array.isArray(loaded) ? loaded : []);
        setHydrated(true);
      }
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (hydrated) void writeDesktopJson(storageKey, bookmarks);
  }, [bookmarks, hydrated]);

  return useMemo(
    () => ({
      bookmarks,
      items: bookmarks.map(bookmarkToItem),
      importChromium(raw: string, browser: BrowserBookmarkRecord["browser"] = "unknown") {
        const imported = parseChromiumBookmarks(raw, browser);
        setBookmarks((current) => mergeBookmarks(current, imported));
        return imported;
      },
      clear() {
        setBookmarks([]);
      }
    }),
    [bookmarks]
  );
}

function mergeBookmarks(current: BrowserBookmarkRecord[], imported: BrowserBookmarkRecord[]): BrowserBookmarkRecord[] {
  const byUrl = new Map(current.map((bookmark) => [bookmark.url.toLowerCase(), bookmark]));
  for (const bookmark of imported) {
    byUrl.set(bookmark.url.toLowerCase(), bookmark);
  }
  return [...byUrl.values()].sort((left, right) => right.updatedAt - left.updatedAt);
}
