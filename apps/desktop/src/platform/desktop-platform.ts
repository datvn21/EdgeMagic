import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { disable as disableAutostart, enable as enableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import { listen as listenToTauriEvent } from "@tauri-apps/api/event";
import { getCurrentWebview, type DragDropEvent } from "@tauri-apps/api/webview";
import { availableMonitors, primaryMonitor } from "@tauri-apps/api/window";
import { register as registerGlobalShortcut, unregister as unregisterGlobalShortcut } from "@tauri-apps/plugin-global-shortcut";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { openPath, openUrl as openUrlInBrowser, revealItemInDir } from "@tauri-apps/plugin-opener";
import type {
  AppliedEdgeWindowState,
  ApplyEdgeWindowRequest,
  DeepLinkPayload,
  EdgeWindowIntent,
  FileDropEvent,
  PlatformService,
  Unregister
} from "@edgemagic/module-api";
import { readDesktopJson, writeDesktopJson } from "../data/desktop-store.js";

interface DesktopPlatformOptions {
  invokeCommand?: typeof tauriInvoke;
  isTauriRuntime?: () => boolean;
}

export function createDesktopPlatform(options: DesktopPlatformOptions = {}): PlatformService {
  let startupEnabled = false;
  void readDesktopJson("edgemagic.startup-at-login", false).then((enabled) => {
    startupEnabled = enabled === true;
  });
  const invokeCommand = options.invokeCommand ?? tauriInvoke;
  const isTauriRuntime = options.isTauriRuntime ?? isRunningInTauri;

  return {
    clipboard: {
      read: () => readClipboard(isTauriRuntime),
      onChange: (handler) => subscribeClipboard(handler)
    },
    window: {
      apply: async (request) => {
        return invokeEdgeWindowApply(invokeCommand, isTauriRuntime, request);
      },
      onIntent: (handler) => subscribeWindowIntents(handler, isTauriRuntime)
    },
    notifications: {
      send: (request) => sendNativeNotification(request, isTauriRuntime)
    },
    shortcuts: {
      register: async (binding, handler) => registerShortcut(binding, handler)
    },
    tray: {
      setMenu: async () => {}
    },
    files: {
      showInFolder: async (path) => {
        if (!isTauriRuntime()) throw new Error("Opening files requires the Tauri runtime.");
        await revealItemInDir(path);
      },
      open: async (path) => {
        if (!isTauriRuntime()) {
          const fileUrl = path.startsWith("file://") ? path : `file:///${path.replace(/\\/g, "/")}`;
          window.open(fileUrl, "_blank", "noopener,noreferrer");
          return;
        }
        await openPath(path);
      },
      openUrl: async (url) => {
        if (isTauriRuntime()) {
          await openUrlInBrowser(url);
        } else {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      },
      saveText: async (filename, contents) => {
        if (!isTauriRuntime()) {
          return downloadTextFile(filename, contents);
        }
        const path = await withTimeout(
          invokeCommand<string>("save_backup_file", { filename, contents }),
          10000,
          "Saving the backup timed out."
        );
        await revealItemInDir(path);
        return path;
      },
      ...(isTauriRuntime()
        ? {
            openManagedFile: async (path: string) =>
              invokeCommand<void>("open_managed_file", { path }),
            getFileSize: async (path: string) =>
              invokeCommand<number>("get_file_size", { path }),
            persistDroppedFile: async (filename: string, bytes: Uint8Array) =>
              invokeCommand<string>("persist_dropped_file", { filename, bytes: Array.from(bytes) }),
            deleteDroppedFile: async (path: string) =>
              invokeCommand<void>("delete_dropped_file", { path })
          }
        : {}),
      onDrop: (handler) => subscribeNativeFileDrop(handler, isTauriRuntime),
      onDropEvent: (handler) => subscribeNativeFileDropEvent(handler, isTauriRuntime)
    },
    monitors: {
      list: () => listNativeMonitors(isTauriRuntime)
    },
    startup: {
      isEnabled: async () => {
        if (isTauriRuntime()) {
          startupEnabled = await isAutostartEnabled();
        }
        return startupEnabled;
      },
      setEnabled: async (enabled) => {
        startupEnabled = enabled;
        if (isTauriRuntime()) {
          if (enabled) {
            await enableAutostart();
          } else {
            await disableAutostart();
          }
          return;
        }
        await writeDesktopJson("edgemagic.startup-at-login", enabled);
      }
    },
    deepLinks: {
      onOpen: (handler) => registerDeepLinkListener(handler),
      parse: parseEdgeMagicDeepLink
    },
    screenshots: {
      capture: async () => {
        if (!isTauriRuntime()) {
          return { tempPath: "screenshot-preview.png", filename: "Screenshot preview.png", mimeType: "image/png", byteSize: 0, monitorId: "primary" };
        }
        throw new Error("Screenshot capture is not available until a native screenshot adapter is installed.");
      }
    },
    capabilities: {
      get: async () => ({
        transparency: true,
        blur: false,
        notificationActions: false,
        screenshots: !isTauriRuntime(),
        startupAtLogin: true,
        deepLinks: true
      })
    }
  };
}

async function readClipboard(isTauriRuntime: () => boolean) {
  if (!isTauriRuntime() || !navigator.clipboard) return null;
  const text = await navigator.clipboard.readText();
  return text ? { kind: "text" as const, text } : null;
}

function subscribeClipboard(handler: (payload: import("@edgemagic/types").ClipboardPayload) => void): Unregister {
  // In Tauri runtime, the Rust backend watches the system clipboard via
  // AddClipboardFormatListener and emits "clipboard-changed" events.
  if (isRunningInTauri()) {
    let active = true;
    let unlisten: (() => void) | undefined;

    // Use explicit cast to work around strict-mode "untyped function call" check.
    type Listen = (event: string, cb: (e: { payload: NativeClipboardEvent }) => void) => Promise<() => void>;
    void (listenToTauriEvent as unknown as Listen)("clipboard-changed", (event) => {
      if (!active) return;
      const native = event.payload;
      if (native.kind === "text") {
        handler({ kind: "text", text: native.text });
      } else if (native.kind === "fileList") {
        handler({ kind: "file-list", paths: native.paths });
      } else if (native.kind === "image") {
        handler({ kind: "image", tempPath: `data:image/png;base64,${native.png_base64}` });
      }
    }).then((remove) => {
      if (active) unlisten = remove;
      else remove();
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }

  // Browser / dev mode fallback: listen to paste events directed at this window
  const onPaste = (event: ClipboardEvent) => {
    const text = event.clipboardData?.getData("text/plain");
    if (text) handler({ kind: "text", text });
  };
  window.addEventListener("paste", onPaste);
  return () => window.removeEventListener("paste", onPaste);
}

/** Shape of the native event payload emitted by the Rust clipboard watcher. */
interface NativeClipboardEvent {
  kind: "text" | "fileList" | "image";
  // text
  text: string;
  // fileList
  paths: string[];
  // image
  png_base64: string;
}


async function sendNativeNotification(
  request: { title: string; body?: string },
  isTauriRuntime: () => boolean
): Promise<void> {
  if (!isTauriRuntime()) throw new Error("Native notifications require the Tauri runtime.");
  let granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === "granted";
  if (!granted) throw new Error("Notification permission was not granted.");
  await sendNotification({ title: request.title, ...(request.body ? { body: request.body } : {}) });
}

async function listNativeMonitors(isTauriRuntime: () => boolean) {
  if (!isTauriRuntime()) return [];
  const monitors = await availableMonitors();
  const primary = await primaryMonitor();
  return monitors.map((monitor, index) => ({
    id: monitor.name ?? "monitor-" + (index + 1),
    ...(monitor.name ? { name: monitor.name } : {}),
    primary: monitor.name !== null && monitor.name === primary?.name
  }));
}

function subscribeNativeFileDrop(handler: (paths: string[]) => void, isTauriRuntime: () => boolean): Unregister {
  return subscribeNativeFileDropEvent((event) => {
    if (event.type === "drop") handler(event.paths);
  }, isTauriRuntime);
}

function subscribeNativeFileDropEvent(handler: (event: FileDropEvent) => void, isTauriRuntime: () => boolean): Unregister {
  if (!isTauriRuntime()) return () => {};
  let active = true;
  let unlisten: (() => void) | undefined;
  void getCurrentWebview().onDragDropEvent((event: { payload: DragDropEvent }) => {
    if (!active) return;
    const payload = event.payload;
    if (payload.type === "enter" || payload.type === "drop") {
      handler({ type: payload.type, paths: payload.paths });
      return;
    }
    handler({ type: payload.type });
  }).then((remove) => {
    if (active) unlisten = remove;
    else remove();
  });
  return () => {
    active = false;
    unlisten?.();
  };
}

async function invokeEdgeWindowApply(
  invokeCommand: typeof tauriInvoke,
  isTauriRuntime: () => boolean,
  request: ApplyEdgeWindowRequest
): Promise<AppliedEdgeWindowState> {
  if (!isTauriRuntime()) {
    return {
      mode: request.mode,
      position: request.position,
      actualMonitorId: request.monitorId,
      appearance: request.appearance
    };
  }

  return invokeCommand<AppliedEdgeWindowState>("apply_edge_window", { request });
}

function subscribeWindowIntents(handler: (intent: EdgeWindowIntent) => void, isTauriRuntime: () => boolean): Unregister {
  let active = true;
  let unlisten: Unregister | undefined;
  const onBrowserIntent = (event: Event) => handler((event as CustomEvent<EdgeWindowIntent>).detail);
  window.addEventListener("edgemagic:window-intent", onBrowserIntent);
  if (isTauriRuntime()) {
    void listenToTauriEvent<EdgeWindowIntent>("edge-window://intent", (event) => {
      if (active) handler(event.payload);
    }).then((remove) => {
      if (active) unlisten = remove;
      else remove();
    });
  }
  return () => {
    active = false;
    unlisten?.();
    window.removeEventListener("edgemagic:window-intent", onBrowserIntent);
  };
}

function isRunningInTauri(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const tauriWindow = window as typeof window & {
    isTauri?: () => boolean;
    __TAURI_INTERNALS__?: unknown;
  };

  if (typeof tauriWindow.isTauri === "function") {
    return tauriWindow.isTauri();
  }

  return "__TAURI_INTERNALS__" in tauriWindow;
}

function downloadTextFile(filename: string, contents: string): string {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return filename;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

export function parseEdgeMagicDeepLink(url: string): DeepLinkPayload {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "edgemagic:") {
      return { url, route: "unknown" };
    }

    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const route = parsed.hostname || pathParts[0];
    if (route === "item") {
      const itemId = parsed.searchParams.get("id") ?? pathParts[1];
      return itemId ? { url, route: "item", itemId } : { url, route: "unknown" };
    }

    return { url, route: "unknown" };
  } catch {
    return { url, route: "unknown" };
  }
}

function registerBrowserShortcut(binding: string, handler: () => void): Unregister {
  const onKeyDown = (event: KeyboardEvent) => {
    if (binding === "Ctrl+Space" && event.ctrlKey && event.code === "Space") {
      event.preventDefault();
      handler();
    }
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}

async function registerShortcut(binding: string, handler: () => void): Promise<Unregister> {
  if (!isRunningInTauri()) {
    return registerBrowserShortcut(binding, handler);
  }

  const tauriBinding = toTauriShortcut(binding);
  await registerGlobalShortcut(tauriBinding, (event) => {
    if (event.state === "Pressed") {
      handler();
    }
  });

  return () => {
    void unregisterGlobalShortcut(tauriBinding);
  };
}

function toTauriShortcut(binding: string): string {
  return binding.replace(/^Ctrl\+/i, "CommandOrControl+");
}

function registerDeepLinkListener(handler: (payload: DeepLinkPayload) => void): Unregister {
  const onOpen = (event: Event) => {
    const detail = (event as CustomEvent<{ url: string }>).detail;
    if (detail?.url) {
      handler(parseEdgeMagicDeepLink(detail.url));
    }
  };

  window.addEventListener("edgemagic:open-url", onOpen);
  return () => window.removeEventListener("edgemagic:open-url", onOpen);
}
