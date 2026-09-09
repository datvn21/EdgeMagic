import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InboxList } from "./inbox-list.js";

const textRecord = {
  item: {
    id: "text-capture",
    type: "text" as const,
    title: "Text capture",
    content: "Text capture",
    source: "clipboard" as const,
    metadata: {},
    createdAt: 1,
    updatedAt: 1
  }
};

describe("InboxList file actions", () => {
  it("routes a managed-copy open through the managed file path", () => {
    const onOpenFile = vi.fn();
    render(
      <InboxList
        records={[{
          item: {
            id: "managed-file",
            type: "file",
            title: "report.pdf",
            path: "C:\\Cache\\report.pdf",
            source: "drag-drop",
            metadata: { "file.managedCopy": true },
            createdAt: 1,
            updatedAt: 1
          }
        }]}
        onOpenFile={onOpenFile}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open report.pdf" }));

    expect(onOpenFile).toHaveBeenCalledWith("C:\\Cache\\report.pdf", true);
  });

  it("opens data-url images through the image open action", () => {
    const onOpenImageData = vi.fn();
    const dataUrl = "data:image/png;base64,AAAA";
    render(
      <InboxList
        records={[{
          item: {
            id: "image-data",
            type: "image",
            title: "Screenshot",
            path: dataUrl,
            source: "clipboard",
            metadata: {},
            createdAt: 1,
            updatedAt: 1
          }
        }]}
        onOpenImageData={onOpenImageData}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Screenshot" }));

    expect(onOpenImageData).toHaveBeenCalledWith(dataUrl, "Screenshot");
  });

  it("clears stuck item drag styling after drag ends", () => {
    render(<InboxList records={[textRecord]} />);

    const shelf = screen.getByRole("region", { name: "Captured items" });
    const item = screen.getByTitle("Drag to another app");
    const textButton = screen.getByRole("button", { name: "Expand clipboard item" });
    const dataTransfer = {
      effectAllowed: "copy",
      clearData: vi.fn(),
      setData: vi.fn(),
      setDragImage: vi.fn()
    };

    textButton.focus();
    expect(textButton).toHaveFocus();

    fireEvent.dragStart(item, { dataTransfer });
    expect(item).toHaveClass("is-dragging");

    fireEvent.dragEnd(item);
    expect(item).not.toHaveClass("is-dragging");
    expect(shelf).toHaveClass("suppress-item-hover");
    expect(textButton).not.toHaveFocus();

    fireEvent.pointerMove(shelf);
    expect(shelf).not.toHaveClass("suppress-item-hover");
  });
});
