/**
 * Simple in-memory rate limiter for API routes.
 *
 * Uses a sliding-window counter keyed by IP address.
 * State lives in process memory and resets on deploy/restart.
 */

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimiterOptions {
  /** Maximum number of requests within the window. */
  limit: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

/**
 * Create a named rate limiter.
 *
 * Each limiter has its own store so different endpoints can have independent
 * limits (e.g. login = 5/min, orders = 20/min).
 */
export function createRateLimiter(name: string, options: RateLimiterOptions) {
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }

  const store = stores.get(name)!;

  return {
    /**
     * Check whether a request from `key` (typically IP) should be allowed.
     *
     * Returns `{ allowed: true }` if the request is within limits, or
     * `{ allowed: false, retryAfterMs }` if the limit has been exceeded.
     */
    check(key: string): { allowed: true } | { allowed: false; retryAfterMs: number } {
      const now = Date.now();
      const windowStart = now - options.windowMs;

      let entry = store.get(key);

      if (!entry) {
        entry = { timestamps: [] };
        store.set(key, entry);
      }

      // Remove timestamps outside the current window.
      entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

      if (entry.timestamps.length >= options.limit) {
        const oldestInWindow = entry.timestamps[0];
        const retryAfterMs = oldestInWindow + options.windowMs - now;
        return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
      }

      entry.timestamps.push(now);
      return { allowed: true };
    }
  };
}

/**
 * Extract a client identifier from the request.
 *
 * Uses common proxy headers first, then falls back to a constant (for local dev).
 */
export function getClientIp(request: Request): string {
  const headers = request.headers;

  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    "127.0.0.1"
  );
}
