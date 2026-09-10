import type {
  ClipboardPayload,
  EdgeItem,
  ItemMetadata,
  ItemType
} from "@edgemagic/types";

export type { AttachmentService, CreateAttachmentInput, CreateItemInput, ItemListQuery, ItemService, SearchService, StorageService, StorageTransaction, UpdateItemInput } from "./items.js";
export type { ProviderPullResult, ProviderPushResult, ProviderStatus, SyncBatch, SyncEngine, SyncProvider, SyncQueueItem, SyncResult, SyncStatus } from "./sync.js";
import type { AttachmentService, ItemService, SearchService } from "./items.js";

export type {
  AppearanceMode,
  AppliedEdgeWindowState,
  ApplyEdgeWindowRequest,
  EdgeWindowIntent,
  EdgeWindowMode,
  EdgeWindowPosition,
  WindowPlatform
} from "./platform/window.js";

import type { WindowPlatform } from "./platform/window.js";

export type Unsubscribe = () => void;
export type Unregister = () => void;


export interface EdgeEvent<TPayload = unknown> {
  type: string;
  payload: TPayload;
}

export type EventHandler<TEvent extends EdgeEvent = EdgeEvent> = (event: TEvent) => void;

export interface EventBus {
  emit<TEvent extends EdgeEvent>(event: TEvent): void;
  on<TEvent extends EdgeEvent>(type: TEvent["type"], handler: EventHandler<TEvent>): Unsubscribe;
}

export interface CommandInput {
  text?: string;
  metadata?: ItemMetadata;
}

export interface CommandResult {
  handled: boolean;
  item?: EdgeItem;
  message?: string;
}

export interface EdgeCommand {
  id: string;
  titleKey: string;
  keywords: string[];
  moduleId?: string;
  run(input?: CommandInput): Promise<CommandResult> | CommandResult;
}

export interface CommandRegistry {
  register(command: EdgeCommand): Unregister;
  execute(id: string, input?: CommandInput): Promise<CommandResult>;
  search(query: string): EdgeCommand[];
}

export interface ActionInput {
  metadata?: ItemMetadata;
}

export interface ActionResult {
  handled: boolean;
  item?: EdgeItem;
  message?: string;
}

export interface EdgeAction {
  id: string;
  titleKey: string;
  itemTypes: ItemType[];
  moduleId?: string;
  run(item: EdgeItem, input?: ActionInput): Promise<ActionResult> | ActionResult;
}

export interface ActionRegistry {
  register(action: EdgeAction): Unregister;
  listForItem(item: EdgeItem): EdgeAction[];
  run(id: string, item: EdgeItem, input?: ActionInput): Promise<ActionResult>;
}

export interface SettingsService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

export interface NotificationRequest {
  id: string;
  title: string;
  body?: string;
  itemId?: string;
  at?: number;
  actionId?: string;
}

export interface NotificationService {
  schedule(request: NotificationRequest): Promise<void>;
  cancel(id: string): Promise<void>;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface ClipboardPlatform {
  read(): Promise<ClipboardPayload | null>;
  onChange(handler: (payload: ClipboardPayload) => void): Unsubscribe;
}

export interface NotificationPlatform {
  send(request: NotificationRequest): Promise<void>;
}

export interface ShortcutPlatform {
  register(binding: string, handler: () => void): Promise<Unregister>;
}

export interface TrayPlatform {
  setMenu(items: Array<{ id: string; label: string }>): Promise<void>;
}

export interface FilePlatform {
  showInFolder(path: string): Promise<void>;
  open(path: string): Promise<void>;
  saveText?(filename: string, contents: string): Promise<string>;
  openManagedFile?(path: string): Promise<void>;
  openUrl?(url: string): Promise<void>;
  getFileSize?(path: string): Promise<number>;
  persistDroppedFile?(filename: string, bytes: Uint8Array): Promise<string>;
  deleteDroppedFile?(path: string): Promise<void>;
  onDrop(handler: (paths: string[]) => void): Unregister;
  onDropEvent?(handler: (event: FileDropEvent) => void): Unregister;
}

export type FileDropEvent =
  | { type: "enter"; paths: string[] }
  | { type: "over" }
  | { type: "drop"; paths: string[] }
  | { type: "leave" };

export interface MonitorInfo {
  id: string;
  name?: string;
  primary: boolean;
}

export interface MonitorPlatform {
  list(): Promise<MonitorInfo[]>;
}

export interface StartupPlatform {
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
}

export interface DeepLinkPayload {
  url: string;
  route: "item" | "unknown";
  itemId?: string;
}

export interface DeepLinkPlatform {
  onOpen(handler: (payload: DeepLinkPayload) => void): Unsubscribe;
  parse(url: string): DeepLinkPayload;
}

export interface ScreenshotCaptureResult {
  tempPath: string;
  filename: string;
  mimeType: string;
  byteSize?: number;
  monitorId?: string;
}

export interface ScreenshotPlatform {
  capture(monitorId?: string): Promise<ScreenshotCaptureResult>;
}

export interface PlatformCapabilities {
  transparency: boolean;
  blur: boolean;
  notificationActions: boolean;
  screenshots: boolean;
  startupAtLogin: boolean;
  deepLinks: boolean;
}

export interface CapabilityPlatform {
  get(): Promise<PlatformCapabilities>;
}

export interface PlatformService {
  clipboard: ClipboardPlatform;
  window: WindowPlatform;
  notifications: NotificationPlatform;
  shortcuts: ShortcutPlatform;
  tray: TrayPlatform;
  files: FilePlatform;
  monitors: MonitorPlatform;
  startup: StartupPlatform;
  deepLinks: DeepLinkPlatform;
  screenshots: ScreenshotPlatform;
  capabilities: CapabilityPlatform;
}

export type ModulePermission =
  | "clipboard.read"
  | "clipboard.write"
  | "files.read"
  | "files.write"
  | "notifications.send"
  | "shortcuts.global"
  | "network"
  | "browser.bookmarks.read"
  | "items.read"
  | "items.write";

export interface EdgeModuleManifest {
  id: string;
  nameKey: string;
  version: string;
  icon: string;
  defaultEnabled: boolean;
  permissions: ModulePermission[];
  itemTypes: ItemType[];
}

export interface ViewRegistry {
  register(view: EdgeView): Unregister;
}

export interface EdgeView {
  id: string;
  moduleId: string;
  titleKey: string;
}

export interface ModuleContext {
  items: ItemService;
  attachments: AttachmentService;
  events: EventBus;
  settings: SettingsService;
  search: SearchService;
  platform: PlatformService;
  notifications: NotificationService;
  logger: Logger;
}

export interface EdgeModule {
  manifest: EdgeModuleManifest;
  activate(ctx: ModuleContext): Promise<void> | void;
  deactivate?(): Promise<void> | void;
  registerViews?(registry: ViewRegistry): void;
  registerCommands?(registry: CommandRegistry): void;
  registerActions?(registry: ActionRegistry): void;
}

export type PluginPermission =
  | ModulePermission
  | "settings.read"
  | "settings.write"
  | "commands.register"
  | "actions.register"
  | "views.register";

export interface EdgePluginManifest {
  id: string;
  name: string;
  version: string;
  permissions: PluginPermission[];
  defaultEnabled: boolean;
}

export interface PluginPermissionStore {
  grant(pluginId: string, permission: PluginPermission): void;
  revoke(pluginId: string, permission: PluginPermission): void;
  has(pluginId: string, permission: PluginPermission): boolean;
  list(pluginId: string): PluginPermission[];
}

export interface PluginAuditLogEntry {
  id: string;
  pluginId: string;
  event:
    | "plugin.enabled"
    | "plugin.disabled"
    | "permission.granted"
    | "permission.revoked"
    | "permission.denied"
    | "plugin.failed";
  message: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export interface PluginAuditLogger {
  record(entry: Omit<PluginAuditLogEntry, "id" | "createdAt">): void;
  list(pluginId?: string): PluginAuditLogEntry[];
}

export interface PluginContext {
  manifest: EdgePluginManifest;
  commands: CommandRegistry;
  actions: ActionRegistry;
  views: ViewRegistry;
  items: Pick<ItemService, "create" | "get" | "update" | "list">;
  settings: SettingsService;
  logger: Logger;
}

export interface EdgePlugin {
  manifest: EdgePluginManifest;
  activate(ctx: PluginContext): Promise<void> | void;
  deactivate?(): Promise<void> | void;
}

export interface PluginContributionRegistry {
  enable(plugin: EdgePlugin): Promise<void>;
  disable(pluginId: string): Promise<void>;
  isEnabled(pluginId: string): boolean;
}
