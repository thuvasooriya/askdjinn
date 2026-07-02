import type { LlmError } from "./errors";

/** Role for provider-agnostic chat messages. */
export type LlmRole = "system" | "user" | "assistant" | "tool";

/** Tool call requested by an assistant message. */
export interface LlmToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** Framework-agnostic chat message. */
export interface LlmMessage {
  role: LlmRole;
  content: string;
  images?: { base64: string; mimeType: string }[];
  toolCallId?: string;
  toolCalls?: LlmToolCall[];
}

/** Framework-agnostic tool definition using JSON Schema parameters.
 *  `execute` is optional: when omitted the tool is a "client tool" -- the model
 *  emits the call and the caller (client) executes it. */
export interface LlmTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute?: (args: Record<string, unknown>) => Promise<unknown>;
}

/** Options shared by LLM providers. */
export interface LlmOptions {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  tools?: LlmTool[];
  metadata?: Record<string, unknown>;
  /** Optional abort signal to cancel an in-flight request (e.g. on timeout). */
  abortSignal?: AbortSignal;
}

/** Full LLM response result. */
export type LlmResult =
  | { ok: true; content: string; toolCalls?: LlmToolCall[]; usage?: LlmUsage }
  | { ok: false; error: LlmError };

/** Streaming LLM chunk result. */
export type LlmChunk =
  | { ok: true; type: "text"; text: string }
  | { ok: true; type: "tool-call"; toolCall: LlmToolCall }
  | { ok: true; type: "tool-result"; toolName: string; toolCallId?: string; result: unknown }
  | { ok: true; type: "done"; usage?: LlmUsage; toolLoops?: number }
  | { ok: false; error: LlmError };

/** Token usage metadata when available from a provider. */
export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/** Framework-agnostic LLM provider contract. */
export interface LlmProvider {
  name: string;
  chat(messages: LlmMessage[], options?: LlmOptions): Promise<LlmResult>;
  streamChat(messages: LlmMessage[], options?: LlmOptions): AsyncIterable<LlmChunk>;
}
