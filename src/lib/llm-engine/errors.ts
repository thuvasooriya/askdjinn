/** Base error for LLM provider failures. */
export class LlmError extends Error {
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

/** Raised when provider credentials or model settings are missing. */
export class LlmConfigurationError extends LlmError {
  constructor(message = "LLM provider is not configured", details?: unknown) {
    super(message, { code: "llm_configuration_error", retryable: false, details });
  }
}

/** Raised when authentication fails (401/403). Not retryable. */
export class LlmAuthError extends LlmError {
  constructor(message = "Authentication failed", details?: unknown) {
    super(message, { code: "llm_auth_error", retryable: false, details });
  }
}

/** Raised when the provider returns 429 rate-limit. Retryable after delay. */
export class LlmRateLimitError extends LlmError {
  readonly retryAfterMs?: number;
  constructor(message = "Rate limited", retryAfterMs?: number, details?: unknown) {
    super(message, { code: "llm_rate_limit_error", retryable: true, details });
    this.retryAfterMs = retryAfterMs;
  }
}

/** Raised when request payload exceeds provider limits (413). Not retryable. */
export class LlmContentTooLargeError extends LlmError {
  constructor(message = "Request too large", details?: unknown) {
    super(message, { code: "llm_content_too_large", retryable: false, details });
  }
}

/** Raised on 5xx server errors or connection failures. Retryable. */
export class LlmServerError extends LlmError {
  readonly statusCode?: number;
  constructor(message = "Provider server error", statusCode?: number, details?: unknown) {
    super(message, { code: "llm_server_error", retryable: true, details });
    this.statusCode = statusCode;
  }
}

/** Raised when chat completion fails for uncategorized reasons. */
export class LlmProviderError extends LlmError {
  constructor(message = "LLM provider request failed", details?: unknown) {
    super(message, { code: "llm_provider_error", retryable: false, details });
  }
}

/** Raised when a model requests or executes an invalid tool call. */
export class LlmToolError extends LlmError {
  constructor(message = "LLM tool call failed", details?: unknown) {
    super(message, { code: "llm_tool_error", retryable: false, details });
  }
}
