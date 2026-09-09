import type { DragEvent } from "react";

export function EdgeHandle({ onOpen, onHover, onDragEnter, onDragOver, onDrop }: { onOpen: () => void; onHover: () => void; onDragEnter: (event: DragEvent<HTMLButtonElement>) => void; onDragOver: (event: DragEvent<HTMLButtonElement>) => void; onDrop: (event: DragEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      className="edge-handle"
      aria-label="Open EdgeMagic"
      title="Open EdgeMagic"
      onClick={onOpen}
      onMouseEnter={onHover}
      onFocus={onHover}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
    </button>
  );
}
