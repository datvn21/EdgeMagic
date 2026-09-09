import { describe, expect, it } from "vitest";
import { bookmarkToItem, detectSupportedBookmarkStores, parseChromiumBookmarks } from "./browser-bookmarks.js";

describe("browser bookmarks", () => {
  it("normalizes Chromium bookmark trees into read-only bookmark items", () => {
    const bookmarks = parseChromiumBookmarks(
      JSON.stringify({
        roots: {
          bookmark_bar: {
            name: "Bookmarks bar",
            type: "folder",
            children: [
              {
                name: "EdgeMagic",
                type: "url",
                url: "https://example.com/edge",
                date_added: "13300000000000000"
              },
              {
                name: "Nested",
                type: "folder",
                children: [{ name: "Docs", type: "url", url: "https://example.com/docs" }]
              }
            ]
          }
        }
      }),
      "edge"
    );

    expect(bookmarks).toHaveLength(2);
    expect(bookmarks[1]?.folderPath).toEqual(["bookmark_bar", "Bookmarks bar", "Nested"]);
    expect(bookmarkToItem(bookmarks[0] ?? bookmarks[1]!).source).toBe("browser-bookmark");
  });

  it("deduplicates repeated bookmark URLs", () => {
    const bookmarks = parseChromiumBookmarks(
      JSON.stringify({
        roots: {
          other: {
            type: "folder",
            children: [
              { name: "One", type: "url", url: "https://example.com" },
              { name: "Two", type: "url", url: "https://example.com" }
            ]
          }
        }
      }),
      "chrome"
    );

    expect(bookmarks).toHaveLength(1);
  });

  it("detects supported Windows bookmark stores", () => {
    expect(detectSupportedBookmarkStores("Win32").map((store) => store.browser)).toEqual(["chrome", "edge"]);
    expect(detectSupportedBookmarkStores("MacIntel")).toEqual([]);
  });
});
