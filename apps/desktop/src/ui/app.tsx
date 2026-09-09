import type { DeepLinkPayload } from "@edgemagic/module-api";
import { normalizeClipboardPayload } from "@edgemagic/clipboard-module";
import type { ClipboardEvent, DragEvent } from "react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Pin, PinOff } from "lucide-react";
import type { CapturedRecord } from "../capture/use-capture-inbox.js";
import { useCaptureInbox } from "../capture/use-capture-inbox.js";
import { readDropInputs, readNativeFileInputs, resolveCaptureDestination, type CaptureDestination } from "../capture/capture-drop.js";
import { ITEM_TRANSFER_MIME, parseItemTransfer, destinationLabel, toProductivityTarget } from "../capture/item-transfer.js";
import { useBookmarkSource } from "../bookmarks/use-bookmark-source.js";
import { createDesktopPlatform } from "../platform/desktop-platform.js";
import { usePlatformState } from "../platform/use-platform-state.js";
import { useProductivityWorkspace } from "../productivity/use-productivity-workspace.js";
import { useEdgeSettings } from "../settings/use-edge-settings.js";
import { useSyncWorkspace } from "../sync/use-sync-workspace.js";
import { widgetRegistry, type ModuleId } from "./widget-registry.js";
import { EdgeHandle } from "./edge-window-controls.js";
import { WidgetCard } from "./widget-card.js";
import { WidgetContent } from "./widgets/widget-content.js";
import type { SyncChangeHandler } from "./widgets/widget-types.js";
import { initialShellState, shellReducer } from "../features/edge-shell/model/shell-state.js";
import { ShelfView } from "../features/edge-shell/ui/shelf-view.js";
import { FocusView } from "../features/edge-shell/ui/focus-view.js";

const shelfExitFallbackMs = 200;
const maxDroppedFileBytes = 10 * 1024 * 1024;

export function App() {
  return <EdgeBarApp />;
}

function EdgeBarApp() {
  const { settings, hydrated, updateSettings } = useEdgeSettings();
  const platform = useMemo(() => createDesktopPlatform(), []);
  const captureInbox = useCaptureInbox(platform.files.deleteDroppedFile ? { deleteManagedFile: platform.files.deleteDroppedFile } : {});
  const bookmarkSource = useBookmarkSource();
  const productivity = useProductivityWorkspace({ notifications: platform.notifications });
  const sync = useSyncWorkspace();
  const [shell, dispatch] = useReducer(shellReducer, initialShellState);
  const [activeModuleId, setActiveModuleId] = useState<ModuleId>("clipboard");
  const [feedback, setFeedback] = useState("");
  const [appliedLayout, setAppliedLayout] = useState<"collapsed" | "expanded" | null>(null);
  const [closing, setClosing] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const collapseTimer = useRef<number | null>(null);
  const inboxItemDragReleaseTimer = useRef<number | null>(null);
  const closingRef = useRef(false);
  const shellStateRef = useRef(shell);
  const dragDepth = useRef(0);
  const inboxItemDragActive = useRef(false);
  const pointerInside = useRef(false);
  const lastPointerPosition = useRef({ x: 0, y: 0 });
  const focusInside = useRef(false);
  const inputModality = useRef<"pointer" | "keyboard">("pointer");
  const productivityRef = useRef(productivity);
  const syncRef = useRef(sync);
  const captureInboxRef = useRef(captureInbox);
  const activeModuleRef = useRef(activeModuleId);
  const platformState = usePlatformState(platform, settings.startupAtLogin);
  const expanded = shell.mode !== "collapsed";
  const desiredLayout = expanded ? "expanded" : "collapsed";
  const windowLayoutReady = appliedLayout === desiredLayout;
  const shelfModules = useMemo(() => getEnabledShelfModules(settings.visibleModules), [settings.visibleModules]);
  const fullShelfModules = shelfModules.slice(0, 2);
  const compactShelfModules = shelfModules.slice(2);
  const activeShelfModuleId = shelfModules.some((module) => module.id === activeModuleId) ? activeModuleId : shelfModules[0]?.id ?? "clipboard";
  const focusedModuleEnabled = shelfModules.some((module) => module.id === shell.focusedWidgetId);

  productivityRef.current = productivity;
  shellStateRef.current = shell;
  syncRef.current = sync;
  captureInboxRef.current = captureInbox;
  activeModuleRef.current = activeShelfModuleId;

  const enqueueSyncChange = useCallback<SyncChangeHandler>(
    (entityType, entityId, operation, payload) => syncRef.current.enqueue({ entityType, entityId, operation, payload }),
    []
  );

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    const requestedLayout = shell.mode === "collapsed" ? "collapsed" : "expanded";
    void platform.window.apply({
      mode: shell.mode,
      position: settings.position,
      monitorId: settings.selectedMonitorId,
      appearance: settings.theme,
      pinned: shell.pinned
    }).then((applied) => {
      if (!active) return;
      setAppliedLayout(applied.mode === "collapsed" ? "collapsed" : "expanded");
      if (applied.actualMonitorId !== settings.selectedMonitorId) updateSettings({ selectedMonitorId: applied.actualMonitorId });
    }).catch(() => {
      // Keep the web surface usable if a native layout operation fails.
      if (active) setAppliedLayout(requestedLayout);
    });
    return () => { active = false; };
  }, [hydrated, platform, settings.position, settings.selectedMonitorId, settings.theme, shell.mode, shell.pinned, updateSettings]);

  useEffect(() => platform.window.onIntent((intent) => {
    if (intent.type === "show-shelf") dispatch({ type: "show-shelf" });
    else if (intent.type === "collapse") dispatch({ type: "collapse", force: true });
    else if (intent.type === "toggle-pin") dispatch({ type: "toggle-pin" });
    else {
      const widget = widgetRegistry.find((candidate) => candidate.id === intent.widgetId);
      if (widget) dispatch({ type: "focus-widget", widgetId: widget.id });
    }
  }), [platform]);

  const openDeepLink = useCallback((payload: DeepLinkPayload) => {
    if (payload.route === "item" && payload.itemId) {
      const target = captureInbox.records.some((record) => record.item.id === payload.itemId)
        ? "clipboard"
        : productivity.notes.some((record) => record.id === payload.itemId)
          ? "notes"
          : productivity.todos.some((record) => record.id === payload.itemId)
            ? "todo"
            : productivity.reminders.some((record) => record.id === payload.itemId)
              ? "reminder"
              : productivity.saved.some((record) => record.id === payload.itemId)
                ? "library"
                : "clipboard";
      setActiveModuleId(target);
      dispatch({ type: "focus-widget", widgetId: target });
    }
  }, [captureInbox.records, platform, productivity.notes, productivity.reminders, productivity.saved, productivity.todos]);

  useEffect(() => platform.deepLinks.onOpen(openDeepLink), [openDeepLink, platform]);

  useEffect(() => {
    if (!hydrated || !captureInbox.hydrated) return;
    const applyRetention = () => {
      const protectedItemIds = productivityRef.current.saved
        .map((saved) => saved.sourceItemId)
        .filter((id): id is string => Boolean(id));
      captureInboxRef.current.cleanupClipboardRetention(settings.clipboardRetentionDays, protectedItemIds);
    };
    applyRetention();
    if (settings.clipboardRetentionDays >= 3650) return;
    const interval = window.setInterval(applyRetention, 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [captureInbox.hydrated, hydrated, settings.clipboardRetentionDays]);

  useEffect(() => {
    if (!hydrated || !settings.clipboardCaptureEnabled) return;

    return platform.clipboard.onChange((payload) => {
      if (payload.kind === "image" && payload.tempPath.startsWith("data:") && dataUrlByteSize(payload.tempPath) > maxDroppedFileBytes) {
        showTemporaryFeedback("Clipboard image is over 10MB");
        return;
      }

      const records = normalizeClipboardPayload(payload)
        .map((capture) => captureInboxRef.current.capture(capture))
        .filter((record): record is CapturedRecord => record !== null);

      for (const record of records) {
        void enqueueSyncChange("item", record.item.id, "create", record.item);
      }
    });
  }, [enqueueSyncChange, hydrated, platform, settings.clipboardCaptureEnabled]);

  useEffect(() => {
    return platform.files.onDrop((paths) => {
      clearHideTimer();
      dispatch({ type: "show-shelf" });
      const destination = resolveCaptureDestination(activeModuleRef.current);
      void Promise.all(readNativeFileInputs(paths).map(async (input) => {
        if (input.path && await isDroppedFileTooLarge(input.path)) {
          showTemporaryFeedback(`${input.name} is over 10MB`);
          return null;
        }
        return captureInboxRef.current.captureFilePath(input.path!);
      })).then((records) => {
        commitCaptured(records.filter((record): record is CapturedRecord => record !== null), destination);
        releaseDragSurface();
      });
    });
  }, [platform]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        if (shellStateRef.current.mode === "focus") dispatch({ type: "back" });
        else dispatch({ type: "collapse" });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const resetDrag = () => {
      inboxItemDragActive.current = false;
      releaseDragSurface();
    };
    window.addEventListener("dragend", resetDrag);
    window.addEventListener("drop", resetDrag);
    return () => {
      window.removeEventListener("dragend", resetDrag);
      window.removeEventListener("drop", resetDrag);
    };
  }, []);

  useEffect(() => {
    const onInboxItemDragStart = () => {
      inboxItemDragActive.current = true;
      pointerInside.current = false;
      clearHideTimer();
      clearInboxItemDragReleaseTimer();
      // Defer until the native dragstart handler has finished populating the
      // DataTransfer object, then hide immediately. Shell drag events can
      // otherwise reopen the shelf while the item is being dragged out.
      inboxItemDragReleaseTimer.current = window.setTimeout(releaseDragSurface, 0);
    };
    const onInboxItemDragEnd = () => {
      inboxItemDragActive.current = false;
      releaseDragSurface();
    };
    window.addEventListener("edgemagic:inbox-item-drag-start", onInboxItemDragStart);
    window.addEventListener("edgemagic:inbox-item-drag-end", onInboxItemDragEnd);
    return () => {
      window.removeEventListener("edgemagic:inbox-item-drag-start", onInboxItemDragStart);
      window.removeEventListener("edgemagic:inbox-item-drag-end", onInboxItemDragEnd);
      clearInboxItemDragReleaseTimer();
    };
  }, []);

  useEffect(() => () => {
    clearHideTimer();
    clearCollapseTimer();
    clearInboxItemDragReleaseTimer();
  }, []);

  useEffect(() => {
    const onPointerDown = (event: globalThis.PointerEvent) => {
      inputModality.current = "pointer";
      if ((event.target as Element | null)?.closest?.(".edgebar")) focusInside.current = false;
    };
    const onKeyDown = () => { inputModality.current = "keyboard"; };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Element;
      if (!target.closest?.(".edgebar, .edge-handle")) collapseWithAnimation();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [expanded]);

  function openShelf(moduleId = activeShelfModuleId) {
    keepShelfOpen();
    setActiveModuleId(moduleId);
    dispatch({ type: "show-shelf" });
  }

  function collapseWithAnimation(): void {
    clearHideTimer();
    if (shellStateRef.current.mode === "collapsed" || shellStateRef.current.pinned || closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    clearCollapseTimer();
    collapseTimer.current = window.setTimeout(finishCollapse, shelfExitFallbackMs);
  }

  function finishCollapse(): void {
    clearCollapseTimer();
    closingRef.current = false;
    setClosing(false);
    dispatch({ type: "collapse" });
  }

  function cancelCollapseAnimation(): void {
    clearCollapseTimer();
    closingRef.current = false;
    setClosing(false);
  }

  function keepShelfOpen(): void {
    clearHideTimer();
    cancelCollapseAnimation();
  }

  function clearDragState(): void {
    dragDepth.current = 0;
    dispatch({ type: "set-drag-active", active: false });
  }

  function releaseDragSurface(): void {
    clearInboxItemDragReleaseTimer();
    clearDragState();
    pointerInside.current = false;
    if (!shellStateRef.current.pinned) {
      clearHideTimer();
      window.setTimeout(collapseWithAnimation, 0);
    }
  }

  function scheduleHide() {
    clearHideTimer();
    // The surface may hide after leaving, but only when no real interaction is
    // active. Focus, tray-open, and drag sessions prevent an accidental hide.
    // The expanded surface can trigger synthetic mouseleave events while the
    // layout settles; guard against a visible peek/collapse loop at the edge.
    if (shellStateRef.current.pinned || pointerInside.current || focusInside.current || dragDepth.current > 0) {
      return;
    }

    hideTimer.current = window.setTimeout(() => {
      // A layout update can emit a synthetic leave while the pointer is still
      // parked on the activation edge. Avoid reopening and visibly jittering.
      if (pointerIsOnEdge()) {
        hideTimer.current = null;
        return;
      }
      collapseWithAnimation();
    }, settings.autoHideDelayMs);
  }

  function pointerIsOnEdge(): boolean {
    const { x } = lastPointerPosition.current;
    const edgeDistance = 36;
    return settings.position === "right" ? x >= window.innerWidth - edgeDistance : x <= edgeDistance;
  }

  function clearHideTimer() {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }

  function clearCollapseTimer() {
    if (collapseTimer.current !== null) {
      window.clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
  }

  function clearInboxItemDragReleaseTimer() {
    if (inboxItemDragReleaseTimer.current !== null) {
      window.clearTimeout(inboxItemDragReleaseTimer.current);
      inboxItemDragReleaseTimer.current = null;
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLElement>) {
    if (!settings.clipboardCaptureEnabled) {
      return;
    }

    const pastedFiles = Array.from(event.clipboardData.files ?? [])
      .map((file) => captureInbox.captureClipboardFile(file))
      .filter((record): record is CapturedRecord => record !== null);
    if (pastedFiles.length > 0) {
      pastedFiles.forEach((record) => {
        void enqueueSyncChange("item", record.item.id, "create", record.item);
      });
      setActiveModuleId("clipboard");
      dispatch({ type: "show-shelf" });
      return;
    }

    const pastedFilePaths = event.clipboardData.getData("text/uri-list")
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter((value) => value.startsWith("file://"))
      .map(fileUrlToPath);
    const uriRecords = pastedFilePaths
      .map((path) => captureInbox.captureClipboardFilePath(path))
      .filter((record): record is CapturedRecord => record !== null);
    if (uriRecords.length > 0) {
      uriRecords.forEach((record) => {
        void enqueueSyncChange("item", record.item.id, "create", record.item);
      });
      setActiveModuleId("clipboard");
      dispatch({ type: "show-shelf" });
      return;
    }

    const text = event.clipboardData.getData("text/plain");
    if (!text.trim()) {
      return;
    }

    const record = captureInbox.captureClipboardText(text);
    if (record) {
      void enqueueSyncChange("item", record.item.id, "create", record.item);
      setActiveModuleId("clipboard");
      dispatch({ type: "show-shelf" });
    }
  }

  function handleDragOver(event: DragEvent<HTMLElement>, targetModuleId = activeShelfModuleId) {
    if (inboxItemDragActive.current) return;
    event.preventDefault();
    event.stopPropagation();
    keepShelfOpen();
    setActiveModuleId(targetModuleId);
    dispatch({ type: "set-drag-active", active: true });
  }

  function handleDragEnter(event: DragEvent<HTMLElement>, targetModuleId = activeShelfModuleId) {
    if (inboxItemDragActive.current) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current += 1;
    keepShelfOpen();
    setActiveModuleId(targetModuleId);
    if (shellStateRef.current.mode === "collapsed") dispatch({ type: "show-shelf" });
    dispatch({ type: "set-drag-active", active: true });
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) dispatch({ type: "set-drag-active", active: false });
  }

  async function handleDrop(event: DragEvent<HTMLElement>, targetModuleId = activeShelfModuleId) {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    keepShelfOpen();
    const internal = parseItemTransfer(event.dataTransfer.getData(ITEM_TRANSFER_MIME));
    if (internal) {
      const record = captureInboxRef.current.records.find((candidate) => candidate.item.id === internal.itemId);
      const destination = resolveCaptureDestination(targetModuleId);
      if (record && destination !== "clipboard") {
        const created = productivityRef.current.createFromCapture(record, toProductivityTarget(destination));
        void enqueueSyncChange("module-record", created.id, "create", created);
        setFeedback(`Sent to ${destinationLabel(destination)}`);
        window.setTimeout(() => setFeedback(""), 2200);
      } else if (!record) {
        setFeedback("Item is no longer available");
      }
      releaseDragSurface();
      return;
    }
    const capturedRecords = (await Promise.all(readDropInputs(event.dataTransfer)
      .map(async (input) => {
        if (input.kind === "file") {
          if (input.file && input.file.size > maxDroppedFileBytes) {
            showTemporaryFeedback(`${input.name} is over 10MB`);
            return null;
          }
          if (!input.file && input.path && await isDroppedFileTooLarge(input.path)) {
            showTemporaryFeedback(`${input.name} is over 10MB`);
            return null;
          }
          if (input.file && input.mimeType.toLowerCase().startsWith("image/")) {
            const dataUrl = await readFileAsDataUrl(input.file);
            return captureInbox.captureImageData(dataUrl, input.name, input.mimeType);
          }
          if (input.path) return captureInbox.captureFilePath(input.path);
          if (!input.file) return null;
          if (!platform.files.persistDroppedFile) return captureInbox.captureFile(input.file);
          try {
            const bytes = new Uint8Array(await input.file.arrayBuffer());
            const persistedPath = await platform.files.persistDroppedFile(input.name, bytes);
            return captureInbox.captureFile(input.file, persistedPath, true);
          } catch (error) {
            console.error("Failed to persist dropped file:", input.name, error);
            setFeedback(`Could not save ${input.name}`);
            window.setTimeout(() => setFeedback(""), 2200);
            return null;
          }
        }
        if (input.kind === "image") {
          if (dataUrlByteSize(input.dataUrl) > maxDroppedFileBytes) {
            showTemporaryFeedback(`${input.name} is over 10MB`);
            return null;
          }
          return captureInbox.captureImageData(input.dataUrl, input.name, input.mimeType);
        }
        if (input.kind === "image-url") {
          try {
            const { dataUrl, mimeType } = await fetchImageAsDataUrl(input.url);
            if (dataUrlByteSize(dataUrl) > maxDroppedFileBytes) {
              showTemporaryFeedback(`${input.name} is over 10MB`);
              return null;
            }
            return captureInbox.captureImageData(dataUrl, input.name, mimeType);
          } catch {
            // CORS or network error — fall back to capturing as a link
            return captureInbox.captureUrl(input.url);
          }
        }
        return input.kind === "url" ? captureInbox.captureUrl(input.value) : captureInbox.captureText(input.value);
      })))
      .filter((record): record is CapturedRecord => record !== null);
    commitCaptured(capturedRecords, resolveCaptureDestination(targetModuleId));
    releaseDragSurface();
  }

  async function isDroppedFileTooLarge(path: string): Promise<boolean> {
    if (!platform.files.getFileSize) return false;
    try {
      return await platform.files.getFileSize(path) > maxDroppedFileBytes;
    } catch {
      return false;
    }
  }

  function showTemporaryFeedback(message: string): void {
    setFeedback(message);
    window.setTimeout(() => setFeedback(""), 2200);
  }

  function commitCaptured(records: CapturedRecord[], destination: CaptureDestination): void {
    for (const record of records) {
      void enqueueSyncChange("item", record.item.id, "create", record.item);
      if (destination !== "clipboard") {
        const target = destination === "notes" ? "note" : destination;
        const created = productivityRef.current.createFromCapture(record, target as "note" | "todo" | "reminder" | "saved");
        void enqueueSyncChange("module-record", created.id, "create", created);
      }
    }
    if (records.length > 0) setActiveModuleId(destination);
  }

  function renderWidgetContent(moduleId: ModuleId) {
    return <WidgetContent moduleId={moduleId} captureInbox={captureInbox} bookmarkSource={bookmarkSource} productivity={productivity} sync={sync} settings={settings} updateSettings={updateSettings} platform={platform} platformState={platformState} enqueueSyncChange={enqueueSyncChange} />;
  }

  return (
    <main
      className={`app-shell edge-${settings.position} density-${settings.density} theme-${settings.theme}`}
      data-state={shell.mode}
      data-drag-state={shell.dragActive ? "over" : "idle"}
      onPaste={handlePaste}
      onPointerMove={(event) => {
        lastPointerPosition.current = { x: event.clientX, y: event.clientY };
      }}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="sr-only" aria-live="polite">{feedback}</div>
      {!expanded && windowLayoutReady ? (
        <EdgeHandle
          onOpen={() => openShelf(activeShelfModuleId)}
          onHover={() => openShelf(activeShelfModuleId)}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        />
      ) : null}

      {expanded && windowLayoutReady ? (
        <section
          className={`edgebar edgebar-${shell.mode}${closing ? " is-closing" : ""}`}
          aria-label="EdgeMagic"
          onMouseEnter={keepShelfOpen}
          onMouseLeave={() => scheduleHide()}
          onPointerEnter={() => { pointerInside.current = true; keepShelfOpen(); }}
          onPointerLeave={() => { pointerInside.current = false; scheduleHide(); }}
          onFocusCapture={() => {
            focusInside.current = inputModality.current === "keyboard";
            keepShelfOpen();
          }}
          onBlurCapture={(event) => {
            focusInside.current = Boolean(event.currentTarget.contains(event.relatedTarget as Node | null));
            if (!focusInside.current) scheduleHide();
          }}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onAnimationEnd={(event) => {
            if (closing && event.animationName === "edge-shelf-out") finishCollapse();
          }}
        >
          {shell.mode === "focus" && shell.focusedWidgetId && focusedModuleEnabled ? (
            <FocusView title={widgetRegistry.find((module) => module.id === shell.focusedWidgetId)?.label ?? "Widget"} onBack={() => dispatch({ type: "back" })}>
              {renderWidgetContent(shell.focusedWidgetId)}
            </FocusView>
          ) : (
            <ShelfView cards={fullShelfModules.map((module) => (
              <WidgetCard key={module.id} module={module} active dropState={shell.dragActive ? (activeModuleId === module.id ? "over" : "eligible") : "idle"} onDragOver={(event) => handleDragOver(event, module.id)} onDrop={(event) => { void handleDrop(event, module.id); }}>{renderWidgetContent(module.id)}</WidgetCard>
            ))} actions={<>
              {compactShelfModules.map((module) => (
                  <button
                    key={module.id}
                    type="button"
                    className="compact-widget-button"
                    data-widget={module.id}
                    aria-label={`Open ${module.label}`}
                    title={module.label}
                    onClick={() => { setActiveModuleId(module.id); dispatch({ type: "focus-widget", widgetId: module.id }); }}
                  >
                    <module.icon size={17} aria-hidden="true" />
                  </button>
                ))}
              <button type="button" className="compact-widget-button" aria-label={shell.pinned ? "Unpin shelf" : "Pin shelf"} title={shell.pinned ? "Unpin shelf" : "Pin shelf"} aria-pressed={shell.pinned} onClick={() => dispatch({ type: "toggle-pin" })}>
                {shell.pinned ? <PinOff size={17} aria-hidden="true" /> : <Pin size={17} aria-hidden="true" />}
              </button>
            </>} />
          )}
        </section>
      ) : null}
    </main>
  );
}

function getEnabledShelfModules(visibleModules: string[]): Array<typeof widgetRegistry[number]> {
  const registeredModules = new Map(widgetRegistry.map((module) => [module.id, module]));
  return [...new Set(visibleModules)]
    .map((id) => registeredModules.get(id as ModuleId))
    .filter((module): module is typeof widgetRegistry[number] => Boolean(module));
}

function fileUrlToPath(value: string): string {
  try {
    const url = new URL(value);
    const decodedPath = decodeURIComponent(url.pathname);
    return url.host ? `\\\\${url.host}${decodedPath.replace(/\//g, "\\")}` : decodedPath.replace(/^\/([A-Za-z]:)/, "$1").replace(/\//g, "\\");
  } catch {
    return value.slice("file://".length);
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("Could not read the dropped image."));
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Could not read the dropped image.")));
    reader.readAsDataURL(file);
  });
}

function dataUrlByteSize(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0 || !dataUrl.slice(0, commaIndex).includes(";base64")) return 0;
  const base64 = dataUrl.slice(commaIndex + 1).replace(/\s/g, "");
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor(base64.length * 3 / 4) - padding;
}

async function fetchImageAsDataUrl(url: string): Promise<{ dataUrl: string; mimeType: string }> {
  // Use an <img> element drawn onto a canvas to avoid CORS issues.
  // WebViews can render cross-origin images without CORS headers (like a
  // normal <img> tag), whereas fetch() with mode:"cors" would be blocked by
  // many CDNs (Pinterest, Google Images, etc.).
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.referrerPolicy = "no-referrer";

    img.addEventListener("load", () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not available")); return; }
      ctx.drawImage(img, 0, 0);
      try {
        const dataUrl = canvas.toDataURL("image/png");
        resolve({ dataUrl, mimeType: "image/png" });
      } catch {
        reject(new Error("Canvas tainted by cross-origin image (CORS blocked)"));
      }
    });

    img.addEventListener("error", () => reject(new Error("Image failed to load")));
    img.src = url;
  });
}
