import type { EdgeEvent, EventBus, EventHandler, Unsubscribe } from "@edgemagic/module-api";

export class RuntimeEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();
  emit<TEvent extends EdgeEvent>(event: TEvent): void { for (const handler of [...(this.handlers.get(event.type) ?? [])]) handler(event); }
  on<TEvent extends EdgeEvent>(type: TEvent["type"], handler: EventHandler<TEvent>): Unsubscribe {
    const handlers = this.handlers.get(type) ?? new Set<EventHandler>();
    handlers.add(handler as EventHandler);
    this.handlers.set(type, handlers);
    return () => { handlers.delete(handler as EventHandler); if (handlers.size === 0) this.handlers.delete(type); };
  }
}
