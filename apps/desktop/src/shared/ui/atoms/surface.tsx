import type { HTMLAttributes, ReactNode } from "react";

export function Surface({ children, className, ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return <section {...props} className={["module-panel", className].filter(Boolean).join(" ")}>{children}</section>;
}
