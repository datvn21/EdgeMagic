import type { Attachment, EdgeItem, ItemMetadata, ItemType, SearchQuery, SearchResult } from "@edgemagic/types";

export interface CreateItemInput { type: ItemType; title?: string; content?: string; url?: string; path?: string; source: EdgeItem["source"]; metadata?: ItemMetadata; }
export type UpdateItemInput = Partial<Pick<EdgeItem, "title" | "content" | "url" | "path" | "metadata">>;
export interface ItemListQuery { types?: ItemType[]; includeDeleted?: boolean; limit?: number; }
export interface CreateAttachmentInput { kind: Attachment["kind"]; filename: string; mimeType?: string; byteSize?: number; localPath: string; contentHash?: string; }
export interface ItemService {
  create(input: CreateItemInput): Promise<EdgeItem>; get(id: string): Promise<EdgeItem | null>; update(id: string, patch: UpdateItemInput): Promise<EdgeItem>;
  softDelete(id: string): Promise<void>; restore(id: string): Promise<EdgeItem>; list(query?: ItemListQuery): Promise<EdgeItem[]>; convert(id: string, targetType: ItemType, input?: ItemMetadata): Promise<EdgeItem>;
}
export interface StorageTransaction { readonly id: string; }
export interface StorageService { migrate(): Promise<void>; transaction<T>(fn: (tx: StorageTransaction) => Promise<T>): Promise<T>; getSchemaVersion(): Promise<number>; }
export interface AttachmentService { attach(itemId: string, input: CreateAttachmentInput): Promise<Attachment>; listForItem(itemId: string): Promise<Attachment[]>; remove(id: string): Promise<void>; }
export interface SearchService { indexItem(item: EdgeItem): Promise<void>; removeItem(itemId: string): Promise<void>; search(query: SearchQuery): Promise<SearchResult[]>; }
