export type EdgeWindowPosition = "left" | "right";

export type EdgeWindowMode = "collapsed" | "shelf" | "focus";

export type AppearanceMode = "dark" | "light";

export interface ApplyEdgeWindowRequest {
  mode: EdgeWindowMode;
  position: EdgeWindowPosition;
  monitorId: string;
  appearance: AppearanceMode;
  pinned: boolean;
}

export interface AppliedEdgeWindowState {
  mode: EdgeWindowMode;
  position: EdgeWindowPosition;
  actualMonitorId: string;
  appearance: AppearanceMode;
}

export type EdgeWindowIntent =
  | { type: "show-shelf" }
  | { type: "collapse" }
  | { type: "toggle-pin" }
  | { type: "focus-widget"; widgetId: string };

export interface WindowPlatform {
  apply(request: ApplyEdgeWindowRequest): Promise<AppliedEdgeWindowState>;
  onIntent(handler: (intent: EdgeWindowIntent) => void): () => void;
}
