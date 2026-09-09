import { describe, expect, it } from "vitest";
import { initialShellState, shellReducer } from "./shell-state.js";

describe("shellReducer", () => {
  it("moves through collapsed, shelf and focus without a detached window", () => {
    const shelf = shellReducer(initialShellState, { type: "show-shelf" });
    const focus = shellReducer(shelf, { type: "focus-widget", widgetId: "notes" });
    expect(focus).toMatchObject({ mode: "focus", focusedWidgetId: "notes" });
    expect(shellReducer(focus, { type: "back" })).toMatchObject({ mode: "shelf", focusedWidgetId: null });
  });

  it("blocks automatic collapse while pinned but permits an explicit tray collapse", () => {
    const pinned = shellReducer(shellReducer(initialShellState, { type: "show-shelf" }), { type: "toggle-pin" });
    expect(shellReducer(pinned, { type: "collapse" }).mode).toBe("shelf");
    expect(shellReducer(pinned, { type: "collapse", force: true }).mode).toBe("collapsed");
  });
});
