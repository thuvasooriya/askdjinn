import type { McpError } from "./errors";

/** JSON-like argument map accepted by MCP tools. */
export type McpToolArgs = Record<string, unknown>;

/** Minimal MCP tool description exposed to provider-agnostic callers. */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** Health information for an MCP connection. */
export interface HealthStatus {
  ok: boolean;
  latencyMs: number;
  checkedAt: number;
  message?: string;
}

/** Metadata attached to every MCP operation result. */
export interface McpResultMeta {
  latencyMs: number;
  toolName: string;
}

/** Result type used by MCP operations so callers do not need try/catch. */
export type McpResult<T = unknown> =
  | { ok: true; data: T; meta: McpResultMeta }
  | { ok: false; error: McpError; meta: McpResultMeta };

/** Runtime configuration for the HTTP MCP client. */
export interface McpClientConfig {
  url: string;
  clientName?: string;
  clientVersion?: string;
  timeoutMs?: number;
  responseFormat?: "json" | "text";
}

/** Framework-agnostic MCP client interface. */
export interface McpClient {
  callTool<T = unknown>(name: string, args?: McpToolArgs, options?: { timeoutMs?: number }): Promise<McpResult<T>>;
  listTools(options?: { timeoutMs?: number }): Promise<McpResult<McpTool[]>>;
  healthCheck(): Promise<McpResult<HealthStatus>>;
  close(): Promise<McpResult<void>>;
}
