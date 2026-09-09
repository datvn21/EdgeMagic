import { describe, expect, it } from "vitest";
import { GoogleDriveSyncProvider } from "./index.js";

describe("GoogleDriveSyncProvider", () => {
  it("requires credentials before connecting", async () => {
    const provider = new GoogleDriveSyncProvider();

    await expect(provider.connect()).rejects.toThrow("credentials are not configured");
    expect(await provider.status()).toMatchObject({ connected: false });
  });

  it("exposes a provider skeleton without implementing transport yet", async () => {
    const provider = new GoogleDriveSyncProvider({ credentialRef: "os-keychain:google-drive", appFolderName: "EdgeMagic" });

    await provider.connect();

    expect(await provider.status()).toMatchObject({ connected: true, message: "Connected to EdgeMagic" });
    await expect(provider.push({ items: [] })).rejects.toThrow("transport is not implemented yet");
  });
});
