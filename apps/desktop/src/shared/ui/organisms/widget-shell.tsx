import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { WidgetHeader } from "../molecules/widget-header.js";

export interface WidgetShellProps {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}

const WidgetShellActionContext = createContext<((action: ReactNode | null) => void) | null>(null);

export function useWidgetShellAction(action: ReactNode): void {
  const setAction = useContext(WidgetShellActionContext);
  useEffect(() => {
    if (!setAction) return;
    setAction(action);
    return () => setAction(null);
  }, [action, setAction]);
}

/** Shared organism for every widget surface, card and focus view. */
export function WidgetShell({ title, eyebrow, action, toolbar, children, className, testId }: WidgetShellProps) {
  const [extraAction, setExtraAction] = useState<ReactNode | null>(null);
  return (
    <WidgetShellActionContext.Provider value={setExtraAction}>
    <section className={["widget-shell", className].filter(Boolean).join(" ")} data-testid={testId} aria-label={`${title} workspace`}>
      <WidgetHeader title={title} {...(eyebrow ? { eyebrow } : {})} action={action || extraAction ? <>{action}{extraAction}</> : null} />
      {toolbar ? <div className="widget-shell-toolbar">{toolbar}</div> : null}
      <div className="widget-shell-body widget-card-body">{children}</div>
    </section>
    </WidgetShellActionContext.Provider>
  );
}
