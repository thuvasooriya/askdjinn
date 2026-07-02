import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpConnectionError, McpError, McpRateLimitError, McpTimeoutError, McpToolError } from "./errors";
import type { HealthStatus, McpClient, McpClientConfig, McpResult, McpTool, McpToolArgs } from "./types";

const DEFAULT_TIMEOUT_MS = 20_000;

/** Create a reusable HTTP MCP client from plain configuration. */
export function createHttpMcpClient(config: McpClientConfig): McpClient {
  return new HttpMcpClient(config);
}

class HttpMcpClient implements McpClient {
  private client: Client | null = null;
  private connectPromise: Promise<Client> | null = null;
  private readonly config: Required<Omit<McpClientConfig, "responseFormat">> & Pick<McpClientConfig, "responseFormat">;

  constructor(config: McpClientConfig) {
    this.config = {
      clientName: config.clientName ?? "djinn",
      clientVersion: config.clientVersion ?? "0.1.0",
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      responseFormat: config.responseFormat ?? "json",
      url: config.url,
    };
  }

  async callTool<T = unknown>(name: string, args: McpToolArgs = {}, options?: { timeoutMs?: number }): Promise<McpResult<T>> {
    const startedAt = Date.now();
    try {
      const data = await this.withTimeout(async (signal) => {
        const result = await this.runTool(name, args, signal);
        return result as T;
      }, options?.timeoutMs);
      return ok(data, name, startedAt);
    } catch (error) {
      const mapped = mapMcpError(error, `MCP call failed for ${name}`);
      if (mapped instanceof McpConnectionError) await this.resetClient();
      return fail(mapped, name, startedAt);
    }
  }

  async listTools(options?: { timeoutMs?: number }): Promise<McpResult<McpTool[]>> {
    const startedAt = Date.now();
    try {
      const data = await this.withTimeout(async (signal) => {
        signal.throwIfAborted();
        const client = await this.getClient();
        signal.throwIfAborted();
        const result = await client.listTools(undefined, { signal });
        return normalizeTools(result);
      }, options?.timeoutMs);
      return ok(data, "listTools", startedAt);
    } catch (error) {
      const mapped = mapMcpError(error, "MCP tool listing failed");
      if (mapped instanceof McpConnectionError) await this.resetClient();
      return fail(mapped, "listTools", startedAt);
    }
  }

  async healthCheck(): Promise<McpResult<HealthStatus>> {
    const startedAt = Date.now();
    const tools = await this.listTools();
    const data: HealthStatus = {
      ok: tools.ok,
      latencyMs: Date.now() - startedAt,
      checkedAt: Date.now(),
      message: tools.ok ? "MCP connection healthy" : tools.error.message,
    };
    return tools.ok ? ok(data, "healthCheck", startedAt) : fail(tools.error, "healthCheck", startedAt);
  }

  async close(): Promise<McpResult<void>> {
    const startedAt = Date.now();
    try {
      await this.resetClient();
      return ok(undefined, "close", startedAt);
    } catch (error) {
      return fail(mapMcpError(error, "MCP close failed"), "close", startedAt);
    }
  }

  private async runTool(name: string, args: McpToolArgs, signal: AbortSignal) {
    signal.throwIfAborted();
    const client = await this.getClient();
    signal.throwIfAborted();
    const result = await client.callTool(
      { name, arguments: toMcpArguments(args, this.config.responseFormat) },
      undefined,
      { signal }
    );
    if (result.isError) throw new McpToolError(`MCP tool ${name} returned an error`, result.content);
    return result;
  }

  private async getClient() {
    if (this.client) return this.client;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = (async () => {
      const client = new Client({ name: this.config.clientName, version: this.config.clientVersion });
      const transport = new StreamableHTTPClientTransport(new URL(this.config.url));
      await client.connect(transport);
      this.client = client;
      this.connectPromise = null;
      return client;
    })().catch((error) => {
      this.client = null;
      this.connectPromise = null;
      throw error;
    });

    return this.connectPromise;
  }

  private async resetClient() {
    const client = this.client;
    this.client = null;
    this.connectPromise = null;
    await client?.close().catch(() => undefined);
  }

  private async withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, customTimeoutMs?: number) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new McpTimeoutError()), customTimeoutMs ?? this.config.timeoutMs);
    try {
      return await fn(controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function ok<T>(data: T, toolName: string, startedAt: number): McpResult<T> {
  return { ok: true, data, meta: { latencyMs: Date.now() - startedAt, toolName } };
}

function fail<T>(error: McpError, toolName: string, startedAt: number): McpResult<T> {
  return { ok: false, error, meta: { latencyMs: Date.now() - startedAt, toolName } };
}

export function toMcpArguments(args: McpToolArgs, responseFormat: "json" | "text" = "json"): { params: { response_format: "json" | "text"; [key: string]: unknown } } {
  // Kapruka MCP requires all args nested under "params"
  // Strip null/undefined values -- MCP server rejects null for optional fields
  const cleanArgs = stripNulls(args);
  return { params: { response_format: responseFormat, ...cleanArgs } };
}

function stripNulls(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value != null) result[key] = value;
  }
  return result;
}

function normalizeTools(value: unknown): McpTool[] {
  const record = value && typeof value === "object" ? value as { tools?: unknown } : {};
  const tools = Array.isArray(record.tools) ? record.tools : [];
  return tools.flatMap((tool) => {
    if (!tool || typeof tool !== "object") return [];
    const item = tool as Record<string, unknown>;
    if (typeof item.name !== "string") return [];
    return [{
      name: item.name,
      description: typeof item.description === "string" ? item.description : undefined,
      inputSchema: isRecord(item.inputSchema) ? item.inputSchema : undefined,
    }];
  });
}

function mapMcpError(error: unknown, fallback: string): McpError {
  if (error instanceof McpError) return error;
  const message = error instanceof Error ? error.message : fallback;
  if (/timed out|abort/i.test(message)) return new McpTimeoutError("MCP request timed out", error);
  if (/rate|429/i.test(message)) return new McpRateLimitError("MCP rate limit exceeded", error);
  if (/closed|connect|connection|fetch|network|socket|terminated|transport/i.test(message)) return new McpConnectionError("Could not reach MCP server", error);
  return new McpToolError(message || fallback, error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
