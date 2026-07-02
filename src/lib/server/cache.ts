// In-memory TTL cache for MCP responses.
// Per-process: a globalThis singleton preserves state across hot reloads and
// warm serverless instances. No external store is used by design.

export interface CacheProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

const stateKey = "__djinn_cache__";

type CacheEntry = { value: unknown; expiresAt: number };

class MemoryCache implements CacheProvider {
  private store = new Map<string, CacheEntry>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs = 1_800_000): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export async function pickCache(): Promise<CacheProvider> {
  const globalState = globalThis as typeof globalThis & { [stateKey]?: CacheProvider };
  if (!globalState[stateKey]) globalState[stateKey] = new MemoryCache();
  return globalState[stateKey];
}
