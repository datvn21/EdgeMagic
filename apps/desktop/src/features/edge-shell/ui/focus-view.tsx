import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "../../../shared/ui/atoms/icon-button.js";
import { Surface } from "../../../shared/ui/atoms/surface.js";
import { WidgetShell } from "../../../shared/ui/organisms/widget-shell.js";

export function FocusView({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <Surface className="widget-canvas focus-canvas" aria-label="Focused widget" data-testid="focus-widget-canvas">
      <WidgetShell title={title} className="widget-card-surface focus-view" action={<IconButton label="Back to shelf" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" /></IconButton>}>
        {children}
      </WidgetShell>
    </Surface>
  );
}
