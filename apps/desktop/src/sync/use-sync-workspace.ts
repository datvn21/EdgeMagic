import type { SyncQueueItem, SyncStatus } from "@edgemagic/module-api";
import { useEffect, useMemo, useState } from "react";
import { SyncQueueRepository } from "./sync-queue-repository.js";

const disabledStatus: SyncStatus = {
  enabled: false,
  pendingCount: 0,
  running: false
};

export function useSyncWorkspace() {
  const [status, setStatus] = useState<SyncStatus>(disabledStatus);
  const [queue, setQueue] = useState<SyncQueueItem[]>([]);
  const repository = useMemo(() => new SyncQueueRepository(), []);

  useEffect(() => {
    let mounted = true;
    void repository.load().then((loaded) => {
      if (mounted) {
        setQueue(loaded);
        setStatus((current) => ({ ...current, pendingCount: countPending(loaded) }));
      }
    });
    return () => { mounted = false; };
  }, [repository]);

  return {
    status,
    queue,
    async enqueue(change: Omit<SyncQueueItem, "id" | "status" | "attempts" | "createdAt" | "updatedAt">) {
      const now = Date.now();
      const item: SyncQueueItem = { id: crypto.randomUUID(), ...change, status: "pending", attempts: 0, createdAt: now, updatedAt: now };
      setQueue((current) => {
        const next = [...current.filter((entry) => !(entry.entityType === item.entityType && entry.entityId === item.entityId)), item];
        void repository.replaceBrowser(next);
        void repository.upsert(item);
        setStatus((currentStatus) => ({ ...currentStatus, pendingCount: countPending(next) }));
        return next;
      });
    },
    async clearSucceeded() {
      setQueue((current) => {
        const next = current.filter((item) => item.status !== "succeeded");
        void repository.replaceBrowser(next);
        setStatus((currentStatus) => ({ ...currentStatus, pendingCount: countPending(next) }));
        return next;
      });
    }
  };
}

function countPending(items: SyncQueueItem[]): number {
  return items.filter((item) => item.status === "pending" || item.status === "failed").length;
}
