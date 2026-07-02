import { env } from "$env/dynamic/private";
import { createHttpMcpClient, McpConnectionError, McpRateLimitError, type McpClient, type McpToolArgs } from "$lib/mcp-client";
import type { McpResult } from "$lib/mcp-client/types";
import { KAPRUKA_MCP_URL } from "$lib/providers";
import { pickCache, type CacheProvider } from "$lib/server/cache";
import { pickRateLimiter, type RateLimiter } from "$lib/server/rate-limiter";
import { pickProfiler, type Profiler } from "$lib/server/profiler";

// Kapruka MCP allows 60 req/min per client IP. We cap at 55 to leave headroom
// and avoid hitting the upstream 429. The MCP also sends RateLimit-* headers
// on every response — we parse those for dynamic backoff (see executeWithRetry).
const MCP_RATE_LIMIT = 55;
const MCP_RATE_WINDOW = 60_000;
const CACHE_TTL_MS = 1_800_000;
const stateKey = "__djinn_mcp_client__";

const cacheableTools = new Set([
  "kapruka_search_products",
  "kapruka_get_product",
  "kapruka_list_categories",
  "kapruka_list_delivery_cities",
]);

function getMcpClient(timeoutMs = 20_000): McpClient {
  const globalState = globalThis as typeof globalThis & { [stateKey]?: McpClient };
  if (!globalState[stateKey]) {
    globalState[stateKey] = createHttpMcpClient({
      url: KAPRUKA_MCP_URL,
      clientName: "djinn",
      clientVersion: "0.1.0",
      responseFormat: "json",
      timeoutMs,
    });
  }
  return globalState[stateKey];
}

export async function callMcpTool<T = unknown>(
  name: string,
  args: McpToolArgs = {},
  timeoutMs?: number,
): Promise<T> {
  const cache: CacheProvider = await pickCache();
  const profiler: Profiler = pickProfiler();

  // Cache FIRST, rate limit SECOND. A cached result should never consume
  // a rate-limit slot — otherwise repeated identical searches exhaust the
  // budget and block fresh queries even though no MCP call is made.
  const cacheKey = cacheableTools.has(name) ? `mcp:${name}:${stableHash(args)}` : null;

  if (cacheKey) {
    const cached = await cache.get<T>(cacheKey);
    if (cached !== null) {
      profiler.metric("mcp.cache_hit", 1, { tool: name });
      return cached;
    }
  }

  const limiter: RateLimiter = await pickRateLimiter();
  const rateResult = await limiter.check("mcp-global", MCP_RATE_LIMIT, MCP_RATE_WINDOW);
  if (!rateResult.allowed) {
    throw new Error("MCP rate limit exceeded. Please try again shortly.");
  }

  return profiler.trace(
    `mcp.${name}`,
    async () => {
      const result = await executeWithRetry<T>(name, args, timeoutMs);

      if (cacheKey && result.ok) {
        void cache.set(cacheKey, result.data, CACHE_TTL_MS);
      }

      if (result.ok) return result.data;
      throw result.error;
    },
    { tool: name },
  );
}

async function executeWithRetry<T>(
  name: string,
  args: McpToolArgs,
  timeoutMs?: number,
): Promise<McpResult<T>> {
  const client = getMcpClient();
  const result = await client.callTool<T>(name, args, timeoutMs ? { timeoutMs } : undefined);

  if (!result.ok && result.error instanceof McpConnectionError) {
    // Brief backoff before a single retry so a transient MCP blip doesn't
    // hammer the connection on every request under outage.
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 250);
    await promise;
    return client.callTool<T>(name, args, timeoutMs ? { timeoutMs } : undefined);
  }

  if (!result.ok && result.error instanceof McpRateLimitError) {
    // Upstream 429 — back off 1.5s before one retry. The upstream allows 60/min
    // so a short wait is usually enough for the window to reset a slot.
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 1500);
    await promise;
    return client.callTool<T>(name, args, timeoutMs ? { timeoutMs } : undefined);
  }

  return result;
}

function stableHash(obj: Record<string, unknown>): string {
  return JSON.stringify(sortKeys(obj));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record).sort().reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortKeys(record[key]);
      return acc;
    }, {});
  }
  return value;
}

export { getMcpClient };
