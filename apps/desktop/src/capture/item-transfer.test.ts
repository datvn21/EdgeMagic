import { describe, expect, it } from "vitest";
import { parseItemTransfer, serializeItemTransfer, ITEM_TRANSFER_MIME } from "./item-transfer.js";

describe("item transfer payload", () => {
  const record = { item: { id: "item-1", type: "text" as const, content: "hello", source: "clipboard" as const, metadata: {}, createdAt: 1, updatedAt: 1 } };

  it("round trips a versioned clipboard payload", () => {
    const parsed = parseItemTransfer(serializeItemTransfer(record));
    expect(parsed).toEqual({ version: 1, source: "clipboard", itemId: "item-1", itemType: "text" });
    expect(ITEM_TRANSFER_MIME).toContain("edgemagic");
  });

  it("rejects malformed or incompatible payloads", () => {
    expect(parseItemTransfer("{}" )).toBeNull();
    expect(parseItemTransfer(JSON.stringify({ version: 2, source: "clipboard", itemId: "x", itemType: "text" }))).toBeNull();
    expect(parseItemTransfer("not-json")).toBeNull();
  });
});
