import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSyncWorkspace } from "./use-sync-workspace.js";

describe("useSyncWorkspace", () => {
  beforeEach(() => window.localStorage.clear());

  it("derives pending count from unique queued entities", async () => {
    const { result } = renderHook(() => useSyncWorkspace());
    await waitFor(() => expect(result.current.queue).toEqual([]));

    await act(async () => {
      await result.current.enqueue({
        entityType: "item",
        entityId: "item-1",
        operation: "create",
        payload: { title: "first" }
      });
      await result.current.enqueue({
        entityType: "item",
        entityId: "item-1",
        operation: "update",
        payload: { title: "second" }
      });
    });

    expect(result.current.queue).toHaveLength(1);
    expect(result.current.status.pendingCount).toBe(1);
  });
});
