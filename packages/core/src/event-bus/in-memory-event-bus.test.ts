import { describe, expect, it } from "vitest";
import { RuntimeEventBus } from "./runtime-event-bus.js";

describe("RuntimeEventBus", () => {
  it("emits events to subscribers and supports unsubscribe", () => {
    const bus = new RuntimeEventBus();
    const seen: number[] = [];

    const unsubscribe = bus.on("item.created", (event) => {
      seen.push((event.payload as { value: number }).value);
    });

    bus.emit({ type: "item.created", payload: { value: 1 } });
    unsubscribe();
    bus.emit({ type: "item.created", payload: { value: 2 } });

    expect(seen).toEqual([1]);
  });
});
