// Server-only LLM provider factory. The provider+model are chosen at runtime
// (per /api/chat request, from the client's Settings selection); the server
// holds the secret keys and routes to the selected provider's endpoint.

import { env } from "$env/dynamic/private";
import { createOpenAiCompatibleProvider } from "$lib/llm-engine/openai-compatible";
import { PROVIDERS, type ProviderConfig, type ProviderId, type ResolvedProvider } from "$lib/providers";
import type { LlmProvider } from "$lib/llm-engine";

type Env = Record<string, string | undefined>;

export function getConfiguredProviders(): ResolvedProvider[] {
  const e = env as Env;
  return Object.values(PROVIDERS).map(p => ({ ...p, configured: Boolean(e[p.envKey]) }));
}

/** Resolve a configured LLM provider + model for a chat request.
 *  Throws if the key is missing — callers should catch and return a clean error. */
export function getLlmProvider(id: ProviderId, model?: string): LlmProvider {
  const cfg = PROVIDERS[id];
  if (!cfg) throw new Error(`Unknown provider: ${id}`);
  const apiKey = (env as Env)[cfg.envKey];
  if (!apiKey) throw new Error(`${cfg.label} API key not configured`);
  return createOpenAiCompatibleProvider({
    name: cfg.id,
    apiKey,
    baseURL: cfg.baseURL,
    model: model ?? cfg.defaultModel,
  });
}


/** Live voice (Gemini Live WebSocket) is available iff the Gemini key is set. */
export function hasLiveVoice(): boolean {
  return Boolean((env as Env).GEMINI_API_KEY);
}
