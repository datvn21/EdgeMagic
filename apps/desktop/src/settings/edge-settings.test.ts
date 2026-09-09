import { describe, expect, it, vi } from "vitest";
import { normalizeEdgeSettings } from "./edge-settings.js";

describe("normalizeEdgeSettings", () => {
  it.each(["top", "bottom"])("migrates %s to right", (position) => {
    expect(normalizeEdgeSettings({ position }).position).toBe("right");
  });

  it("resolves the legacy system theme to the current OS scheme", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    expect(normalizeEdgeSettings({ theme: "system" }).theme).toBe("light");
  });

  it("derives the full shelf widgets from the first two enabled modules", () => {
    const settings = normalizeEdgeSettings({
      visibleModules: ["todo", "reminder", "clipboard", "settings", "unknown", "saved", "bookmarks"],
      peekWidgetIds: ["clipboard", "notes"]
    });

    expect(settings.visibleModules).toEqual(["todo", "reminder", "clipboard", "settings", "library"]);
    expect(settings.peekWidgetIds).toEqual(["todo", "reminder"]);
  });

  it("clamps unsafe numeric settings and rejects unknown density values", () => {
    const settings = normalizeEdgeSettings({
      density: "giant",
      autoHideDelayMs: -100,
      clipboardRetentionDays: -30
    });

    expect(settings.density).toBe("comfortable");
    expect(settings.autoHideDelayMs).toBe(0);
    expect(settings.clipboardRetentionDays).toBe(1);
  });
});
