import { describe, expect, it } from "vitest";
import { readDropInputs, readNativeFileInputs, resolveCaptureDestination } from "./capture-drop.js";

describe("capture drop routing", () => {
  it("resolves only productivity widgets as direct destinations", () => {
    expect(resolveCaptureDestination("notes")).toBe("notes");
    expect(resolveCaptureDestination("todo")).toBe("todo");
    expect(resolveCaptureDestination("reminder")).toBe("reminder");
    expect(resolveCaptureDestination("saved")).toBe("saved");
    expect(resolveCaptureDestination("settings")).toBe("clipboard");
  });

  it("reads files and text payloads without dropping the file metadata", () => {
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    const transfer = {
      files: [file],
      getData: (type: string) => (type === "text/plain" ? "fallback text" : "")
    } as unknown as DataTransfer;

    expect(readDropInputs(transfer)).toMatchObject([
      { kind: "file", name: "hello.txt", size: 5, mimeType: "text/plain", file },
      { kind: "text", value: "fallback text" }
    ]);
  });

  it("uses the first non-empty URL from uri-list", () => {
    const transfer = {
      files: [],
      getData: (type: string) => (type === "text/uri-list" ? "\nhttps://example.com\nhttps://ignored.test" : "")
    } as unknown as DataTransfer;

    expect(readDropInputs(transfer)).toEqual([{ kind: "url", value: "https://example.com" }]);
  });

  it("detects image URLs by extension and returns image-url kind", () => {
    const transfer = {
      files: [],
      getData: (type: string) => {
        if (type === "text/uri-list") return "https://i.pinimg.com/736x/ab/cd/photo.jpg";
        return "";
      }
    } as unknown as DataTransfer;

    expect(readDropInputs(transfer)).toEqual([{ kind: "image-url", url: "https://i.pinimg.com/736x/ab/cd/photo.jpg", name: "photo.jpg" }]);
  });

  it("extracts img src from text/html even when uri-list is a page URL", () => {
    const transfer = {
      files: [],
      getData: (type: string) => {
        if (type === "text/uri-list") return "https://www.pinterest.com/pin/123/";
        if (type === "text/html") return '<img src="https://i.pinimg.com/736x/ab/cd/photo.jpg" />';
        return "";
      }
    } as unknown as DataTransfer;

    expect(readDropInputs(transfer)).toEqual([{ kind: "image-url", url: "https://i.pinimg.com/736x/ab/cd/photo.jpg", name: "photo.jpg" }]);
  });

  it("falls back to url kind when URI is not an image", () => {
    const transfer = {
      files: [],
      getData: (type: string) => (type === "text/uri-list" ? "https://example.com/article" : "")
    } as unknown as DataTransfer;

    expect(readDropInputs(transfer)).toEqual([{ kind: "url", value: "https://example.com/article" }]);
  });

  it("converts native paths into file inputs", () => {
    expect(readNativeFileInputs(["C:\\Temp\\report.pdf"])).toEqual([
      {
        kind: "file",
        name: "report.pdf",
        size: 0,
        mimeType: "application/octet-stream",
        path: "C:\\Temp\\report.pdf"
      }
    ]);
  });
});
