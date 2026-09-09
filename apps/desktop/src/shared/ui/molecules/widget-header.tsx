import type { ReactNode } from "react";
import { Heading } from "../atoms/heading.js";

export interface WidgetHeaderProps {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
}

/** Shared header molecule for every widget card and focus view. */
export function WidgetHeader({ eyebrow, title, action }: WidgetHeaderProps) {
  return (
    <header className="widget-header">
      <div className="widget-shell-heading">
        <Heading level={1} {...(eyebrow ? { eyebrow } : {})}>{title}</Heading>
      </div>
      {action ? <div className="widget-shell-action">{action}</div> : null}
    </header>
  );
}
