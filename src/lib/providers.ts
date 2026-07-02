// LLM provider registry. Shared by client (labels/models/baseURLs for the
// Settings UI) and server (looks up env[envKey] to get the secret). This file
// contains NO secret values -- only the env var *names* and non-secret config.
//
// Provider/model are runtime-selectable from Settings (persisted in the profile)
// -- they are not environment variables. Only the API keys are env secrets.

export type ProviderId = "opencode_zen" | "cerebras" | "gemini";

export interface ProviderCapabilities {
  toolCalling: boolean;
  streaming: boolean;
  imageInput: boolean;
}

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  /** OpenAI-compatible base URL (not secret). */
  baseURL: string;
  /** Name of the env var that holds this provider's API key (server reads it). */
  envKey: string;
  defaultModel: string;
  models: string[];
  capabilities: ProviderCapabilities;
}

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  opencode_zen: {
    id: "opencode_zen",
    label: "Opencode Zen",
    baseURL: "https://opencode.ai/zen/v1",
    envKey: "OPENCODE_ZEN_API_KEY",
    defaultModel: "deepseek-v4-flash-free",
    models: ["deepseek-v4-flash-free"],
    capabilities: { toolCalling: true, streaming: true, imageInput: true },
  },
  cerebras: {
    id: "cerebras",
    label: "Cerebras",
    baseURL: "https://api.cerebras.ai/v1",
    envKey: "CEREBRAS_API_KEY",
    defaultModel: "gemma-4-31b",
    models: ["gemma-4-31b"],
    capabilities: { toolCalling: true, streaming: true, imageInput: true },
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    envKey: "GEMINI_API_KEY",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-3-flash-preview"],
    capabilities: { toolCalling: true, streaming: true, imageInput: true },
  },
};

export const PROVIDER_LIST = Object.values(PROVIDERS);

/** Provider config plus whether its key is configured (resolved server-side).
 *  The type lives here (shared) so the client can type the layout data without
 *  importing the server-only factory. */
export interface ResolvedProvider extends ProviderConfig {
  configured: boolean;
}

/** Kapruka MCP endpoint -- a public URL, not a secret, so it lives in code. */
export const KAPRUKA_MCP_URL = "https://mcp.kapruka.com/mcp";
