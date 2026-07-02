import type { Turn } from "$lib/stores/conversation.svelte";

type StoredMessage = { id: string; role: string; text: string };

export function sessionMessagesToTurns(msgs: StoredMessage[]): Turn[] {
  return msgs
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      parts: [{ type: "text" as const, text: m.text }],
      timestamp: Date.now(),
      source: "text" as const,
    }));
}
