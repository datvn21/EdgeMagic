import type { ItemType } from "@edgemagic/types";
import type { CapturedRecord } from "./use-capture-inbox.js";

export const ITEM_TRANSFER_MIME = "application/x-edgemagic-item";
export const ITEM_TRANSFER_VERSION = 1;

export interface ItemTransferPayload {
  version: typeof ITEM_TRANSFER_VERSION;
  source: "clipboard";
  itemId: string;
  itemType: ItemType;
}

export type TransferDestination = "notes" | "todo" | "reminder" | "saved";

export const transferDestinations: readonly { id: TransferDestination; label: string }[] = [
  { id: "notes", label: "Note" },
  { id: "todo", label: "Todo" },
  { id: "reminder", label: "Reminder" },
  { id: "saved", label: "Saved" }
];

export function serializeItemTransfer(record: CapturedRecord): string {
  return JSON.stringify({ version: ITEM_TRANSFER_VERSION, source: "clipboard", itemId: record.item.id, itemType: record.item.type } satisfies ItemTransferPayload);
}

export function parseItemTransfer(data: string): ItemTransferPayload | null {
  try {
    const value = JSON.parse(data) as Partial<ItemTransferPayload>;
    if (value.version !== ITEM_TRANSFER_VERSION || value.source !== "clipboard" || typeof value.itemId !== "string" || !value.itemId || typeof value.itemType !== "string") return null;
    return value as ItemTransferPayload;
  } catch { return null; }
}

export function destinationLabel(destination: TransferDestination): string {
  return transferDestinations.find((item) => item.id === destination)?.label ?? destination;
}

export function toProductivityTarget(destination: TransferDestination): "note" | "todo" | "reminder" | "saved" {
  return destination === "notes" ? "note" : destination;
}
