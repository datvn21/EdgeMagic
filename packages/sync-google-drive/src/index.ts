import type {
  ProviderPullResult,
  ProviderPushResult,
  ProviderStatus,
  SyncBatch,
  SyncProvider
} from "@edgemagic/module-api";

export interface GoogleDriveProviderConfig {
  appFolderName?: string;
  credentialRef?: string;
}

export class GoogleDriveSyncProvider implements SyncProvider {
  readonly id = "google-drive";
  private connected = false;

  constructor(private readonly config: GoogleDriveProviderConfig = {}) {}

  async connect(): Promise<void> {
    if (!this.config.credentialRef) {
      throw new Error("Google Drive credentials are not configured.");
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async push(_batch: SyncBatch): Promise<ProviderPushResult> {
    if (!this.connected) {
      throw new Error("Google Drive provider is not connected.");
    }

    throw new Error("Google Drive sync transport is not implemented yet.");
  }

  async pull(_cursor?: string): Promise<ProviderPullResult> {
    if (!this.connected) {
      throw new Error("Google Drive provider is not connected.");
    }

    return { changes: [] };
  }

  async status(): Promise<ProviderStatus> {
    return {
      connected: this.connected,
      message: this.connected
        ? `Connected to ${this.config.appFolderName ?? "EdgeMagic"}`
        : "Google Drive sync is disconnected."
    };
  }
}
