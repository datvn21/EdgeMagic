import {
  DedupeCache,
  normalizeClipboardPayload,
  normalizeDroppedFile,
  normalizeDroppedText,
  normalizeDroppedUrl
} from "@edgemagic/clipboard-module";
import type { NormalizedCapture } from "@edgemagic/clipboard-module";
import type { CreateItemInput, ScreenshotCaptureResult } from "@edgemagic/module-api";
import type { Attachment, EdgeItem } from "@edgemagic/types";
import { useEffect, useMemo, useState } from "react";
import { readDesktopJson, writeDesktopJson } from "../data/desktop-store.js";

export interface CapturedRecord {
  item: EdgeItem;
  attachment?: Attachment;
}

const dedupe = new DedupeCache(1500);
const storageKey = "edgemagic.capture-inbox";

interface CaptureInboxOptions {
  deleteManagedFile?: (path: string) => Promise<void>;
}

export function useCaptureInbox(options: CaptureInboxOptions = {}) {
  const [records, setRecords] = useState<CapturedRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const deleteManagedFile = options.deleteManagedFile;

  useEffect(() => {
    let mounted = true;
    void readDesktopJson(storageKey, []).then((loaded) => {
      if (mounted) {
        setRecords(Array.isArray(loaded) ? loaded : []);
        setHydrated(true);
      }
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (hydrated) void writeDesktopJson(storageKey, records);
  }, [hydrated, records]);

  return useMemo(
    () => {
      const capture = (captureInput: NormalizedCapture): CapturedRecord | null => {
        if (!dedupe.shouldAccept(captureInput.dedupeKey)) {
          return null;
        }

        const now = Date.now();
        const item: EdgeItem = {
          id: crypto.randomUUID(),
          type: captureInput.item.type,
          ...(captureInput.item.title !== undefined ? { title: captureInput.item.title } : {}),
          ...(captureInput.item.content !== undefined ? { content: captureInput.item.content } : {}),
          ...(captureInput.item.url !== undefined ? { url: captureInput.item.url } : {}),
          ...(captureInput.item.path !== undefined ? { path: captureInput.item.path } : {}),
          source: captureInput.item.source,
          metadata: captureInput.item.metadata ?? {},
          createdAt: now,
          updatedAt: now
        };
        const attachment: Attachment | undefined = captureInput.attachment
          ? {
              id: crypto.randomUUID(),
              itemId: item.id,
              kind: captureInput.attachment.kind,
              filename: captureInput.attachment.filename,
              ...(captureInput.attachment.mimeType !== undefined ? { mimeType: captureInput.attachment.mimeType } : {}),
              ...(captureInput.attachment.byteSize !== undefined ? { byteSize: captureInput.attachment.byteSize } : {}),
              localPath: captureInput.attachment.localPath,
              ...(captureInput.attachment.contentHash !== undefined ? { contentHash: captureInput.attachment.contentHash } : {}),
              createdAt: now,
              updatedAt: now
            }
          : undefined;

        const record = attachment ? { item, attachment } : { item };
        setRecords((current) => {
          const next = [record, ...current];
          deleteManagedCopies(next.slice(50), deleteManagedFile);
          return next.slice(0, 50);
        });
        return record;
      };

      return {
        records,
        hydrated,
        replaceRecords(nextRecords: CapturedRecord[]) {
          setRecords((current) => {
            const retained = nextRecords.slice(0, 50);
            const retainedIds = new Set(retained.map((record) => record.item.id));
            deleteManagedCopies(current.filter((record) => !retainedIds.has(record.item.id)), deleteManagedFile);
            deleteManagedCopies(nextRecords.slice(50), deleteManagedFile);
            return retained;
          });
        },
        clearAll() {
          setRecords((current) => {
            deleteManagedCopies(current, deleteManagedFile);
            return [];
          });
        },
        remove(itemId: string) {
          setRecords((current) => {
            const removed = current.filter((record) => record.item.id === itemId);
            deleteManagedCopies(removed, deleteManagedFile);
            return current.filter((record) => record.item.id !== itemId);
          });
        },
        clearClipboardHistory(protectedItemIds: string[] = []) {
          const protectedIds = new Set(protectedItemIds);
          setRecords((current) =>
            current.filter((record) => record.item.source !== "clipboard" || protectedIds.has(record.item.id))
          );
        },
        cleanupClipboardRetention(retentionDays: number, protectedItemIds: string[] = [], now = Date.now()) {
          const protectedIds = new Set(protectedItemIds);
          const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
          setRecords((current) => {
            if (retentionDays >= 3650) return current;
            const expired = current.filter((record) =>
              !protectedIds.has(record.item.id)
              && (record.item.source === "clipboard" || isManagedCopy(record))
              && now - record.item.createdAt > retentionMs
            );
            if (expired.length === 0) return current;
            deleteManagedCopies(expired, deleteManagedFile);
            const expiredIds = new Set(expired.map((record) => record.item.id));
            return current.filter((record) => !expiredIds.has(record.item.id));
          });
        },
        createItem(input: CreateItemInput): CapturedRecord {
          const now = Date.now();
          const item: EdgeItem = {
            id: crypto.randomUUID(),
            type: input.type,
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.content !== undefined ? { content: input.content } : {}),
            ...(input.url !== undefined ? { url: input.url } : {}),
            ...(input.path !== undefined ? { path: input.path } : {}),
            source: input.source,
            metadata: input.metadata ?? {},
            createdAt: now,
            updatedAt: now
          };
          const record = { item };
          setRecords((current) => {
            const next = [record, ...current];
            deleteManagedCopies(next.slice(50), deleteManagedFile);
            return next.slice(0, 50);
          });
          return record;
        },
        capture,
        captureClipboardText(text: string): CapturedRecord | null {
          const [captureInput] = normalizeClipboardPayload({ kind: "text", text });
          return captureInput ? capture(captureInput) : null;
        },
        captureClipboardFile(file: File): CapturedRecord | null {
          const nativePath = (file as File & { path?: string }).path;
          if (!nativePath) return null;
          const [captureInput] = normalizeClipboardPayload({ kind: "file-list", paths: [nativePath] });
          return captureInput ? capture(captureInput) : null;
        },
        captureClipboardFilePath(path: string): CapturedRecord | null {
          const [captureInput] = normalizeClipboardPayload({ kind: "file-list", paths: [path] });
          return captureInput ? capture(captureInput) : null;
        },
        captureText(text: string): CapturedRecord | null {
          return capture(normalizeDroppedText(text));
        },
        captureImageData(dataUrl: string, filename = "dropped-image.png", mimeType = "image/png"): CapturedRecord | null {
          return capture(normalizeDroppedFile({ name: filename, size: 0, type: mimeType, path: dataUrl }));
        },
        captureUrl(url: string): CapturedRecord | null {
          return capture(normalizeDroppedUrl(url));
        },
        captureFile(file: File, persistedPath?: string, managedCopy = false): CapturedRecord | null {
          const nativePath = persistedPath ?? (file as File & { path?: string }).path;
          return capture(normalizeDroppedFile({ name: file.name, size: file.size, type: file.type, ...(nativePath ? { path: nativePath } : {}), ...(managedCopy ? { managedCopy: true } : {}) }));
        },
        captureFilePath(path: string): CapturedRecord | null {
          const name = path.split(/[\\/]/).pop() ?? path;
          return capture(normalizeDroppedFile({ name, size: 0, type: "application/octet-stream", path }));
        },
        captureScreenshot(result: ScreenshotCaptureResult): CapturedRecord | null {
          return capture({
            item: {
              type: "image",
              title: result.filename,
              path: result.tempPath,
              source: "screenshot",
              metadata: {
                "screenshot.monitorId": result.monitorId ?? "primary",
                "screenshot.mimeType": result.mimeType
              }
            },
            attachment: {
              kind: "screenshot",
              filename: result.filename,
              mimeType: result.mimeType,
              ...(result.byteSize !== undefined ? { byteSize: result.byteSize } : {}),
              localPath: result.tempPath
            },
            dedupeKey: `screenshot:${result.tempPath}`
          });
        }
      };
    },
    [deleteManagedFile, hydrated, records]
  );
}

function isManagedCopy(record: CapturedRecord): boolean {
  return record.item.metadata["file.managedCopy"] === true;
}

function deleteManagedCopies(records: CapturedRecord[], deleteManagedFile?: (path: string) => Promise<void>): void {
  if (!deleteManagedFile) return;
  const paths = new Set(records.filter(isManagedCopy).map((record) => record.attachment?.localPath ?? record.item.path).filter((path): path is string => Boolean(path)));
  for (const path of paths) {
    void deleteManagedFile(path).catch((error: unknown) => {
      console.error("Failed to delete managed clipboard file:", path, error);
    });
  }
}
