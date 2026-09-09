export class DedupeCache {
  private readonly seen = new Map<string, number>();

  constructor(private readonly windowMs = 1500) {}

  shouldAccept(key: string, now = Date.now()): boolean {
    this.prune(now);
    const lastSeenAt = this.seen.get(key);
    if (lastSeenAt !== undefined && now - lastSeenAt < this.windowMs) {
      return false;
    }

    this.seen.set(key, now);
    return true;
  }

  private prune(now: number): void {
    for (const [key, seenAt] of this.seen.entries()) {
      if (now - seenAt >= this.windowMs) {
        this.seen.delete(key);
      }
    }
  }
}

