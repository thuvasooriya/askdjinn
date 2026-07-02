/**
 * OpenAI-compatible LLM provider using raw fetch (zero SDK dependencies).
 *
 * Features: streaming, tool calls, automatic retry on transient failures,
 * error classification by HTTP status, rate-limit header parsing, and
 * configurable timeouts. Designed to work with Cerebras, Opencode Zen,
 * and any other provider that implements the /v1/chat/completions endpoint.
 */

import { LlmProviderError, LlmAuthError, LlmRateLimitError, LlmContentTooLargeError, LlmServerError } from "./errors";
import type { LlmChunk, LlmMessage, LlmOptions, LlmProvider, LlmResult, LlmTool, LlmToolCall } from "./types";

const PACKAGE_VERSION = "0.1.0";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;

/** Configuration for an OpenAI-compatible LLM provider. */
export interface OpenAiCompatibleConfig {
  name: string;
  apiKey?: string;
  baseURL?: string;
  model?: string;
  /** Send stream_options.include_usage (Cerebras needs this). Default: true */
  sendStreamOptions?: boolean;
  /** Override default timeout in ms. */
  timeoutMs?: number;
}

// ── Internal types for the OpenAI-compatible API wire format ─────────────────

interface OaiMessage {
  role: string;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: OaiToolCall[];
  name?: string;
}

interface OaiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OaiDelta {
  role?: string;
  content?: string | null;
  tool_calls?: OaiToolCallDelta[];
}

interface OaiToolCallDelta {
  index: number;
  id?: string;
  type?: "function";
  function?: { name?: string; arguments?: string };
}

interface OaiStreamChoice {
  index: number;
  delta: OaiDelta;
  finish_reason: string | null;
}

interface OaiStreamChunk {
  id?: string;
  object: string;
  created?: number;
  model?: string;
  choices: OaiStreamChoice[];
  usage?: unknown;
}

interface OaiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface OaiResponseChoice {
  index: number;
  message: OaiMessage;
  finish_reason: string;
}

interface OaiChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OaiResponseChoice[];
  usage?: OaiUsage;
}

// ── Error classification ─────────────────────────────────────────────────────

/** Classify an HTTP error response into the right LlmError subclass. */
function classifyHttpError(status: number, errText: string, headers?: Headers): LlmProviderError {
  if (status === 429) {
    const retryAfterRaw = headers?.get("retry-after");
    const retryAfterMs = retryAfterRaw ? parseFloat(retryAfterRaw) * 1000 : undefined;
    const remaining = headers?.get("x-ratelimit-remaining-tokens-minute");
    const detail = remaining ? `${errText} (remaining: ${remaining})` : errText;
    return new LlmRateLimitError(`Rate limited (429): ${detail}`, retryAfterMs);
  }
  if (status === 401 || status === 403) {
    return new LlmAuthError(`Authentication failed (${status}): ${errText}`);
  }
  if (status === 413) {
    return new LlmContentTooLargeError(`Request too large (413): ${errText}`);
  }
  if (status >= 500 || status === 408) {
    return new LlmServerError(`Server error (${status}): ${errText}`, status);
  }
  return new LlmProviderError(`API error (${status}): ${errText}`);
}

/** Returns true if the error is worth retrying (transient/network/rate-limit). */
function isRetryable(error: unknown): boolean {
  if (error instanceof LlmRateLimitError) return true;
  if (error instanceof LlmServerError) return true;
  if (error instanceof TypeError) return true; // fetch network failure
  return false;
}

/** Sleep with optional jitter to stagger retry bursts. */
function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

/** Compute the retry delay from a RateLimitError's retryAfterMs or exponential backoff. */
function retryDelay(error: unknown, attempt: number): number {
  if (error instanceof LlmRateLimitError && error.retryAfterMs) return error.retryAfterMs;
  const base = Math.min(1000 * 2 ** attempt, 4000);
  return base + Math.random() * 500; // jitter
}

// ── Provider factory ─────────────────────────────────────────────────────────

export function createOpenAiCompatibleProvider(config: OpenAiCompatibleConfig): LlmProvider {
  const baseURL = (config.baseURL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const defaultModel = config.model || "gpt-4o";
  const apiKey = config.apiKey;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const useStreamOptions = config.sendStreamOptions !== false;

  function buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    };
    return headers;
  }

  function buildRequestBody(messages: LlmMessage[], options?: LlmOptions, stream?: boolean): unknown {
    const body: Record<string, unknown> = {
      model: options?.model ?? defaultModel,
      messages: messages.map(msg => {
        const api: OaiMessage = { role: msg.role, content: msg.content || null };
        if (msg.role === "tool" && msg.toolCallId) api.tool_call_id = msg.toolCallId;
        if (msg.toolCalls?.length) {
          api.tool_calls = msg.toolCalls.map(tc => ({
            id: tc.id, type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.args) },
          }));
        }
        return api;
      }),
      stream: stream ?? false,
    };
    if (options?.temperature != null) body.temperature = options.temperature;
    if (options?.maxOutputTokens != null) body.max_completion_tokens = options.maxOutputTokens;
    if (options?.tools?.length) {
      body.tools = options.tools.map(t => ({
        type: "function",
        function: { name: t.name, description: t.description || "", parameters: t.parameters, strict: false },
      }));
      body.parallel_tool_calls = true;
    }
    if (stream && useStreamOptions) {
      body.stream_options = { include_usage: true };
    }
    return body;
  }

  /** Merge caller's abortSignal with a timeout signal. */
  function mergeAbort(original?: AbortSignal): AbortSignal {
    if (!original) return AbortSignal.timeout(timeoutMs);
    // If the caller already provided one, chain a timeout on top.
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    return AbortSignal.any([original, timeoutSignal]);
  }

  return {
    name: config.name,

    // ── Non-streaming chat with retry ────────────────────────────────────
    async chat(messages, options?) {
      let lastError: unknown;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const body = buildRequestBody(messages, options, false);
          const signal = mergeAbort(options?.abortSignal);
          if (options?.abortSignal?.aborted) throw new LlmProviderError("Request aborted before send");

          const res = await fetch(`${baseURL}/chat/completions`, {
            method: "POST", headers: buildHeaders(), body: JSON.stringify(body), signal,
          });

          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            const err = classifyHttpError(res.status, errText || res.statusText, res.headers);
            if (isRetryable(err) && attempt < MAX_RETRIES) {
              lastError = err;
              await delay(retryDelay(err, attempt));
              continue;
            }
            throw err;
          }

          const data = (await res.json()) as OaiChatResponse;
          const choice = data.choices?.[0];
          if (!choice) throw new LlmProviderError("No completion choice returned");

          const usage = data.usage ? {
            inputTokens: typeof data.usage.prompt_tokens === "number" ? data.usage.prompt_tokens : undefined,
            outputTokens: typeof data.usage.completion_tokens === "number" ? data.usage.completion_tokens : undefined,
            totalTokens: typeof data.usage.total_tokens === "number" ? data.usage.total_tokens : undefined,
          } : undefined;

          return {
            ok: true,
            content: choice.message?.content ?? "",
            toolCalls: choice.message?.tool_calls?.length
              ? choice.message.tool_calls.map(tc => {
                  let args: Record<string, unknown>;
                  try { args = JSON.parse(tc.function.arguments) as Record<string, unknown>; } catch { args = {}; }
                  return { id: tc.id, name: tc.function.name, args };
                })
              : undefined,
            usage: usage && Object.keys(usage).length ? usage : undefined,
          } satisfies LlmResult;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return { ok: false, error: new LlmProviderError("Request aborted") };
          }
          if (error instanceof LlmProviderError && !isRetryable(error)) throw error;
          if (isRetryable(error) && attempt < MAX_RETRIES) {
            lastError = error;
            await delay(retryDelay(error, attempt));
            continue;
          }
          lastError = error;
          break;
        }
      }
      return { ok: false, error: lastError instanceof LlmProviderError ? lastError : new LlmProviderError("Chat failed after retries", lastError) };
    },

    // ── Streaming chat with retry on connect ─────────────────────────────
    async *streamChat(messages, options?) {
      let hasToolCalls = false;
      const accumulated = new Map<number, { id: string; name: string; args: string }>();

      const accumulateToolCalls = (delta: OaiDelta | undefined) => {
        if (!delta?.tool_calls) return;
        hasToolCalls = true;
        for (const tc of delta.tool_calls) {
          const existing = accumulated.get(tc.index) ?? { id: tc.id ?? `call_${tc.index}`, name: "", args: "" };
          accumulated.set(tc.index, existing);
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name += tc.function.name;
          if (tc.function?.arguments) existing.args += tc.function.arguments;
        }
      };

      let res: Response | null = null;
      let lastError: unknown;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (options?.abortSignal?.aborted) throw new LlmProviderError("Request aborted before send");
          const body = buildRequestBody(messages, options, true);
          const signal = mergeAbort(options?.abortSignal);

          res = await fetch(`${baseURL}/chat/completions`, {
            method: "POST", headers: buildHeaders(), body: JSON.stringify(body), signal,
          });

          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            const err = classifyHttpError(res.status, errText || res.statusText, res.headers);
            if (isRetryable(err) && attempt < MAX_RETRIES) {
              lastError = err;
              await delay(retryDelay(err, attempt));
              res = null;
              continue;
            }
            throw err;
          }
          break; // connection succeeded — exit retry loop
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            yield { ok: false, error: new LlmProviderError("Stream aborted") } satisfies LlmChunk;
            return;
          }
          if (error instanceof LlmProviderError && !isRetryable(error)) {
            yield { ok: false, error } satisfies LlmChunk;
            return;
          }
          if (isRetryable(error) && attempt < MAX_RETRIES) {
            lastError = error;
            await delay(retryDelay(error, attempt));
            continue;
          }
          yield { ok: false, error: error instanceof LlmProviderError ? error : new LlmProviderError("Stream connection failed", error) } satisfies LlmChunk;
          return;
        }
      }

      if (!res || !res.body) {
        yield { ok: false, error: new LlmProviderError("No response body") } satisfies LlmChunk;
        return;
      }

      let finishReason: string | null = null;
      let finalUsage: OaiUsage | undefined;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (!payload || payload === "[DONE]") continue;
            let chunk: OaiStreamChunk;
            try { chunk = JSON.parse(payload) as OaiStreamChunk; } catch { continue; }
            const choice = chunk.choices?.[0];
            finishReason = choice?.finish_reason ?? finishReason;
            if (chunk.usage) finalUsage = chunk.usage as OaiUsage;
            if (choice?.delta?.content) yield { ok: true, type: "text", text: choice.delta.content } satisfies LlmChunk;
            accumulateToolCalls(choice?.delta);
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          yield { ok: false, error: new LlmProviderError("Stream aborted mid-read") } satisfies LlmChunk;
          return;
        }
        yield { ok: false, error: new LlmServerError("Stream read failed", undefined, error) } satisfies LlmChunk;
        return;
      } finally {
        reader.releaseLock();
      }

      // Flush trailing partial SSE line.
      if (buf.startsWith("data: ")) {
        const payload = buf.slice(6).trim();
        if (payload && payload !== "[DONE]") {
          try {
            const trailing = JSON.parse(payload) as OaiStreamChunk;
            accumulateToolCalls(trailing.choices?.[0]?.delta);
            if (trailing.usage) finalUsage = trailing.usage as OaiUsage;
          } catch { /* malformed */ }
        }
      }

      const usage = finalUsage ? {
        inputTokens: typeof finalUsage.prompt_tokens === "number" ? finalUsage.prompt_tokens : undefined,
        outputTokens: typeof finalUsage.completion_tokens === "number" ? finalUsage.completion_tokens : undefined,
        totalTokens: typeof finalUsage.total_tokens === "number" ? finalUsage.total_tokens : undefined,
      } : undefined;

      if (!hasToolCalls && finishReason !== "tool_calls") {
        yield { ok: true, type: "done", usage: usage && Object.keys(usage).length ? usage : undefined } satisfies LlmChunk;
        return;
      }
      if (!hasToolCalls) {
        yield { ok: false, error: new LlmProviderError("Model indicated tool calls but sent none") } satisfies LlmChunk;
        return;
      }
      for (const [, tc] of accumulated) {
        let args: Record<string, unknown>;
        try { args = JSON.parse(tc.args) as Record<string, unknown>; } catch { args = {}; }
        yield { ok: true, type: "tool-call", toolCall: { id: tc.id, name: tc.name, args } } satisfies LlmChunk;
      }
      yield { ok: true, type: "done", usage: usage && Object.keys(usage).length ? usage : undefined } satisfies LlmChunk;
    },
  };
}
