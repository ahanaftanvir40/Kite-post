interface Bucket {
  hits: number[];
}

export interface RateLimiter {
  /** Returns true when the call is allowed, and records it. */
  check(key: string, now?: number): boolean;
  reset(): void;
}

/**
 * Sliding-window limiter held in process memory. Best effort only: on
 * serverless each instance has its own counters, so treat it as a first layer.
 */
export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const buckets = new Map<string, Bucket>();
  return {
    check(key, now = Date.now()) {
      const bucket = buckets.get(key) ?? { hits: [] };
      bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
      if (bucket.hits.length >= limit) {
        buckets.set(key, bucket);
        return false;
      }
      bucket.hits.push(now);
      buckets.set(key, bucket);
      if (buckets.size > 5000) {
        for (const [k, b] of buckets) {
          if (b.hits.every((t) => now - t >= windowMs)) buckets.delete(k);
        }
      }
      return true;
    },
    reset() {
      buckets.clear();
    },
  };
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}
