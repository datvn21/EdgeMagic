import { describe, expect, it } from "vitest";
import { DedupeCache } from "./dedupe-cache.js";

describe("DedupeCache", () => {
  it("rejects duplicate keys inside the configured window", () => {
    const dedupe = new DedupeCache(100);

    expect(dedupe.shouldAccept("a", 1000)).toBe(true);
    expect(dedupe.shouldAccept("a", 1050)).toBe(false);
    expect(dedupe.shouldAccept("a", 1101)).toBe(true);
  });
});

