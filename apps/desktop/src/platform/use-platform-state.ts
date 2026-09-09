import type { MonitorInfo, PlatformCapabilities, PlatformService } from "@edgemagic/module-api";
import { useEffect, useState } from "react";

const defaultCapabilities: PlatformCapabilities = {
  transparency: false,
  blur: false,
  notificationActions: false,
  screenshots: false,
  startupAtLogin: false,
  deepLinks: false
};

export function usePlatformState(platform: PlatformService, startupAtLogin: boolean) {
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [capabilities, setCapabilities] = useState<PlatformCapabilities>(defaultCapabilities);

  useEffect(() => {
    let active = true;

    void Promise.all([platform.monitors.list(), platform.capabilities.get(), platform.startup.isEnabled()]).then(
      ([nextMonitors, nextCapabilities]) => {
        if (!active) {
          return;
        }
        setMonitors(nextMonitors);
        setCapabilities({ ...nextCapabilities, startupAtLogin: nextCapabilities.startupAtLogin });
      }
    );

    return () => {
      active = false;
    };
  }, [platform]);

  useEffect(() => {
    if (capabilities.startupAtLogin) {
      void platform.startup.setEnabled(startupAtLogin);
    }
  }, [capabilities.startupAtLogin, platform, startupAtLogin]);

  return { monitors, capabilities };
}
