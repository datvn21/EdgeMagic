import { useCaptureInbox } from "../../capture/use-capture-inbox.js";
import { createDesktopPlatform } from "../../platform/desktop-platform.js";
import { usePlatformState } from "../../platform/use-platform-state.js";
import { useProductivityWorkspace } from "../../productivity/use-productivity-workspace.js";
import { useEdgeSettings } from "../../settings/use-edge-settings.js";
import { useSyncWorkspace } from "../../sync/use-sync-workspace.js";
import { useBookmarkSource } from "../../bookmarks/use-bookmark-source.js";
import type { ModuleId } from "../widget-registry.js";
import { InboxList } from "../inbox-list.js";
import { LibraryWidget } from "./library-widget.js";
import { NotesWidget } from "./notes-widget.js";
import { ReminderWidget } from "./reminder-widget.js";
import { SettingsWidget } from "./settings-widget.js";
import { TodoWidget } from "./todo-widget.js";
import type { SyncChangeHandler } from "./widget-types.js";

const imagePreviewTtlMs = 15 * 60 * 1000;

interface WidgetContentProps {
  moduleId: ModuleId;
  captureInbox: ReturnType<typeof useCaptureInbox>;
  bookmarkSource: ReturnType<typeof useBookmarkSource>;
  productivity: ReturnType<typeof useProductivityWorkspace>;
  sync: ReturnType<typeof useSyncWorkspace>;
  settings: ReturnType<typeof useEdgeSettings>["settings"];
  updateSettings: ReturnType<typeof useEdgeSettings>["updateSettings"];
  platform: ReturnType<typeof createDesktopPlatform>;
  platformState: ReturnType<typeof usePlatformState>;
  enqueueSyncChange: SyncChangeHandler;
}

export function WidgetContent(props: WidgetContentProps) {
  const { moduleId, captureInbox, bookmarkSource, productivity, settings, updateSettings, platform, platformState, enqueueSyncChange } = props;
  if (moduleId === "clipboard") return <InboxList records={captureInbox.records} onClear={captureInbox.clearAll} onOpenFile={(path, managedCopy) => { const open = managedCopy && platform.files.openManagedFile ? platform.files.openManagedFile : platform.files.open; open(path).catch((error: unknown) => { console.error("Failed to open file:", path, error); }); }} onOpenImageData={(dataUrl, title) => { openImageData(dataUrl, title, platform).catch((error: unknown) => { console.error("Failed to open image data:", error); }); }} onOpenLink={(url) => platform.files.openUrl?.(url) ?? Promise.resolve()} onDelete={captureInbox.remove} />;
  if (moduleId === "notes") return <NotesWidget workspace={productivity} onSyncChange={enqueueSyncChange} />;
  if (moduleId === "todo") return <TodoWidget workspace={productivity} onSyncChange={enqueueSyncChange} />;
  if (moduleId === "reminder") return <ReminderWidget workspace={productivity} onSyncChange={enqueueSyncChange} />;
  if (moduleId === "library" || moduleId === "saved" || moduleId === "bookmarks") return <LibraryWidget workspace={productivity} onSyncChange={enqueueSyncChange} bookmarks={settings.bookmarkSourceEnabled ? bookmarkSource.bookmarks : []} importChromium={bookmarkSource.importChromium} clearBookmarks={bookmarkSource.clear} saveBookmark={(bookmark) => { const saved = productivity.saveItem({ title: bookmark.title, url: bookmark.url }); void enqueueSyncChange("module-record", saved.id, "create", saved); }} />;
  return <SettingsWidget settings={settings} updateSettings={updateSettings} captureInbox={captureInbox} productivity={productivity} platform={platform} platformState={platformState} />;
}

async function openImageData(dataUrl: string, title: string | undefined, platform: ReturnType<typeof createDesktopPlatform>): Promise<void> {
  if (!platform.files.persistDroppedFile || !platform.files.openManagedFile) {
    window.open(dataUrl, "_blank", "noopener,noreferrer");
    return;
  }

  const parsed = parseDataImage(dataUrl);
  if (!parsed) throw new Error("Unsupported image data URL.");
  const path = await platform.files.persistDroppedFile(safeImageFilename(title, parsed.extension), parsed.bytes);
  scheduleManagedFileDelete(path, platform);
  await platform.files.openManagedFile(path);
}

function parseDataImage(dataUrl: string): { bytes: Uint8Array; extension: string } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const mimeType = match[1]!;
  const base64 = match[2]!;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { bytes, extension: imageExtension(mimeType) };
}

function imageExtension(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/bmp") return "bmp";
  return "png";
}

function safeImageFilename(title: string | undefined, extension: string): string {
  const base = (title?.trim() || "clipboard-image")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\.+$/g, "")
    .slice(0, 80)
    || "clipboard-image";
  return base.toLowerCase().endsWith(`.${extension}`) ? base : `${base}.${extension}`;
}

function scheduleManagedFileDelete(path: string, platform: ReturnType<typeof createDesktopPlatform>): void {
  if (!platform.files.deleteDroppedFile) return;
  window.setTimeout(() => {
    void platform.files.deleteDroppedFile?.(path).catch((error: unknown) => {
      console.error("Failed to delete image preview file:", path, error);
    });
  }, imagePreviewTtlMs);
}
