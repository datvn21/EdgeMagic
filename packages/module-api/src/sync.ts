export interface SyncResult { succeeded: number; failed: number; }
export interface SyncBatch { items: SyncQueueItem[]; }
export interface ProviderPushResult { accepted: string[]; rejected: Array<{ id: string; error: string }>; }
export interface ProviderPullResult { cursor?: string; changes: unknown[]; }
export interface ProviderStatus { connected: boolean; message?: string; }
export interface SyncProvider { id: string; connect(): Promise<void>; disconnect(): Promise<void>; push(batch: SyncBatch): Promise<ProviderPushResult>; pull(cursor?: string): Promise<ProviderPullResult>; status(): Promise<ProviderStatus>; }
export interface SyncQueueItem { id: string; entityType: "item" | "attachment" | "tag" | "setting" | "module-record"; entityId: string; operation: "create" | "update" | "delete"; payload: unknown; status: "pending" | "running" | "succeeded" | "failed" | "blocked"; attempts: number; lastError?: string; createdAt: number; updatedAt: number; }
export interface SyncStatus { enabled: boolean; providerId?: string; pendingCount: number; running: boolean; lastSyncAt?: number; lastError?: string; }
export interface SyncEngine { enable(provider: SyncProvider): Promise<void>; disable(): Promise<void>; enqueue(change: SyncQueueItem): Promise<void>; runOnce(): Promise<SyncResult>; status(): Promise<SyncStatus>; }
