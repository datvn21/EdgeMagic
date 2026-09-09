import { useCallback, useEffect, useState } from "react";
import { readDesktopJson, writeDesktopJson } from "../data/desktop-store.js";
import {
  defaultEdgeSettings,
  normalizeEdgeSettings,
  type EdgeSettings,
  type EdgeSettingsPatch
} from "./edge-settings.js";

export type { EdgeDensity, EdgePosition, EdgeSettings, EdgeSettingsPatch, EdgeTheme } from "./edge-settings.js";

const storageKey = "edgemagic.edge-settings";

export function useEdgeSettings() {
  const [settings, setSettings] = useState<EdgeSettings>(defaultEdgeSettings);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    void readDesktopJson(storageKey, defaultEdgeSettings).then((loaded) => {
      if (mounted) {
        setSettings(normalizeEdgeSettings(loaded));
        setHydrated(true);
      }
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (hydrated) void writeDesktopJson(storageKey, settings);
  }, [hydrated, settings]);

  const updateSettings = useCallback((patch: EdgeSettingsPatch) => {
    setSettings((current) => normalizeEdgeSettings({
      ...current,
      ...(typeof patch === "function" ? patch(current) : patch)
    }));
  }, []);

  return {
    settings,
    hydrated,
    updateSettings
  };
}
