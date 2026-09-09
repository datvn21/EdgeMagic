import { describe, expect, it } from "vitest";
import type { CreateItemInput, ModuleContext, Unsubscribe } from "@edgemagic/module-api";
import type { Attachment, ClipboardPayload, EdgeItem } from "@edgemagic/types";
import { createClipboardModule } from "./clipboard-module.js";

async function flushAsyncHandlers() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function createContext(enabled = true) {
  let clipboardHandler: ((payload: ClipboardPayload) => void) | undefined;
  const created: CreateItemInput[] = [];
  const attached: Array<{ itemId: string; attachment: unknown }> = [];
  const emitted: unknown[] = [];

  const context: ModuleContext = {
    items: {
      create: async (input) => {
        created.push(input);
        return {
          id: `item-${created.length}`,
          type: input.type,
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.content !== undefined ? { content: input.content } : {}),
          ...(input.url !== undefined ? { url: input.url } : {}),
          ...(input.path !== undefined ? { path: input.path } : {}),
          source: input.source,
          metadata: input.metadata ?? {},
          createdAt: 1,
          updatedAt: 1
        } satisfies EdgeItem;
      },
      get: async () => null,
      update: async () => {
        throw new Error("not used");
      },
      softDelete: async () => {},
      restore: async () => {
        throw new Error("not used");
      },
      list: async () => [],
      convert: async () => {
        throw new Error("not used");
      }
    },
    attachments: {
      attach: async (itemId, attachment) => {
        attached.push({ itemId, attachment });
        return {
          id: "attachment-1",
          itemId,
          kind: attachment.kind,
          filename: attachment.filename,
          localPath: attachment.localPath,
          createdAt: 1,
          updatedAt: 1
        } satisfies Attachment;
      },
      listForItem: async () => [],
      remove: async () => {}
    },
    events: {
      emit: (event) => emitted.push(event),
      on: () => (() => {}) satisfies Unsubscribe
    },
    settings: {
      get: async <T>() => enabled as T,
      set: async () => {}
    },
    search: {
      indexItem: async () => {},
      removeItem: async () => {},
      search: async () => []
    },
    platform: {
      clipboard: {
        read: async () => null,
        onChange: (handler) => {
          clipboardHandler = handler;
          return () => {
            clipboardHandler = undefined;
          };
        }
      },
      window: {
        apply: async (request) => ({ ...request, actualMonitorId: request.monitorId }),
        onIntent: () => () => {}
      },
      notifications: {
        send: async () => {}
      },
      shortcuts: {
        register: async () => () => {}
      },
      tray: {
        setMenu: async () => {}
      },
      files: {
        showInFolder: async () => {},
        open: async () => {},
        onDrop: () => () => {}
      },
      monitors: {
        list: async () => []
      },
      startup: {
        isEnabled: async () => false,
        setEnabled: async () => {}
      },
      deepLinks: {
        onOpen: () => () => {},
        parse: (url) => ({ url, route: "unknown" })
      },
      screenshots: {
        capture: async () => ({
          tempPath: "screenshot.png",
          filename: "screenshot.png",
          mimeType: "image/png"
        })
      },
      capabilities: {
        get: async () => ({
          transparency: false,
          blur: false,
          notificationActions: false,
          screenshots: false,
          startupAtLogin: false,
          deepLinks: false
        })
      }
    },
    notifications: {
      schedule: async () => {},
      cancel: async () => {}
    },
    logger: console
  };

  return {
    context,
    created,
    attached,
    emitted,
    trigger(payload: ClipboardPayload) {
      clipboardHandler?.(payload);
    }
  };
}

describe("createClipboardModule", () => {
  it("creates items from clipboard events", async () => {
    const module = createClipboardModule();
    const harness = createContext();

    module.activate(harness.context);
    harness.trigger({ kind: "text", text: "https://react.dev" });
    await flushAsyncHandlers();

    expect(harness.created).toHaveLength(1);
    expect(harness.created[0]).toMatchObject({ type: "link", source: "clipboard", url: "https://react.dev/" });
    expect(harness.emitted).toHaveLength(1);
  });

  it("does not capture when disabled in settings", async () => {
    const module = createClipboardModule();
    const harness = createContext(false);

    module.activate(harness.context);
    harness.trigger({ kind: "text", text: "ignored" });
    await flushAsyncHandlers();

    expect(harness.created).toHaveLength(0);
  });

  it("creates attachment metadata for clipboard file lists", async () => {
    const module = createClipboardModule();
    const harness = createContext();

    module.activate(harness.context);
    harness.trigger({ kind: "file-list", paths: ["C:/tmp/a.pdf"] });
    await flushAsyncHandlers();

    expect(harness.created[0]).toMatchObject({ type: "file", path: "C:/tmp/a.pdf" });
    expect(harness.attached).toHaveLength(1);
  });
});
