// In-memory rate limiter for MCP and API call protection.
// Per-process: a globalThis singleton preserves state across hot reloads and
// warm serverless instances. No external store is used by design.

export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; remaining: number }>;
}

const stateKey = "__djinn_rate_limiter__";

class MemoryRateLimiter implements RateLimiter {
  private store = new Map<string, { count: number; resetAt: number }>();
  private lastPrune = Date.now();
  private readonly PRUNE_INTERVAL = 60_000;

  async check(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; remaining: number }> {
    const now = Date.now();

    // Prune expired entries periodically
    if (now - this.lastPrune > this.PRUNE_INTERVAL) {
      for (const [k, entry] of this.store) {
        if (now > entry.resetAt) this.store.delete(k);
      }
      this.lastPrune = now;
    }

    const entry = this.store.get(key);

    if (!entry || now > entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1 };
    }

    if (entry.count >= limit) {
      return { allowed: false, remaining: 0 };
    }

    entry.count++;
    return { allowed: true, remaining: limit - entry.count };
  }
}

export async function pickRateLimiter(): Promise<RateLimiter> {
  const globalState = globalThis as typeof globalThis & { [stateKey]?: RateLimiter };
  if (!globalState[stateKey]) globalState[stateKey] = new MemoryRateLimiter();
  return globalState[stateKey];
}

// Simple IP-based rate limit for API routes.
export async function checkRateLimit(identifier: string, limit = 60, windowMs = 60_000): Promise<boolean> {
  const limiter = await pickRateLimiter();
  const result = await limiter.check(identifier, limit, windowMs);
  return result.allowed;
}
