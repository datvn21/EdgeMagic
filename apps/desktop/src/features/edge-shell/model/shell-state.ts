import type { EdgeWindowMode } from "@edgemagic/module-api";
import type { ModuleId } from "../../../ui/widget-registry.js";

export interface ShellState {
  mode: EdgeWindowMode;
  focusedWidgetId: ModuleId | null;
  pinned: boolean;
  dragActive: boolean;
}

export type ShellAction =
  | { type: "show-shelf" }
  | { type: "focus-widget"; widgetId: ModuleId }
  | { type: "back" }
  | { type: "collapse"; force?: boolean }
  | { type: "toggle-pin" }
  | { type: "set-drag-active"; active: boolean };

export const initialShellState: ShellState = {
  mode: "collapsed",
  focusedWidgetId: null,
  pinned: false,
  dragActive: false
};

export function shellReducer(state: ShellState, action: ShellAction): ShellState {
  switch (action.type) {
    case "show-shelf":
      if (state.mode === "shelf" && state.focusedWidgetId === null) return state;
      return { ...state, mode: "shelf", focusedWidgetId: null };
    case "focus-widget":
      return { ...state, mode: "focus", focusedWidgetId: action.widgetId };
    case "back":
      return state.mode === "focus" ? { ...state, mode: "shelf", focusedWidgetId: null } : state;
    case "collapse":
      return state.pinned && !action.force ? state : { ...state, mode: "collapsed", focusedWidgetId: null, dragActive: false };
    case "toggle-pin":
      return { ...state, pinned: !state.pinned };
    case "set-drag-active":
      if (state.dragActive === action.active) return state;
      return { ...state, dragActive: action.active };
  }
}
