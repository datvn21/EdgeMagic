import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDesktopPlatform, parseEdgeMagicDeepLink } from "./desktop-platform.js";

const autostart = vi.hoisted(() => ({
  disable: vi.fn().mockResolvedValue(undefined),
  enable: vi.fn().mockResolvedValue(undefined),
  isEnabled: vi.fn().mockResolvedValue(false)
}));

vi.mock("@tauri-apps/plugin-autostart", () => autostart);
vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: vi.fn().mockResolvedValue(undefined),
  openUrl: vi.fn().mockResolvedValue(undefined),
  revealItemInDir: vi.fn().mockResolvedValue(undefined)
}));

describe("desktop platform", () => {
  beforeEach(() => {
    autostart.disable.mockClear();
    autostart.enable.mockClear();
    autostart.isEnabled.mockReset();
    autostart.isEnabled.mockResolvedValue(false);
  });

  it("parses item deep links", () => {
    expect(parseEdgeMagicDeepLink("edgemagic://item?id=item-123")).toEqual({
      url: "edgemagic://item?id=item-123",
      route: "item",
      itemId: "item-123"
    });
  });

  it("rejects removed search deep links", () => {
    expect(parseEdgeMagicDeepLink("edgemagic://search?q=notes")).toEqual({
      url: "edgemagic://search?q=notes",
      route: "unknown"
    });
  });

  it("falls back for unknown links", () => {
    expect(parseEdgeMagicDeepLink("https://example.com")).toEqual({
      url: "https://example.com",
      route: "unknown"
    });
  });

  it("invokes native edge window layout when running in Tauri", async () => {
    const applied = { mode: "focus", position: "left", actualMonitorId: "current", appearance: "dark" } as const;
    const invokeCommand = vi.fn().mockResolvedValue(applied);
    Object.defineProperty(window, "isTauri", {
      configurable: true,
      value: () => true
    });

    const platform = createDesktopPlatform({ invokeCommand });

    const request = { mode: "focus", position: "left", monitorId: "current", appearance: "dark", pinned: false } as const;
    await expect(platform.window.apply(request)).resolves.toEqual(applied);

    expect(invokeCommand).toHaveBeenCalledWith("apply_edge_window", { request });

    Reflect.deleteProperty(window, "isTauri");
  });

  it("does not invoke native edge layout in a browser runtime", async () => {
    const invokeCommand = vi.fn().mockResolvedValue(undefined);
    const platform = createDesktopPlatform({ invokeCommand, isTauriRuntime: () => false });

    await expect(platform.window.apply({ mode: "shelf", position: "right", monitorId: "primary", appearance: "light", pinned: false })).resolves.toMatchObject({ appearance: "light" });

    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("persists a dropped browser file through the native backend", async () => {
    const invokeCommand = vi.fn().mockResolvedValue("C:\\Cache\\report.pdf");
    const platform = createDesktopPlatform({ invokeCommand, isTauriRuntime: () => true });

    await expect(platform.files.persistDroppedFile?.("report.pdf", new Uint8Array([1, 2, 3])))
      .resolves.toBe("C:\\Cache\\report.pdf");
    expect(invokeCommand).toHaveBeenCalledWith("persist_dropped_file", {
      filename: "report.pdf",
      bytes: [1, 2, 3]
    });
  });

  it("saves text files through the native backend", async () => {
    const invokeCommand = vi.fn().mockResolvedValue("C:\\Users\\Dash\\Downloads\\backup.json");
    const platform = createDesktopPlatform({ invokeCommand, isTauriRuntime: () => true });

    await expect(platform.files.saveText?.("backup.json", "{}")).resolves.toBe("C:\\Users\\Dash\\Downloads\\backup.json");

    expect(invokeCommand).toHaveBeenCalledWith("save_backup_file", {
      filename: "backup.json",
      contents: "{}"
    });
  });

  it("deletes only through the managed-file backend command", async () => {
    const invokeCommand = vi.fn().mockResolvedValue(undefined);
    const platform = createDesktopPlatform({ invokeCommand, isTauriRuntime: () => true });

    await platform.files.deleteDroppedFile?.("C:\\Cache\\report.pdf");

    expect(invokeCommand).toHaveBeenCalledWith("delete_dropped_file", {
      path: "C:\\Cache\\report.pdf"
    });
  });

  it("opens a managed copy through the validated native command", async () => {
    const invokeCommand = vi.fn().mockResolvedValue(undefined);
    const platform = createDesktopPlatform({ invokeCommand, isTauriRuntime: () => true });

    await platform.files.openManagedFile?.("C:\\Cache\\report.pdf");

    expect(invokeCommand).toHaveBeenCalledWith("open_managed_file", {
      path: "C:\\Cache\\report.pdf"
    });
  });

  it("reads file size through the native backend", async () => {
    const invokeCommand = vi.fn().mockResolvedValue(1024);
    const platform = createDesktopPlatform({ invokeCommand, isTauriRuntime: () => true });

    await expect(platform.files.getFileSize?.("C:\\Cache\\report.pdf")).resolves.toBe(1024);

    expect(invokeCommand).toHaveBeenCalledWith("get_file_size", {
      path: "C:\\Cache\\report.pdf"
    });
  });

  it("uses the native autostart plugin in a Tauri runtime", async () => {
    autostart.isEnabled.mockResolvedValueOnce(true);
    const platform = createDesktopPlatform({ isTauriRuntime: () => true });

    await expect(platform.startup.isEnabled()).resolves.toBe(true);
    await platform.startup.setEnabled(true);
    await platform.startup.setEnabled(false);

    expect(autostart.isEnabled).toHaveBeenCalled();
    expect(autostart.enable).toHaveBeenCalled();
    expect(autostart.disable).toHaveBeenCalled();
  });

  it("subscribes to browser window intents", () => {
    const platform = createDesktopPlatform({ isTauriRuntime: () => false });
    const handler = vi.fn();
    const dispose = platform.window.onIntent(handler);
    window.dispatchEvent(new CustomEvent("edgemagic:window-intent", { detail: { type: "show-shelf" } }));
    expect(handler).toHaveBeenCalledWith({ type: "show-shelf" });
    dispose();
  });
});
