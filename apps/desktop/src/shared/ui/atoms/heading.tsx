import type { ReactNode } from "react";

export function Heading({ level = 2, eyebrow, children, className }: { level?: 1 | 2 | 3; eyebrow?: string; children: ReactNode; className?: string }) {
  const Tag = `h${level}` as "h1" | "h2" | "h3";
  return <div className={["ui-heading", `ui-heading-${level}`, className].filter(Boolean).join(" ")}>{eyebrow ? <span className="ui-eyebrow">{eyebrow}</span> : null}<Tag>{children}</Tag></div>;
}
