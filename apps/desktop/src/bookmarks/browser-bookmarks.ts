import type { EdgeItem } from "@edgemagic/types";

export interface BrowserBookmarkRecord {
  id: string;
  title: string;
  url: string;
  browser: "chrome" | "edge" | "unknown";
  folderPath: string[];
  createdAt: number;
  updatedAt: number;
}

interface ChromiumBookmarkNode {
  type?: string;
  name?: string;
  url?: string;
  date_added?: string;
  children?: ChromiumBookmarkNode[];
}

interface ChromiumBookmarksFile {
  roots?: Record<string, ChromiumBookmarkNode>;
}

const windowsChromeBookmarkPath =
  "%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Bookmarks";
const windowsEdgeBookmarkPath =
  "%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\Default\\Bookmarks";

export const supportedBookmarkStores = [
  {
    browser: "chrome",
    displayName: "Google Chrome",
    platform: "windows",
    pathTemplate: windowsChromeBookmarkPath
  },
  {
    browser: "edge",
    displayName: "Microsoft Edge",
    platform: "windows",
    pathTemplate: windowsEdgeBookmarkPath
  }
] as const;

export function parseChromiumBookmarks(raw: string, browser: BrowserBookmarkRecord["browser"]): BrowserBookmarkRecord[] {
  const parsed = JSON.parse(raw) as ChromiumBookmarksFile;
  const roots = parsed.roots ?? {};
  const records = Object.entries(roots).flatMap(([rootName, node]) => flattenBookmarks(node, browser, [rootName]));
  const seenUrls = new Set<string>();

  return records.filter((record) => {
    const key = record.url.trim().toLowerCase();
    if (!key || seenUrls.has(key)) {
      return false;
    }
    seenUrls.add(key);
    return true;
  });
}

export function bookmarkToItem(record: BrowserBookmarkRecord): EdgeItem {
  return {
    id: record.id,
    type: "bookmark",
    title: record.title,
    url: record.url,
    source: "browser-bookmark",
    metadata: {
      "browser.provider": record.browser,
      "browser.folderPath": record.folderPath
    },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export function detectSupportedBookmarkStores(platform = navigator.platform) {
  const normalizedPlatform = platform.toLowerCase();
  if (!normalizedPlatform.includes("win")) {
    return [];
  }

  return supportedBookmarkStores;
}

function flattenBookmarks(
  node: ChromiumBookmarkNode,
  browser: BrowserBookmarkRecord["browser"],
  folderPath: string[]
): BrowserBookmarkRecord[] {
  if (node.type === "url" && node.url) {
    const createdAt = chromeWebkitTimestampToUnixMs(node.date_added);
    return [
      {
        id: stableBookmarkId(browser, node.url),
        title: node.name?.trim() || node.url,
        url: node.url,
        browser,
        folderPath,
        createdAt,
        updatedAt: createdAt
      }
    ];
  }

  return (node.children ?? []).flatMap((child) =>
    flattenBookmarks(child, browser, node.name ? [...folderPath, node.name] : folderPath)
  );
}

function chromeWebkitTimestampToUnixMs(value: string | undefined): number {
  if (!value) {
    return Date.now();
  }

  const microseconds = Number(value);
  if (!Number.isFinite(microseconds)) {
    return Date.now();
  }

  return Math.max(0, Math.round(microseconds / 1000 - 11644473600000));
}

function stableBookmarkId(browser: BrowserBookmarkRecord["browser"], url: string): string {
  let hash = 0;
  const key = `${browser}:${url}`;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return `bookmark-${browser}-${hash.toString(16)}`;
}
