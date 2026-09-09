import { useState } from "react";
import { createBackup, parseBackup, previewBackup, recordsFromBackup, serializeBackup } from "../../data/backup.js";
import { defaultEdgeSettings } from "../../settings/edge-settings.js";
import type { DeletedProductivityRecord } from "../../productivity/use-productivity-workspace.js";
import type { ProductivityWorkspace } from "./widget-types.js";
import { widgetRegistry } from "../widget-registry.js";
import type { SettingsWidgetProps } from "./settings-widget.js";
import { Checkbox } from "../../shared/ui/atoms/checkbox.js";
import { Heading } from "../../shared/ui/atoms/heading.js";
import { IconButton } from "../../shared/ui/atoms/icon-button.js";
import { Button } from "../../shared/ui/atoms/button.js";
import { ChevronDown, ChevronUp, RotateCcw, Trash2 } from "lucide-react";

export function PeekSettings({ settings, updateSettings }: Pick<SettingsWidgetProps, "settings" | "updateSettings">) {
  const modules = widgetRegistry;
  const enabledModules = settings.visibleModules
    .map((id) => modules.find((module) => module.id === id))
    .filter((module): module is (typeof modules)[number] => Boolean(module));
  const enabledIds = enabledModules.map((module) => module.id);
  const orderedModules = [...enabledModules, ...modules.filter((module) => !enabledIds.includes(module.id))];
  function toggle(id: string, checked: boolean) {
    if (id === "settings" && !checked) return;
    updateSettings((current) => {
      const visibleModules = checked
        ? [...new Set([...current.visibleModules, id])]
        : current.visibleModules.filter((value) => value !== id && value !== "settings");
      return { visibleModules, peekWidgetIds: visibleModules.slice(0, 2) };
    });
  }
  function move(id: string, direction: -1 | 1) {
    updateSettings((current) => {
      const index = current.visibleModules.indexOf(id);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= current.visibleModules.length) return {};
      const result = [...current.visibleModules];
      [result[index]!, result[next]!] = [result[next]!, result[index]!];
      return { visibleModules: result, peekWidgetIds: result.slice(0, 2) };
    });
  }
  return <section className="settings-section peek-settings" aria-label="Peek widgets">
    <div className="sync-header">
      <Heading level={2}>Shelf modules</Heading>
      <div className="peek-header-actions"><strong className="settings-count">{settings.visibleModules.length} enabled</strong><Button type="button" variant="ghost" size="sm" onClick={() => updateSettings({ visibleModules: defaultEdgeSettings.visibleModules, peekWidgetIds: defaultEdgeSettings.visibleModules.slice(0, 2) })}>Reset</Button></div>
    </div>
    <div className="peek-settings-list">{orderedModules.map((module) => {
      const selectedIndex = settings.visibleModules.indexOf(module.id);
      const selected = selectedIndex >= 0;
      return <div className="peek-setting-row" data-selected={selected} key={module.id} aria-label={selected ? `${module.label} position ${selectedIndex + 1}` : `${module.label} disabled`}>
        <Checkbox
          className="peek-choice"
          checked={selected}
          disabled={module.id === "settings"}
          onChange={(event) => toggle(module.id, event.target.checked)}
          label={module.label}
          aria-label={`${selected ? "Disable" : "Enable"} ${module.label} shelf module`}
        />
        {selected ? <div className="peek-order-actions">
          <IconButton label={`Move ${module.label} up`} title="Move up" disabled={selectedIndex === 0} onClick={() => move(module.id, -1)}><ChevronUp size={16} aria-hidden="true" /></IconButton>
          <IconButton label={`Move ${module.label} down`} title="Move down" disabled={selectedIndex === settings.visibleModules.length - 1} onClick={() => move(module.id, 1)}><ChevronDown size={16} aria-hidden="true" /></IconButton>
        </div> : null}
      </div>;
    })}</div>
  </section>;
}

export function DataOwnershipSection({ settings, updateSettings, captureInbox, productivity, platform }: Pick<SettingsWidgetProps, "settings" | "updateSettings" | "captureInbox" | "productivity" | "platform">) {
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState<"export" | "retention" | "clear" | "import" | null>(null);
  const preview = importText.trim() ? previewBackup(importText) : null;
  const protectedItemIds = productivity.saved.map((saved) => saved.sourceItemId).filter((id): id is string => Boolean(id));

  async function runAction(action: NonNullable<typeof busyAction>, task: () => void | Promise<void>) {
    setBusyAction(action);
    setMessage("");
    await nextFrame();
    try {
      await task();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function exportBackup() {
    const serialized = serializeBackup(createBackup({ captures: captureInbox.records, productivity: productivity.allRecords, deletedProductivityRecords: productivity.deletedRecords, settings }));
    const path = await platform.files.saveText?.(backupFilename(), serialized);
    setMessage(path ? `Backup saved to ${path}.` : "Backup saved.");
  }

  function applyRetention() {
    captureInbox.cleanupClipboardRetention(settings.clipboardRetentionDays, protectedItemIds);
    setMessage("Retention applied.");
  }

  function clearClipboard() {
    captureInbox.clearClipboardHistory(protectedItemIds);
    setMessage("Clipboard cleared.");
  }

  function importBackup() {
    const backup = parseBackup(importText);
    captureInbox.replaceRecords(recordsFromBackup(backup));
    productivity.replaceState(backup.data.moduleRecords);
    updateSettings(backup.data.settings);
    setMessage("Backup imported.");
  }
  return <>
    <section className="settings-section data-ownership" aria-label="Data ownership">
      <Heading level={2}>Data &amp; backup</Heading>
      <div className="data-actions">
        <Button type="button" variant="secondary" disabled={busyAction !== null} onClick={() => void runAction("export", exportBackup)}>{busyAction === "export" ? "Saving..." : "Download backup"}</Button>
        <Button type="button" variant="secondary" disabled={busyAction !== null} onClick={() => void runAction("retention", applyRetention)}>{busyAction === "retention" ? "Applying..." : "Apply retention"}</Button>
        <Button type="button" variant="danger" disabled={busyAction !== null} onClick={() => void runAction("clear", clearClipboard)}>{busyAction === "clear" ? "Clearing..." : "Clear clipboard"}</Button>
      </div>
      <div className="backup-import">
        <textarea aria-label="Backup import" value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="Paste backup JSON here" />
        <div className="backup-import-footer">
          {preview ? <p className={preview.valid ? "backup-status" : "backup-status error"}>{preview.valid ? `${preview.itemCount} captures, ${preview.moduleRecordCount} records, ${preview.attachmentCount} attachments` : preview.warnings[0]}</p> : null}
          <Button type="button" variant={preview?.valid ? "primary" : "secondary"} disabled={!preview?.valid || busyAction !== null} onClick={() => void runAction("import", importBackup)}>{busyAction === "import" ? "Importing..." : "Import backup"}</Button>
        </div>
      </div>
      {message ? <p className="backup-status" role="status">{message}</p> : null}
    </section>
    <section className="settings-section trash-section" aria-label="Trash">
      <Heading level={2}>Trash</Heading>
      <TrashSection deletedRecords={productivity.deletedRecords} workspace={productivity} />
    </section>
  </>;
}

function TrashSection({ deletedRecords, workspace }: { deletedRecords: DeletedProductivityRecord[]; workspace: ProductivityWorkspace }) {
  if (deletedRecords.length === 0) return <p className="empty-state">Trash is empty.</p>;
  return <div className="record-list trash-list" aria-label="Trash">{deletedRecords.map(({ kind, record }) => <article key={`${kind}:${record.id}`} className="trash-item">
    <div className="trash-item-content">
      <span className="trash-title">{record.title}</span>
      <span className="trash-kind">{formatTrashKind(kind)}</span>
    </div>
    <div className="trash-actions">
      <IconButton label={`Restore ${record.title}`} title="Restore" onClick={() => workspace.restoreDeleted(kind, record.id)}><RotateCcw size={15} aria-hidden="true" /></IconButton>
      <IconButton label={`Purge ${record.title}`} title="Purge" className="trash-purge-button" onClick={() => workspace.purgeDeleted(kind, record.id)}><Trash2 size={15} aria-hidden="true" /></IconButton>
    </div>
  </article>)}</div>;
}

function formatTrashKind(kind: DeletedProductivityRecord["kind"]): string {
  if (kind === "todos") return "task";
  if (kind === "reminders") return "reminder";
  return kind.slice(0, -1);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function backupFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `edgemagic-backup-${stamp}.json`;
}
