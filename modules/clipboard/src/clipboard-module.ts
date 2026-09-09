import type { EdgeModule, ModuleContext, Unsubscribe } from "@edgemagic/module-api";
import type { ClipboardPayload } from "@edgemagic/types";
import { DedupeCache } from "./dedupe-cache.js";
import { normalizeClipboardPayload } from "./capture-normalization.js";

const clipboardEnabledKey = "capture.clipboard.enabled";

export interface ClipboardModuleOptions {
  dedupeWindowMs?: number;
}

export function createClipboardModule(options: ClipboardModuleOptions = {}): EdgeModule {
  const dedupe = new DedupeCache(options.dedupeWindowMs);
  let unsubscribe: Unsubscribe | undefined;

  async function handlePayload(ctx: ModuleContext, payload: ClipboardPayload) {
    const enabled = (await ctx.settings.get<boolean>(clipboardEnabledKey)) ?? true;
    if (!enabled) {
      return;
    }

    for (const capture of normalizeClipboardPayload(payload)) {
      if (!dedupe.shouldAccept(capture.dedupeKey)) {
        continue;
      }

      const item = await ctx.items.create(capture.item);
      if (capture.attachment) {
        await ctx.attachments.attach(item.id, capture.attachment);
      }
      ctx.events.emit({ type: "capture.created", payload: { itemId: item.id, source: item.source, type: item.type } });
    }
  }

  return {
    manifest: {
      id: "clipboard",
      nameKey: "modules.clipboard",
      version: "0.1.0",
      icon: "clipboard",
      defaultEnabled: true,
      permissions: ["clipboard.read", "items.write"],
      itemTypes: ["text", "link", "image", "file"]
    },
    activate(ctx) {
      unsubscribe = ctx.platform.clipboard.onChange((payload) => {
        void handlePayload(ctx, payload).catch((error: unknown) => {
          ctx.logger.error("Clipboard capture failed", { error });
        });
      });
    },
    deactivate() {
      unsubscribe?.();
      unsubscribe = undefined;
    }
  };
}
