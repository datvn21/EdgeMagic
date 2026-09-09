import type { Attachment, EdgeItem } from "@edgemagic/types";
import type { CapturedRecord } from "../capture/use-capture-inbox.js";
import type {
  DeletedProductivityRecord,
  ProductivityState
} from "../productivity/use-productivity-workspace.js";
import type { EdgeSettings } from "../settings/use-edge-settings.js";

export const backupFormatVersion = 1;
export const appVersion = "0.1.0";
export const schemaVersion = 1;

export interface AttachmentManifestEntry {
  id: string;
  itemId: string;
  kind: Attachment["kind"];
  filename: string;
  byteSize?: number;
  contentHash?: string;
  localPath: string;
}

export interface BackupManifest {
  app: "EdgeMagic";
  appVersion: string;
  schemaVersion: number;
  exportVersion: number;
  exportedAt: number;
  includesClipboardHistory: boolean;
  includesAttachments: boolean;
  encrypted: false;
  warnings: string[];
}

export interface EdgeMagicBackup {
  manifest: BackupManifest;
  checksum?: string;
  data: {
    items: EdgeItem[];
    tags: unknown[];
    moduleRecords: ProductivityState;
    deletedModuleRecords: DeletedProductivityRecord[];
    settings: Partial<EdgeSettings>;
    attachments: AttachmentManifestEntry[];
  };
}

export interface ImportPreview {
  valid: boolean;
  itemCount: number;
  moduleRecordCount: number;
  attachmentCount: number;
  warnings: string[];
}

export function createBackup(input: {
  captures: CapturedRecord[];
  productivity: ProductivityState;
  deletedProductivityRecords: DeletedProductivityRecord[];
  settings: EdgeSettings;
  now?: number;
}): EdgeMagicBackup {
  const attachments = input.captures.flatMap((record) =>
    record.attachment ? [toAttachmentManifest(record.attachment)] : []
  );

  const backup: EdgeMagicBackup = {
    manifest: {
      app: "EdgeMagic",
      appVersion,
      schemaVersion,
      exportVersion: backupFormatVersion,
      exportedAt: input.now ?? Date.now(),
      includesClipboardHistory: input.captures.some((record) => record.item.source === "clipboard"),
      includesAttachments: attachments.length > 0,
      encrypted: false,
      warnings: [
        "Backup is not encrypted.",
        "Clipboard history may be included.",
        "Attachment entries are manifest records only in the current desktop preview.",
        "Provider tokens and OAuth secrets are never exported."
      ]
    },
    data: {
      items: input.captures.map((record) => record.item),
      tags: [],
      moduleRecords: input.productivity,
      deletedModuleRecords: input.deletedProductivityRecords,
      settings: stripSensitiveSettings(input.settings),
      attachments
    }
  };
  backup.checksum = checksumFor(backup);
  return backup;
}

export function serializeBackup(backup: EdgeMagicBackup): string {
  return JSON.stringify({ ...backup, checksum: checksumFor(backup) }, null, 2);
}

export function parseBackup(raw: string): EdgeMagicBackup {
  const parsed = JSON.parse(raw) as Partial<EdgeMagicBackup>;
  if (parsed.manifest?.app !== "EdgeMagic" || parsed.manifest.exportVersion !== backupFormatVersion) {
    throw new Error("Unsupported EdgeMagic backup format.");
  }

  if (typeof parsed.checksum === "string" && parsed.checksum !== checksumFor(parsed)) {
    throw new Error("Backup checksum is invalid or the file is corrupted.");
  }

  const items = Array.isArray(parsed.data?.items) ? parsed.data.items : [];
  const attachments = Array.isArray(parsed.data?.attachments) ? parsed.data.attachments : [];
  const itemIds = new Set(items.map((item) => item?.id).filter((id): id is string => typeof id === "string"));
  if (attachments.some((attachment) => !itemIds.has(attachment?.itemId))) {
    throw new Error("Backup contains an attachment without a matching item.");
  }

  return {
    manifest: parsed.manifest,
    ...(typeof parsed.checksum === "string" ? { checksum: parsed.checksum } : {}),
    data: {
      items,
      tags: Array.isArray(parsed.data?.tags) ? parsed.data.tags : [],
      moduleRecords: normalizeProductivityState(parsed.data?.moduleRecords),
      deletedModuleRecords: Array.isArray(parsed.data?.deletedModuleRecords) ? parsed.data.deletedModuleRecords : [],
      settings: stripSensitiveSettings((parsed.data?.settings ?? {}) as Partial<EdgeSettings>),
      attachments
    }
  };
}

function checksumFor(value: Partial<EdgeMagicBackup>): string {
  const serialized = JSON.stringify({ manifest: value.manifest, data: value.data });
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export function previewBackup(raw: string): ImportPreview {
  try {
    const backup = parseBackup(raw);
    const moduleRecordCount =
      backup.data.moduleRecords.notes.length +
      backup.data.moduleRecords.todos.length +
      backup.data.moduleRecords.reminders.length +
      backup.data.moduleRecords.saved.length;

    return {
      valid: true,
      itemCount: backup.data.items.length,
      moduleRecordCount,
      attachmentCount: backup.data.attachments.length,
      warnings: backup.manifest.warnings
    };
  } catch (error) {
    return {
      valid: false,
      itemCount: 0,
      moduleRecordCount: 0,
      attachmentCount: 0,
      warnings: [error instanceof Error ? error.message : "Invalid backup."]
    };
  }
}

export function recordsFromBackup(backup: EdgeMagicBackup): CapturedRecord[] {
  return backup.data.items.map((item) => {
    const attachment = backup.data.attachments.find((entry) => entry.itemId === item.id);
    return attachment
      ? {
          item,
          attachment: {
            id: attachment.id,
            itemId: attachment.itemId,
            kind: attachment.kind,
            filename: attachment.filename,
            ...(attachment.byteSize !== undefined ? { byteSize: attachment.byteSize } : {}),
            ...(attachment.contentHash !== undefined ? { contentHash: attachment.contentHash } : {}),
            localPath: attachment.localPath,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
          }
        }
      : { item };
  });
}

export function filterClipboardRetention(
  records: CapturedRecord[],
  retentionDays: number,
  durableSourceItemIds: string[],
  now = Date.now()
): CapturedRecord[] {
  const durableIds = new Set(durableSourceItemIds);
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;

  return records.filter((record) => {
    if (record.item.source !== "clipboard") {
      return true;
    }
    if (durableIds.has(record.item.id)) {
      return true;
    }
    if (retentionDays >= 3650) {
      return true;
    }

    return now - record.item.createdAt <= retentionMs;
  });
}

function stripSensitiveSettings(settings: Partial<EdgeSettings>): Partial<EdgeSettings> {
  return Object.fromEntries(
    Object.entries(settings).filter(([key]) => !/token|secret|oauth|credential|password/i.test(key))
  ) as Partial<EdgeSettings>;
}

function normalizeProductivityState(value: unknown): ProductivityState {
  const state = value as Partial<ProductivityState> | undefined;
  return {
    notes: Array.isArray(state?.notes) ? state.notes : [],
    todos: Array.isArray(state?.todos) ? state.todos : [],
    reminders: Array.isArray(state?.reminders) ? state.reminders : [],
    saved: Array.isArray(state?.saved) ? state.saved : []
  };
}

function toAttachmentManifest(attachment: Attachment): AttachmentManifestEntry {
  return {
    id: attachment.id,
    itemId: attachment.itemId,
    kind: attachment.kind,
    filename: attachment.filename,
    ...(attachment.byteSize !== undefined ? { byteSize: attachment.byteSize } : {}),
    ...(attachment.contentHash !== undefined ? { contentHash: attachment.contentHash } : {}),
    localPath: attachment.localPath
  };
}
