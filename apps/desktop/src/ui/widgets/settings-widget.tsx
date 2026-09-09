import { usePlatformState } from "../../platform/use-platform-state.js";
import { useEdgeSettings } from "../../settings/use-edge-settings.js";
import type { PlatformService } from "@edgemagic/module-api";
import type { ProductivityWorkspace } from "./widget-types.js";
import { useCaptureInbox } from "../../capture/use-capture-inbox.js";
import { DataOwnershipSection, PeekSettings } from "./settings-sections.js";
import { Checkbox } from "../../shared/ui/atoms/checkbox.js";
import { Heading } from "../../shared/ui/atoms/heading.js";

export interface SettingsWidgetProps {
  settings: ReturnType<typeof useEdgeSettings>["settings"];
  updateSettings: ReturnType<typeof useEdgeSettings>["updateSettings"];
  captureInbox: ReturnType<typeof useCaptureInbox>;
  productivity: ProductivityWorkspace;
  platform: PlatformService;
  platformState: ReturnType<typeof usePlatformState>;
}

export function SettingsWidget({
  settings,
  updateSettings,
  captureInbox,
  productivity,
  platform,
  platformState
}: SettingsWidgetProps) {
  return (
    <div className="settings-stack">
      <section className="settings-section settings-preferences" aria-label="Preferences">
        <Heading level={2}>Preferences</Heading>
        <div className="settings-grid settings-fields">
          <label>
            Position
            <select value={settings.position} onChange={(event) => updateSettings({ position: event.target.value as typeof settings.position })}>
            <option value="left">Left</option>
            <option value="right">Right</option>
            </select>
          </label>
          <label>
            Density
            <select value={settings.density} onChange={(event) => updateSettings({ density: event.target.value as typeof settings.density })}>
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
            <option value="spacious">Spacious</option>
            </select>
          </label>
          <label>
            Theme
            <select value={settings.theme} onChange={(event) => updateSettings({ theme: event.target.value as typeof settings.theme })}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            </select>
          </label>
          <label>
            Monitor
            <select
              value={settings.selectedMonitorId}
              onChange={(event) => updateSettings({ selectedMonitorId: event.target.value })}
            >
            {(platformState.monitors.length > 0
              ? platformState.monitors
              : [{ id: "primary", name: "Primary Display", primary: true }, { id: "current", name: "Current Display", primary: false }]
            ).map((monitor) => (
              <option key={monitor.id} value={monitor.id}>
                {monitor.name ?? monitor.id}
              </option>
            ))}
            {platformState.monitors.length > 0 && !platformState.monitors.some((monitor) => monitor.id === "current") ? <option value="current">Current Display</option> : null}
            </select>
          </label>
          <label>
            Clipboard retention
            <select
              value={settings.clipboardRetentionDays}
              onChange={(event) => updateSettings({ clipboardRetentionDays: Number(event.target.value) })}
            >
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={3650}>Forever</option>
            </select>
          </label>
        </div>
        <div className="settings-toggles">
          <Checkbox checked={settings.clipboardCaptureEnabled} onChange={(event) => updateSettings({ clipboardCaptureEnabled: event.target.checked })} label="Clipboard capture" />
          <Checkbox checked={settings.bookmarkSourceEnabled} onChange={(event) => updateSettings({ bookmarkSourceEnabled: event.target.checked })} label="Browser bookmarks" />
          {platformState.capabilities.startupAtLogin ? (
            <Checkbox checked={settings.startupAtLogin} onChange={(event) => updateSettings({ startupAtLogin: event.target.checked })} label="Launch at login" />
          ) : null}
        </div>
      </section>
      <PeekSettings settings={settings} updateSettings={updateSettings} />
      <DataOwnershipSection
        settings={settings}
        updateSettings={updateSettings}
        captureInbox={captureInbox}
        productivity={productivity}
        platform={platform}
      />
    </div>
  );
}
