/** Base error for MCP client failures. */
export class McpError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(message: string, options: { code: string; retryable?: boolean; details?: unknown }) {
    super(message);
    this.name = new.target.name;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

/** Raised when the MCP transport cannot connect or reconnect. */
export class McpConnectionError extends McpError {
  constructor(message = "MCP connection failed", details?: unknown) {
    super(message, { code: "mcp_connection_error", retryable: true, details });
  }
}

/** Raised when a tool call returns an application-level error. */
export class McpToolError extends McpError {
  constructor(message = "MCP tool returned an error", details?: unknown) {
    super(message, { code: "mcp_tool_error", retryable: false, details });
  }
}

/** Raised when a request exceeds its configured timeout. */
export class McpTimeoutError extends McpError {
  constructor(message = "MCP request timed out", details?: unknown) {
    super(message, { code: "mcp_timeout_error", retryable: true, details });
  }
}

/** Raised when the MCP server asks the caller to back off. */
export class McpRateLimitError extends McpError {
  constructor(message = "MCP rate limit exceeded", details?: unknown) {
    super(message, { code: "mcp_rate_limit_error", retryable: true, details });
  }
}
