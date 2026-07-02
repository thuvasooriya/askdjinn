import type { Product } from "$lib/shopping-engine";

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  products?: Product[];
  loading?: boolean;
  toolCallText?: string;
};

export type WireMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  images?: { base64: string; mimeType: string }[];
};
