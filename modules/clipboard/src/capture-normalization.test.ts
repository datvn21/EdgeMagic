import { describe, expect, it } from "vitest";
import { normalizeClipboardPayload, normalizeDroppedFile, normalizeDroppedText, normalizeDroppedUrl } from "./capture-normalization.js";

describe("capture normalization", () => {
  it("normalizes clipboard text into a text item", () => {
    const [capture] = normalizeClipboardPayload({ kind: "text", text: "npm run build" });

    expect(capture?.item).toMatchObject({
      type: "text",
      content: "npm run build",
      source: "clipboard"
    });
  });

  it("normalizes clipboard URLs into link items", () => {
    const [capture] = normalizeClipboardPayload({ kind: "text", text: "https://react.dev" });

    expect(capture?.item).toMatchObject({
      type: "link",
      url: "https://react.dev/",
      source: "clipboard"
    });
  });

  it("normalizes dropped URLs and files", () => {
    expect(normalizeDroppedUrl("https://example.com").item.type).toBe("link");

    const file = normalizeDroppedFile({ name: "assignment.pdf", size: 42, type: "application/pdf" });
    expect(file.item).toMatchObject({ type: "file", title: "assignment.pdf", source: "drag-drop" });
    expect(file.attachment).toMatchObject({ filename: "assignment.pdf", byteSize: 42 });
  });

  it("normalizes dropped plain text", () => {
    expect(normalizeDroppedText("remember this").item).toMatchObject({
      type: "text",
      content: "remember this",
      source: "drag-drop"
    });
  });
});

