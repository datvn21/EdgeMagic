import type { ClipboardPayload, ItemMetadata, ItemType } from "@edgemagic/types";
import type { CreateAttachmentInput, CreateItemInput } from "@edgemagic/module-api";

export interface NormalizedCapture {
  item: CreateItemInput;
  attachment?: CreateAttachmentInput;
  dedupeKey: string;
}

export function normalizeClipboardPayload(payload: ClipboardPayload): NormalizedCapture[] {
  if (payload.kind === "text") {
    return [normalizeText(payload.text, "clipboard", { "clipboard.kind": "text" })];
  }

  if (payload.kind === "url") {
    return [
      {
        item: {
          type: "link",
          title: payload.text ?? payload.url,
          url: payload.url,
          source: "clipboard",
          metadata: { "clipboard.kind": "url" }
        },
        dedupeKey: `clipboard:url:${payload.url}`
      }
    ];
  }

  if (payload.kind === "file-list") {
    return payload.paths.map((path) => normalizeFilePath(path, "clipboard", { "clipboard.kind": "file-list" }));
  }

  if (payload.kind === "image") {
    return [
      {
        item: {
          type: "image",
          title: filenameFromPath(payload.tempPath),
          path: payload.tempPath,
          source: "clipboard",
          metadata: { "clipboard.kind": "image", "clipboard.mimeType": payload.mimeType ?? null }
        },
        attachment: {
          kind: "image",
          filename: filenameFromPath(payload.tempPath),
          ...(payload.mimeType !== undefined ? { mimeType: payload.mimeType } : {}),
          localPath: payload.tempPath
        },
        dedupeKey: `clipboard:image:${payload.tempPath}:${payload.mimeType ?? ""}`
      }
    ];
  }

  return [];
}

export function normalizeDroppedText(text: string): NormalizedCapture {
  return normalizeText(text, "drag-drop", { "dragDrop.kind": "text" });
}

export function normalizeDroppedUrl(url: string): NormalizedCapture {
  return {
    item: {
      type: "link",
      title: url,
      url,
      source: "drag-drop",
      metadata: { "dragDrop.kind": "url" }
    },
    dedupeKey: `drag-drop:url:${url}`
  };
}

export function normalizeDroppedFile(file: { name: string; size: number; type: string; path?: string; managedCopy?: boolean }): NormalizedCapture {
  const localPath = file.path ?? file.name;
  const isImage = file.type.toLowerCase().startsWith("image/");
  return {
    item: {
      type: isImage ? "image" : "file",
      title: file.name,
      path: localPath,
      source: "drag-drop",
      metadata: {
        "dragDrop.kind": isImage ? "image" : "file",
        "file.name": file.name,
        "file.size": file.size,
        "file.type": file.type,
        ...(file.managedCopy ? { "file.managedCopy": true } : {})
      }
    },
    attachment: {
      kind: isImage ? "image" : "file",
      filename: file.name,
      ...(file.type ? { mimeType: file.type } : {}),
      byteSize: file.size,
      localPath
    },
    dedupeKey: `drag-drop:file:${localPath}:${file.size}`
  };
}

function normalizeText(text: string, source: CreateItemInput["source"], metadata: ItemMetadata): NormalizedCapture {
  const trimmed = text.trim();
  const url = asUrl(trimmed);
  const type: ItemType = url ? "link" : "text";

  return {
    item: {
      type,
      title: firstLine(trimmed),
      ...(url ? { url } : { content: trimmed }),
      source,
      metadata
    },
    dedupeKey: `${source}:${type}:${trimmed}`
  };
}

function normalizeFilePath(path: string, source: CreateItemInput["source"], metadata: ItemMetadata): NormalizedCapture {
  const filename = filenameFromPath(path);
  return {
    item: {
      type: "file",
      title: filename,
      path,
      source,
      metadata
    },
    attachment: {
      kind: "file",
      filename,
      localPath: path
    },
    dedupeKey: `${source}:file:${path}`
  };
}

function asUrl(text: string): string | null {
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function firstLine(text: string): string {
  return text.split(/\r?\n/, 1)[0]?.slice(0, 120) || "Captured text";
}

function filenameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}
