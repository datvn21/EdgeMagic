import { Children, type ReactNode } from "react";
import { Surface } from "../../../shared/ui/atoms/surface.js";

export function ShelfView({ cards, actions }: { cards: ReactNode; actions: ReactNode }) {
  return (
    <Surface className="widget-canvas" aria-label="Edge widgets">
      <div className="widget-grid" data-card-count={Children.count(cards)} data-testid="expanded-widget-stack">{cards}</div>
      <div className="compact-widget-row" data-testid="compact-widget-row">{actions}</div>
    </Surface>
  );
}
