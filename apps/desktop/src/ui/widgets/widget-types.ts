import type { useProductivityWorkspace } from "../../productivity/use-productivity-workspace.js";
import type { useSyncWorkspace } from "../../sync/use-sync-workspace.js";

/** Shared workspace + sync types for widget components */
export type ProductivityWorkspace = ReturnType<typeof useProductivityWorkspace>;

export type SyncWorkspace = ReturnType<typeof useSyncWorkspace>;

export type SyncChangeHandler = (
  entityType: "item" | "attachment" | "tag" | "setting" | "module-record",
  entityId: string,
  operation: "create" | "update" | "delete",
  payload: unknown
) => Promise<void>;

