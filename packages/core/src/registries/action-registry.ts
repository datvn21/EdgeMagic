import type { ActionInput, ActionRegistry, ActionResult, EdgeAction, Unregister } from "@edgemagic/module-api";
import type { EdgeItem } from "@edgemagic/types";

export class RuntimeActionRegistry implements ActionRegistry {
  private readonly actions = new Map<string, EdgeAction>();
  register(action: EdgeAction): Unregister {
    if (this.actions.has(action.id)) throw new Error(`Action already registered: ${action.id}`);
    this.actions.set(action.id, action);
    return () => { this.actions.delete(action.id); };
  }
  listForItem(item: EdgeItem): EdgeAction[] { return [...this.actions.values()].filter((action) => action.itemTypes.includes(item.type)); }
  async run(id: string, item: EdgeItem, input?: ActionInput): Promise<ActionResult> {
    const action = this.actions.get(id);
    if (!action) throw new Error(`Action not registered: ${id}`);
    if (!action.itemTypes.includes(item.type)) throw new Error(`Action ${id} does not support item type: ${item.type}`);
    return action.run(item, input);
  }
}
