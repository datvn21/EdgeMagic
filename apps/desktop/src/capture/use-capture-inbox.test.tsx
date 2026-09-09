import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCaptureInbox } from "./use-capture-inbox.js";

describe("managed dropped-file retention", () => {
  beforeEach(() => window.localStorage.clear());

  it("deletes the managed file when its capture expires", async () => {
    const deleteManagedFile = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useCaptureInbox({ deleteManagedFile }));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.captureFile(
        new File(["report"], "report.txt", { type: "text/plain" }),
        "C:\\EdgeMagic\\dropped-files\\1\\report.txt",
        true
      );
    });
    const createdAt = result.current.records[0]!.item.createdAt;

    act(() => result.current.cleanupClipboardRetention(1, [], createdAt + 2 * 24 * 60 * 60 * 1000));

    expect(result.current.records).toHaveLength(0);
    expect(deleteManagedFile).toHaveBeenCalledWith("C:\\EdgeMagic\\dropped-files\\1\\report.txt");
  });

  it("keeps a managed file whose source item is protected", async () => {
    const deleteManagedFile = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useCaptureInbox({ deleteManagedFile }));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.captureFile(
        new File(["report"], "report.txt", { type: "text/plain" }),
        "C:\\EdgeMagic\\dropped-files\\2\\report.txt",
        true
      );
    });
    const record = result.current.records[0]!;

    act(() => result.current.cleanupClipboardRetention(1, [record.item.id], record.item.createdAt + 2 * 24 * 60 * 60 * 1000));

    expect(result.current.records).toHaveLength(1);
    expect(deleteManagedFile).not.toHaveBeenCalled();
  });
});
