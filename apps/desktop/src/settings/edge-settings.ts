import type { AppearanceMode, EdgeWindowPosition, PluginPermission } from "@edgemagic/module-api";

export type EdgePosition = EdgeWindowPosition;
export type EdgeDensity = "compact" | "comfortable" | "spacious";
export type EdgeTheme = AppearanceMode;

export interface EdgeSettings {
  settingsVersion: number;
  position: EdgePosition;
  density: EdgeDensity;
  theme: EdgeTheme;
  autoHideDelayMs: number;
  selectedMonitorId: string;
  startupAtLogin: boolean;
  clipboardCaptureEnabled: boolean;
  clipboardRetentionDays: number;
  bookmarkSourceEnabled: boolean;
  enabledPlugins: string[];
  pluginPermissionGrants: Record<string, PluginPermission[]>;
  visibleModules: string[];
  peekWidgetIds: string[];
}

export type EdgeSettingsPatch = Partial<EdgeSettings> | ((current: EdgeSettings) => Partial<EdgeSettings>);

export const defaultEdgeSettings: EdgeSettings = {
  settingsVersion: 2,
  position: "right",
  density: "comfortable",
  theme: preferredColorScheme(),
  autoHideDelayMs: 450,
  selectedMonitorId: "primary",
  startupAtLogin: false,
  clipboardCaptureEnabled: true,
  clipboardRetentionDays: 7,
  bookmarkSourceEnabled: true,
  enabledPlugins: [],
  pluginPermissionGrants: {},
  visibleModules: ["clipboard", "notes", "todo", "reminder", "library", "settings"],
  peekWidgetIds: ["clipboard", "notes"]
};
const validModuleIds = new Set(["clipboard", "notes", "todo", "reminder", "library", "settings"]);
const validPeekModuleIds = new Set(["clipboard", "notes", "todo", "reminder", "library"]);

export function normalizeEdgeSettings(parsed: Partial<EdgeSettings> | Record<string, unknown>): EdgeSettings {
  const input = parsed as Partial<EdgeSettings> & Record<string, unknown>;
  const settingsVersion = input.settingsVersion === 2 ? 2 : 1;
  const clipboardRetentionDays = settingsVersion === 1 && input.clipboardRetentionDays === 30 ? 7 : input.clipboardRetentionDays;
  const visibleModules = normalizeVisibleModules(input.visibleModules);
  const peekWidgetIds = normalizePeekWidgetIds(input.peekWidgetIds, visibleModules);
  return {
    ...defaultEdgeSettings,
    ...input,
    settingsVersion: 2,
    autoHideDelayMs: normalizeAutoHideDelay(input.autoHideDelayMs),
    clipboardRetentionDays: normalizeRetentionDays(clipboardRetentionDays),
    position: input.position === "left" ? "left" : "right",
    density: normalizeDensity(input.density),
    theme: normalizeTheme(input.theme),
    enabledPlugins: Array.isArray(input.enabledPlugins) ? input.enabledPlugins.map(String) : defaultEdgeSettings.enabledPlugins,
    pluginPermissionGrants: isPluginGrantRecord(input.pluginPermissionGrants) ? input.pluginPermissionGrants : defaultEdgeSettings.pluginPermissionGrants,
    visibleModules,
    peekWidgetIds
  };
}

function normalizeVisibleModules(value: unknown): string[] {
  if (!Array.isArray(value)) return defaultEdgeSettings.visibleModules;
  const mapped = value.map(String).map((id) => id === "saved" || id === "bookmarks" ? "library" : id);
  const visibleModules = [...new Set(mapped)].filter((id) => validModuleIds.has(id));
  return visibleModules.includes("settings") ? visibleModules : [...visibleModules, "settings"];
}

function normalizePeekWidgetIds(value: unknown, visibleModules: string[]): string[] {
  const fallback = visibleModules.filter((id) => validPeekModuleIds.has(id)).slice(0, 2);
  if (!Array.isArray(value)) return fallback;

  const mapped = value.map(String).map((id) => id === "saved" || id === "bookmarks" ? "library" : id);
  const peekWidgetIds = [...new Set(mapped)]
    .filter((id) => validPeekModuleIds.has(id) && visibleModules.includes(id))
    .slice(0, 2);
  return peekWidgetIds.length > 0 ? peekWidgetIds : fallback;
}

function normalizeTheme(value: unknown): EdgeTheme {
  if (value === "dark" || value === "light") return value;
  return preferredColorScheme();
}

function normalizeDensity(value: unknown): EdgeDensity {
  return value === "compact" || value === "comfortable" || value === "spacious"
    ? value
    : defaultEdgeSettings.density;
}

function normalizeAutoHideDelay(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultEdgeSettings.autoHideDelayMs;
  return Math.min(10_000, Math.max(0, Math.round(value)));
}

function normalizeRetentionDays(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultEdgeSettings.clipboardRetentionDays;
  return Math.min(3650, Math.max(1, Math.floor(value)));
}

function preferredColorScheme(): "dark" | "light" {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function isPluginGrantRecord(value: unknown): value is Record<string, PluginPermission[]> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
