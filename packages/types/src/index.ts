export type ItemType =
  | "text"
  | "link"
  | "image"
  | "file"
  | "note"
  | "todo"
  | "reminder"
  | "bookmark"
  | "saved";

export type ItemSource =
  | "manual"
  | "clipboard"
  | "drag-drop"
  | "screenshot"
  | "browser-bookmark"
  | "import"
  | "plugin";

export type ItemMetadata = Record<string, unknown>;

export interface EdgeItem {
  id: string;
  type: ItemType;
  title?: string;
  content?: string;
  url?: string;
  path?: string;
  source: ItemSource;
  metadata: ItemMetadata;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Attachment {
  id: string;
  itemId: string;
  kind: "image" | "file" | "screenshot" | "other";
  filename: string;
  mimeType?: string;
  byteSize?: number;
  localPath: string;
  contentHash?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
  createdAt: number;
  updatedAt: number;
}

export type ClipboardPayload =
  | { kind: "text"; text: string }
  | { kind: "url"; url: string; text?: string }
  | { kind: "image"; tempPath: string; mimeType?: string }
  | { kind: "file-list"; paths: string[] };

export interface SearchQuery {
  text: string;
  types?: ItemType[];
  sources?: ItemSource[];
  limit?: number;
}

export interface SearchResult {
  item: EdgeItem;
  score: number;
  highlights?: string[];
}

