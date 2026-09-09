import type { CapturedRecord } from "../capture/use-capture-inbox.js";
import { ExternalLink, File, FileText, FolderOpen, Image, Link2, Trash2, Type, Copy, SlidersHorizontal, Search, X } from "lucide-react";
import { ITEM_TRANSFER_MIME, serializeItemTransfer } from "../capture/item-transfer.js";
import { IconButton } from "../shared/ui/atoms/icon-button.js";
import { useEffect, useMemo, useState } from "react";
import { useWidgetShellAction } from "../shared/ui/organisms/widget-shell.js";

export type InboxFilter = "all" | "text" | "link" | "image" | "file";

interface InboxListProps {
  records: CapturedRecord[];
  onOpenFile?: (path: string, managedCopy: boolean) => void;
  onOpenImageData?: (dataUrl: string, title?: string) => void;
  onOpenLink?: (url: string) => void;
  onDelete?: (itemId: string) => void;
  filter?: InboxFilter;
  onFilterChange?: (filter: InboxFilter) => void;
  onClear?: () => void;
  onSearchChange?: (query: string) => void;
  hideToolbar?: boolean;
}

const filterLabels: Record<InboxFilter, string> = { all: "All", text: "Text", link: "Links", image: "Images", file: "Files" };

export function InboxToolbar({
  filter = "all",
  onFilterChange,
  onClear,
  disabled = false,
  onSearchChange
}: {
  filter?: InboxFilter | undefined;
  onFilterChange?: ((filter: InboxFilter) => void) | undefined;
  onClear?: (() => void) | undefined;
  onSearchChange?: ((query: string) => void) | undefined;
  disabled?: boolean | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const updateQuery = (value: string) => { setQuery(value); onSearchChange?.(value); };
  const headerActions = useMemo(() => <div className="inbox-header-actions"><IconButton label={open ? "Hide filters" : "Show filters"} title={open ? "Hide filters" : "Show filters"} aria-pressed={open} className={open ? "is-active" : ""} onClick={() => setOpen((value) => !value)}><SlidersHorizontal size={17} aria-hidden="true" /></IconButton><IconButton label="Clear clipboard" title="Clear clipboard" className="clear-inbox-button" onClick={onClear} disabled={disabled}><Trash2 size={18} aria-hidden="true" /></IconButton></div>, [disabled, onClear, open]);
  useWidgetShellAction(headerActions);
  return (
    <div className={`inbox-toolbar ${open ? "is-open" : ""}`}>
      {open ? <div className="inbox-filter-panel">
        <div className="inbox-search"><Search size={15} aria-hidden="true" /><input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Search clipboard" aria-label="Search clipboard" />{query ? <IconButton label="Clear search" title="Clear search" onClick={() => updateQuery("")}><X size={14} aria-hidden="true" /></IconButton> : null}</div>
        <div className="inbox-filters" role="tablist" aria-label="Filter captured items">{(Object.keys(filterLabels) as InboxFilter[]).map((value) => <button key={value} type="button" role="tab" aria-selected={filter === value} data-filter={value} onClick={() => onFilterChange?.(value)}>{filterLabels[value]}</button>)}</div>
      </div> : null}
    </div>
  );
}

export function InboxList({ records, onOpenFile, onOpenImageData, onOpenLink, onDelete, filter: filterProp = "all", onFilterChange, onClear, hideToolbar = false }: InboxListProps) {
  const [filter, setFilter] = useState<InboxFilter>(filterProp);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(() => new Set());
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [suppressItemHover, setSuppressItemHover] = useState(false);

  useEffect(() => {
    const finishDrag = () => {
      setDraggingItemId(null);
      setSuppressItemHover(true);
      blurActiveElement();
      emitInboxItemDrag("end");
    };
    window.addEventListener("dragend", finishDrag);
    window.addEventListener("drop", finishDrag);
    return () => {
      window.removeEventListener("dragend", finishDrag);
      window.removeEventListener("drop", finishDrag);
    };
  }, []);

  const handleFilterChange = (next: InboxFilter) => {
    setFilter(next);
    onFilterChange?.(next);
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleRecords = records.filter(({ item }) => {
    if (filter !== "all" && item.type !== filter) return false;
    if (!normalizedQuery) return true;
    return [item.title, item.content, item.url, item.path].filter(Boolean).some((value) => value!.toLowerCase().includes(normalizedQuery));
  });
  const Icon = filter === "image" ? Image : filter === "file" ? File : filter === "link" ? Link2 : filter === "text" ? Type : FileText;

  return (
    <section
      className={`inbox-shelf${suppressItemHover ? " suppress-item-hover" : ""}`}
      aria-label="Captured items"
      onPointerMove={() => {
        if (suppressItemHover) setSuppressItemHover(false);
      }}
    >
      {!hideToolbar ? <InboxToolbar filter={filter} onFilterChange={handleFilterChange} onSearchChange={setSearchQuery} onClear={onClear} disabled={records.length === 0} /> : null}
      {visibleRecords.length === 0 ? (
        <div className="inbox-empty" data-drop-active="false">
          <Icon size={20} aria-hidden="true" />
          <strong>{records.length === 0 ? "Drop anything here" : `No ${filterLabels[filter].toLowerCase()} yet`}</strong>
          <span>Text, links, images, and files are collected at the edge.</span>
        </div>
      ) : null}
      {visibleRecords.map(({ item, attachment }) => {
        const expanded = expandedItemIds.has(item.id);
        return <article
          key={item.id}
          className={`inbox-item${draggingItemId === item.id ? " is-dragging" : ""}`}
          draggable
          title="Drag to another app"
          onDragStart={(event) => {
            setDraggingItemId(item.id);
            setSuppressItemHover(false);
            const transfer = event.dataTransfer;
            const path = attachment?.localPath ?? item.path;
            const isImage = item.type === "image" || attachment?.kind === "image" || attachment?.kind === "screenshot";

            transfer.effectAllowed = "copy";
            transfer.clearData();
            transfer.setData(ITEM_TRANSFER_MIME, serializeItemTransfer({ item, ...(attachment ? { attachment } : {}) }));

            if (isImage && path) {
              // Chromium/Windows uses DownloadURL to receive the actual file,
              // while file:// keeps the payload useful to file-drop targets.
              const fileUrl = toFileUrl(path);
              const mimeType = attachment?.mimeType ?? "image/*";
              const filename = attachment?.filename ?? item.title ?? "image";
              transfer.setData("DownloadURL", `${mimeType}:${filename}:${fileUrl}`);
              transfer.setData("text/uri-list", fileUrl);
            } else if (item.type === "text" && item.content) {
              transfer.setData("text/plain", item.content);
            } else if (item.type === "link" && item.url) {
              transfer.setData("text/uri-list", item.url);
              transfer.setData("text/plain", item.url);
            } else if (path) {
              const fileUrl = toFileUrl(path);
              transfer.setData("DownloadURL", `application/octet-stream:${item.title ?? "download"}:${fileUrl}`);
              transfer.setData("text/uri-list", fileUrl);
            }

            setDragGhost(transfer, event.currentTarget, {
              kind: isImage ? "image" : "text",
              value: isImage && path ? toFileUrl(path) : item.content ?? item.url ?? item.title ?? ""
            });
            emitInboxItemDrag("start");
          }}
          onDragEnd={() => {
            setDraggingItemId(null);
            setSuppressItemHover(true);
            blurActiveElement();
            emitInboxItemDrag("end");
          }}
        >
          <div className="inbox-item-content">
            {item.type === "image" && item.path?.startsWith("data:image/") ? (
              <img className="inbox-image-preview" src={item.path} alt={item.title ?? "Dropped image"} />
            ) : item.type === "text" ? (
              <h3 className="inbox-item-text">
                <button
                  type="button"
                  className={`inbox-item-text-toggle${expanded ? " is-expanded" : ""}`}
                  draggable={false}
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "Collapse" : "Expand"} clipboard item`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpandedItemIds((current) => {
                      const next = new Set(current);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    });
                  }}
                >
                  {item.content ?? item.title ?? "Captured text"}
                </button>
              </h3>
            ) : item.type === "link" ? (
              <div className="inbox-link-content">
                <h3>{item.url ?? item.title ?? "Captured link"}</h3>
                <p>{new Date(item.createdAt).toLocaleString()}</p>
              </div>
            ) : (
              <>
                <span>{item.type}</span>
                <h3>{item.title ?? item.content ?? item.url ?? item.path ?? "Captured item"}</h3>
                <p>{new Date(item.createdAt).toLocaleString()}</p>
                {attachment ? <p>Attachment metadata: {attachment.filename}</p> : null}
              </>
            )}
          </div>
          <div className={`item-actions ${item.type === "link" && item.url && onOpenLink || item.type === "file" && (attachment?.localPath ?? item.path) && onOpenFile || item.type === "image" && item.path?.startsWith("data:image/") && onOpenImageData ? "has-open-action" : ""}`} aria-label={`Actions for ${item.title ?? item.id}`} draggable={false} onDragStart={(event) => event.preventDefault()}>
            {item.type === "link" && item.url && onOpenLink ? (
              <button type="button"
                draggable={false}
                title="Open website"
                aria-label={`Open ${item.title ?? item.url}`}
                onClick={(event) => {
                  event.stopPropagation();
                  void onOpenLink(item.url!);
                }}
              >
                <ExternalLink size={14} aria-hidden="true" />
              </button>
            ) : item.type === "image" && item.path?.startsWith("data:image/") && onOpenImageData ? (
              <button type="button"
                draggable={false}
                title="Open image"
                aria-label={`Open ${item.title ?? "image"}`}
                onClick={(event) => {
                  event.stopPropagation();
                  void onOpenImageData(item.path!, item.title);
                }}
              >
                <ExternalLink size={14} aria-hidden="true" />
              </button>
            ) : item.type === "file" && (attachment?.localPath ?? item.path) && onOpenFile ? (
              <button type="button"
                draggable={false}
                title="Open file"
                aria-label={`Open ${item.title ?? "file"}`}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  void onOpenFile(attachment?.localPath ?? item.path!, item.metadata["file.managedCopy"] === true);
                }}
              >
                <FolderOpen size={14} aria-hidden="true" />
              </button>
            ) : null}
            {item.content || item.url ? <button type="button" draggable={false} title="Copy item" aria-label={`Copy ${item.title ?? "clipboard item"}`} onClick={(event) => { event.stopPropagation(); void navigator.clipboard?.writeText(item.content ?? item.url ?? ""); }}><Copy size={14} aria-hidden="true" /></button> : null}
            <button type="button"
              draggable={false}
              title="Delete clipboard item"
              aria-label={`Delete ${item.title ?? "clipboard item"}`}
              onClick={(event) => {
                event.stopPropagation();
                onDelete?.(item.id);
              }}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
        </article>;
      })}
    </section>
  );
}

function blurActiveElement(): void {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

function emitInboxItemDrag(phase: "start" | "end"): void {
  window.dispatchEvent(new CustomEvent(`edgemagic:inbox-item-drag-${phase}`));
}

function toFileUrl(path: string): string {
  return `file://${path.replace(/\\/g, "/")}`;
}

function setDragGhost(
  transfer: DataTransfer,
  source: HTMLElement,
  payload: { kind: "image" | "text"; value: string }
): void {
  // WebView2 can fall back to snapshotting the draggable element when the
  // drag image is a child of that element. Use a standalone node instead.
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  const sourceStyle = window.getComputedStyle(source);
  ghost.style.background = sourceStyle.getPropertyValue("--surface-elevated").trim() || sourceStyle.backgroundColor;
  ghost.style.borderColor = sourceStyle.getPropertyValue("--border").trim() || sourceStyle.borderColor;
  ghost.style.color = sourceStyle.getPropertyValue("--text").trim() || sourceStyle.color;

  if (payload.kind === "image") {
    const image = document.createElement("img");
    image.src = payload.value;
    image.alt = "";
    image.className = "drag-ghost-image";
    ghost.replaceChildren(image);
  } else {
    ghost.textContent = payload.value;
  }

  document.body.appendChild(ghost);
  transfer.setDragImage(ghost, 12, 12);

  const cleanup = () => ghost.remove();
  source.addEventListener("dragend", cleanup, { once: true });
  window.setTimeout(cleanup, 30_000);
}
