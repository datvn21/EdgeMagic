import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ITEM_TRANSFER_MIME } from "../capture/item-transfer.js";
import { App } from "./app.js";

describe("EdgeMagic hover widget launcher", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("shows the full widget canvas on hover with Clipboard active", async () => {
    render(<App />);
    await act(async () => {});
    await act(async () => { fireEvent.mouseEnter(screen.getByRole("button", { name: "Open EdgeMagic" })); });

    expect(screen.getByTestId("expanded-widget-stack").querySelectorAll(".widget-card")).toHaveLength(2);
    expect(screen.getByTestId("expanded-widget-stack").querySelectorAll(".widget-card-body")).toHaveLength(2);
    expect(screen.getByTestId("expanded-widget-stack").querySelectorAll(".peek-widget")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "Clipboard" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Notes" })).toBeInTheDocument();
    expect(screen.queryByText("Inbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent local clipboard captures will appear here.")).not.toBeInTheDocument();
    expect(screen.queryByText("Widget")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open EdgeMagic" })).not.toBeInTheDocument();
  });

  it("only activates from the edge handle and removes that hit target while widgets are open", async () => {
    render(<App />);
    await act(async () => {});

    fireEvent.mouseEnter(screen.getByRole("main"));
    expect(screen.getByRole("button", { name: "Open EdgeMagic" })).toBeInTheDocument();

    await act(async () => { fireEvent.mouseEnter(screen.getByRole("button", { name: "Open EdgeMagic" })); });
    expect(screen.queryByRole("button", { name: "Open EdgeMagic" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "EdgeMagic" })).toBeInTheDocument();
  });

  it("uses an English drag-and-drop prompt", async () => {
    window.localStorage.setItem("edgemagic.edge-settings", JSON.stringify({
      visibleModules: ["clipboard", "notes", "todo", "reminder", "library", "settings"],
      peekWidgetIds: ["clipboard"]
    }));
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Open EdgeMagic" })).toBeInTheDocument());

    fireEvent.dragEnter(screen.getByRole("main"));

    expect(await screen.findByText("Drop into Clipboard")).toBeInTheDocument();
    expect(screen.queryByText(/Th\u1ea3 \u0111\u1ec3 chuy\u1ec3n v\u00e0o/)).not.toBeInTheDocument();
  });

  it("auto-hides the shelf after a drop finishes outside pointer hover", async () => {
    window.localStorage.setItem("edgemagic.edge-settings", JSON.stringify({
      autoHideDelayMs: 0,
      visibleModules: ["clipboard", "notes", "todo", "reminder", "library", "settings"],
      peekWidgetIds: ["clipboard"]
    }));
    window.localStorage.setItem("edgemagic.capture-inbox", JSON.stringify([{
      item: {
        id: "existing-capture",
        type: "text",
        content: "Existing capture",
        source: "clipboard",
        metadata: {},
        createdAt: 1,
        updatedAt: 1
      }
    }]));
    render(<App />);
    await act(async () => {});

    const main = screen.getByRole("main");
    fireEvent.dragEnter(main);
    expect(await screen.findByText("Drop into Clipboard")).toBeInTheDocument();

    vi.useFakeTimers();
    act(() => {
      fireEvent.drop(main, {
        dataTransfer: {
          files: [],
          getData: (type: string) => type === ITEM_TRANSFER_MIME
            ? JSON.stringify({ version: 1, source: "clipboard", itemId: "existing-capture", itemType: "text" })
            : ""
        }
      });
    });
    await act(async () => {});

    act(() => { vi.advanceTimersByTime(0); });
    await act(async () => {});
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => {});
    expect(screen.queryByRole("region", { name: "EdgeMagic" })).not.toBeInTheDocument();
  });

  it("auto-hides the shelf after dragging a clipboard item out", async () => {
    window.localStorage.setItem("edgemagic.edge-settings", JSON.stringify({ autoHideDelayMs: 0 }));
    render(<App />);
    await act(async () => {});
    fireEvent.paste(screen.getByRole("main"), {
      clipboardData: {
        getData: (type: string) => type === "text/plain" ? "Existing capture" : "",
        files: []
      }
    });
    await waitFor(() => expect(window.localStorage.getItem("edgemagic.capture-inbox")).toContain("Existing capture"));

    const item = await screen.findByTitle("Drag to another app");
    const dataTransfer = {
      effectAllowed: "copy",
      clearData: vi.fn(),
      setData: vi.fn(),
      setDragImage: vi.fn()
    };
    fireEvent.pointerEnter(screen.getByRole("region", { name: "EdgeMagic" }));

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.dragStart(item, { dataTransfer });
      fireEvent.dragEnd(window);
    });
    act(() => { vi.advanceTimersByTime(0); });
    await act(async () => {});
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => {});

    expect(screen.queryByRole("region", { name: "EdgeMagic" })).not.toBeInTheDocument();
  });

  it("auto-hides after an inbox item drag even when native dragend is missing", async () => {
    window.localStorage.setItem("edgemagic.edge-settings", JSON.stringify({ autoHideDelayMs: 0 }));
    render(<App />);
    await act(async () => {});
    await act(async () => { fireEvent.mouseEnter(screen.getByRole("button", { name: "Open EdgeMagic" })); });
    fireEvent.pointerEnter(screen.getByRole("region", { name: "EdgeMagic" }));

    vi.useFakeTimers();
    act(() => {
      window.dispatchEvent(new CustomEvent("edgemagic:inbox-item-drag-start"));
    });
    act(() => { vi.runOnlyPendingTimers(); });
    await act(async () => {});
    act(() => { vi.runOnlyPendingTimers(); });
    await act(async () => {});
    act(() => { vi.runOnlyPendingTimers(); });
    await act(async () => {});

    expect(screen.queryByRole("region", { name: "EdgeMagic" })).not.toBeInTheDocument();
  });

  it("keeps the shelf mounted for exit animation and cancels closing when hover returns", async () => {
    render(<App />);
    await act(async () => {});
    await act(async () => { fireEvent.mouseEnter(screen.getByRole("button", { name: "Open EdgeMagic" })); });
    const shelf = screen.getByRole("region", { name: "EdgeMagic" });
    fireEvent.pointerEnter(shelf);

    vi.useFakeTimers();
    try {
      fireEvent.pointerLeave(shelf);
      act(() => { vi.advanceTimersByTime(450); });
      expect(shelf).toHaveClass("is-closing");
      expect(shelf).toBeInTheDocument();

      fireEvent.pointerEnter(shelf);
      expect(shelf).not.toHaveClass("is-closing");
      act(() => { vi.advanceTimersByTime(250); });
      expect(shelf).toBeInTheDocument();

      fireEvent.pointerLeave(shelf);
      act(() => { vi.advanceTimersByTime(450); });
      expect(shelf).toHaveClass("is-closing");
      act(() => { vi.advanceTimersByTime(200); });
      expect(screen.queryByRole("region", { name: "EdgeMagic" })).not.toBeInTheDocument();
      await act(async () => {});
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the first two enabled modules as full widgets and the rest as icons", async () => {
    window.localStorage.setItem("edgemagic.edge-settings", JSON.stringify({
      visibleModules: ["notes", "todo", "reminder", "settings"],
      peekWidgetIds: ["clipboard", "library"]
    }));
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Open EdgeMagic" })).toBeInTheDocument());
    await act(async () => { fireEvent.mouseEnter(screen.getByRole("button", { name: "Open EdgeMagic" })); });

    expect(screen.getByTestId("expanded-widget-stack").querySelectorAll(".widget-card")).toHaveLength(2);
    expect(screen.getByTestId("expanded-widget-stack").querySelectorAll(".widget-card-body")).toHaveLength(2);
    expect(screen.getByTestId("expanded-widget-stack").querySelectorAll(".peek-widget")).toHaveLength(0);
    expect(screen.getByTestId("expanded-widget-stack").querySelector("[data-widget='notes']")).toBeInTheDocument();
    expect(screen.getByTestId("expanded-widget-stack").querySelector("[data-widget='todo']")).toBeInTheDocument();
    expect(screen.getByTestId("compact-widget-row").querySelector("[data-widget='reminder']")).toBeInTheDocument();
    expect(screen.getByTestId("compact-widget-row").querySelector("[data-widget='settings']")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Clipboard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Library" })).not.toBeInTheDocument();
  });

  it("keeps Settings enabled when only one module is configured", async () => {
    window.localStorage.setItem("edgemagic.edge-settings", JSON.stringify({
      visibleModules: ["clipboard"],
      peekWidgetIds: ["notes", "todo"]
    }));
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Open EdgeMagic" })).toBeInTheDocument());
    await act(async () => { fireEvent.mouseEnter(screen.getByRole("button", { name: "Open EdgeMagic" })); });

    const grid = screen.getByTestId("expanded-widget-stack");
    expect(grid).toHaveAttribute("data-card-count", "2");
    expect(grid.querySelectorAll(".widget-card")).toHaveLength(2);
    expect(grid.querySelector("[data-widget='clipboard']")).toBeInTheDocument();
    expect(grid.querySelector("[data-widget='settings']")).toBeInTheDocument();
  });

  it("clears every item shown in the Clipboard widget", async () => {
    window.localStorage.setItem("edgemagic.edge-settings", JSON.stringify({
      visibleModules: ["clipboard", "notes", "todo", "reminder", "library", "settings"],
      peekWidgetIds: ["clipboard"]
    }));
    window.localStorage.setItem("edgemagic.capture-inbox", JSON.stringify([{
      item: {
        id: "dropped-capture",
        type: "text",
        content: "Dropped capture",
        source: "drag-drop",
        metadata: {},
        createdAt: 1,
        updatedAt: 1
      }
    }]));
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Open EdgeMagic" })).toBeInTheDocument());
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Open EdgeMagic" }));
    expect(await screen.findByText("Dropped capture")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Clear clipboard" }));

    await waitFor(() => expect(screen.queryByText("Dropped capture")).not.toBeInTheDocument());
    expect(screen.getByText("Drop anything here")).toBeInTheDocument();
  });

  it("automatically removes expired managed file captures after hydration", async () => {
    window.localStorage.setItem("edgemagic.edge-settings", JSON.stringify({ clipboardRetentionDays: 1 }));
    window.localStorage.setItem("edgemagic.capture-inbox", JSON.stringify([{
      item: {
        id: "expired-managed-file",
        type: "file",
        title: "expired.txt",
        path: "C:\\EdgeMagic\\dropped-files\\1\\expired.txt",
        source: "drag-drop",
        metadata: { "file.managedCopy": true },
        createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now() - 2 * 24 * 60 * 60 * 1000
      },
      attachment: {
        id: "expired-attachment",
        itemId: "expired-managed-file",
        kind: "file",
        filename: "expired.txt",
        localPath: "C:\\EdgeMagic\\dropped-files\\1\\expired.txt",
        createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now() - 2 * 24 * 60 * 60 * 1000
      }
    }]));

    render(<App />);

    await waitFor(() => expect(window.localStorage.getItem("edgemagic.capture-inbox")).not.toContain("expired-managed-file"));
  });

  it("captures pasted clipboard text without requiring clipboard files", async () => {
    render(<App />);
    await act(async () => {});
    fireEvent.paste(screen.getByRole("main"), {
      clipboardData: {
        getData: (type: string) => type === "text/plain" ? "Pasted text" : "",
        files: []
      }
    });
    await waitFor(() => expect(window.localStorage.getItem("edgemagic.capture-inbox")).toContain("Pasted text"));
  });

  it("captures system clipboard changes outside the EdgeMagic surface", async () => {
    render(<App />);
    await act(async () => {});

    fireEvent.paste(window, {
      clipboardData: {
        getData: (type: string) => type === "text/plain" ? "Copied in another app" : "",
        files: []
      }
    });

    await waitFor(() => expect(window.localStorage.getItem("edgemagic.capture-inbox")).toContain("Copied in another app"));
  });

  it("expands and collapses a clipboard text preview on click", async () => {
    window.localStorage.setItem("edgemagic.edge-settings", JSON.stringify({
      visibleModules: ["clipboard", "notes", "todo", "reminder", "library", "settings"],
      peekWidgetIds: ["clipboard", "notes"]
    }));
    render(<App />);
    await act(async () => {});
    fireEvent.paste(screen.getByRole("main"), {
      clipboardData: {
        getData: (type: string) => type === "text/plain" ? "One\nTwo\nThree\nFour\nFive\nSix" : "",
        files: []
      }
    });

    const expand = (await screen.findAllByRole("button", { name: "Expand clipboard item" }))
      .find((button) => button.textContent?.includes("Six"));
    expect(expand).toBeDefined();
    if (!expand) throw new Error("Expected the six-line clipboard item.");
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(expand).not.toHaveClass("is-expanded");

    fireEvent.click(expand);
    expect(expand).toHaveAccessibleName("Collapse clipboard item");
    expect(expand).toHaveAttribute("aria-expanded", "true");
    expect(expand).toHaveClass("is-expanded");
  });

  it("opens a compact widget in focus and returns to the two-widget shelf", async () => {
    render(<App />);
    await act(async () => {});
    await act(async () => { fireEvent.mouseEnter(screen.getByRole("button", { name: "Open EdgeMagic" })); });
    await act(async () => { screen.getByRole("button", { name: "Open Settings" }).click(); });
    expect(screen.getByRole("region", { name: "Settings workspace" })).toBeInTheDocument();
    expect(screen.getByTestId("focus-widget-canvas")).toHaveClass("module-panel", "widget-canvas");
    expect(screen.getByRole("region", { name: "Settings workspace" })).toHaveClass("widget-card-surface", "focus-view");
    await act(async () => { screen.getByRole("button", { name: "Back to shelf" }).click(); });
    expect(screen.getByTestId("expanded-widget-stack").querySelectorAll(".widget-card")).toHaveLength(2);
  });

  it("makes shelf module visibility and ordering explicit", async () => {
    window.localStorage.setItem("edgemagic.edge-settings", JSON.stringify({
      visibleModules: ["clipboard", "notes", "todo", "reminder", "library", "settings"],
      peekWidgetIds: ["clipboard", "notes"]
    }));
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Open EdgeMagic" })).toBeInTheDocument());
    await act(async () => { fireEvent.mouseEnter(screen.getByRole("button", { name: "Open EdgeMagic" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Open Settings" })); });

    expect(screen.getByRole("checkbox", { name: "Disable Clipboard shelf module" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Disable Todo shelf module" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Disable Settings shelf module" })).toBeDisabled();
    expect(screen.getByLabelText("Clipboard position 1")).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Move Clipboard down" })); });
    await waitFor(() => expect(screen.getByLabelText("Clipboard position 2")).toBeInTheDocument());
  });

  it("places the pin action in the bottom icon row", async () => {
    render(<App />);
    await act(async () => {});
    await act(async () => { fireEvent.mouseEnter(screen.getByRole("button", { name: "Open EdgeMagic" })); });
    const pin = screen.getByRole("button", { name: "Pin shelf" });
    await act(async () => { pin.click(); });
    expect(screen.getByRole("button", { name: "Unpin shelf" })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens the merged Library widget from the compact row", async () => {
    render(<App />);
    await act(async () => {});
    await act(async () => { fireEvent.mouseEnter(screen.getByRole("button", { name: "Open EdgeMagic" })); });
    await act(async () => { screen.getByRole("button", { name: "Open Library" }).click(); });
    expect(screen.getByRole("region", { name: "Library workspace" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Saved/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Bookmarks/ })).toHaveAttribute("aria-selected", "false");
  });
});
