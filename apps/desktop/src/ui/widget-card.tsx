import type { DragEvent, ReactNode } from "react";
import type { ModuleDefinition } from "./widget-registry.js";
import { WidgetShell } from "../shared/ui/organisms/widget-shell.js";

interface WidgetCardProps {
  module: ModuleDefinition;
  active: boolean;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  dropState?: "idle" | "eligible" | "over" | "rejected";
  children: ReactNode;
}

export function WidgetCard({ module, active, onDragOver, onDrop, dropState = "idle", children }: WidgetCardProps) {
  return (
    <article
      className={`widget-card ${active ? "is-target" : ""} drop-${dropState}`}
      data-widget={module.id}
      data-drop-state={dropState}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {dropState === "eligible" || dropState === "over" ? <span className="widget-drop-hint" aria-hidden="true">Drop into {module.label}</span> : null}
      <WidgetShell title={module.label} className="widget-card-surface" testId={`${module.id}-widget-body`}>
        {active ? children : null}
      </WidgetShell>
    </article>
  );
}
