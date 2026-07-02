/**
 * Unified conversation store.
 *
 * Replaces the scattered message state that was split between
 * agent.messages (text mode) and liveVoice.transcripts (voice mode).
 *
 * Both text-mode LLM and live-mode WebSocket read from and write to
 * the same turns[] array, enabling seamless mode switching with
 * full context preservation.
 */

import type { Product } from "$lib/shopping-engine";
import * as persist from "$lib/stores/persistence";

export type TurnPart =
  | { type: "text"; text: string }
  | { type: "image"; base64: string; mimeType: string }
  | { type: "product-results"; products: Product[] }
  | { type: "tool-call"; id: string; name: string; status: "pending" | "done" | "error"; label?: string; summary?: string; detail?: string }
  | { type: "delivery-info"; city: string; date?: string; available: boolean; rate?: number };

export type TurnSource = "text" | "voice";

export type Turn = {
  id: string;
  role: "user" | "assistant";
  parts: TurnPart[];
  timestamp: number;
  source: TurnSource;
  streaming?: boolean;
};

export type ConversationMode = "text" | "voice";

const STORE_ID = "conversation";
const VERSION = 1;

function load(): Turn[] {
  const turns = persist.load<Turn[]>(STORE_ID, VERSION, []);
  // Clear any stuck streaming flags from interrupted sessions (e.g. page refresh mid-stream)
  // and enforce the same cap as saveData so in-memory state stays bounded.
  return turns.slice(-80).map(t => t.streaming ? { ...t, streaming: false } : t);
}

function saveData(turns: Turn[]) {
  persist.save(STORE_ID, VERSION, turns.slice(-80));
}

class ConversationStore {
  turns = $state<Turn[]>(load());
  activeMode = $state<ConversationMode>("text");
  pendingImage = $state<{ base64: string; mimeType: string } | null>(null);

  private save() { saveData(this.turns); }

  // ── Queries ───────────────────────────────────────

  get isEmpty() { return this.turns.length === 0; }

  get lastTurn() { return this.turns.at(-1) ?? null; }

  get isStreaming() { return this.turns.some(t => t.streaming); }

  getText(turn: Turn): string {
    return turn.parts
      .filter(p => p.type === "text")
      .map(p => (p as { text: string }).text)
      .join("");
  }

  /** Serialize turns for text-mode API (role -> content + images).
   *  Drops turns with no usable content (empty voice turns, tool-only turns
   *  with no text) to avoid sending { content: "" } which most LLM providers
   *  reject with a 400. Assistant turns that have tool-call activity but no
   *  text get a minimal placeholder so the conversation flow stays coherent. */
  toApiMessages(): Array<{ role: "user" | "assistant"; content: string; images?: { base64: string; mimeType: string }[] }> {
    return this.turns
      .map(t => {
        const text = this.getText(t);
        const imageParts = t.parts.filter(p => p.type === "image") as { type: "image"; base64: string; mimeType: string }[];
        const hasToolCalls = t.parts.some(p => p.type === "tool-call");
        const content = text || (imageParts.length ? "[shared an image]" : hasToolCalls ? "[took an action]" : "");
        if (!content) return null;
        return {
          role: t.role,
          content,
          ...(imageParts.length ? { images: imageParts.map(p => ({ base64: p.base64, mimeType: p.mimeType })) } : {}),
        };
      })
      .filter((m): m is { role: "user" | "assistant"; content: string; images?: { base64: string; mimeType: string }[] } => m !== null);
  }

  /** Serialize turns for live-mode system instruction context */
  toContextString(): string {
    if (this.turns.length === 0) return "";
    const lines = this.turns.map(t => {
      const speaker = t.role === "user" ? "User" : "Assistant";
      const text = this.getText(t);
      return text ? `${speaker}: ${text}` : null;
    }).filter(Boolean);
    return lines.length ? `\n\nCONVERSATION HISTORY (continue naturally):\n${lines.join("\n")}` : "";
  }

  // ── Mutations ─────────────────────────────────────

  addTurn(role: Turn["role"], source: TurnSource = "text"): string {
    const id = crypto.randomUUID();
    const turn: Turn = { id, role, parts: [], timestamp: Date.now(), source, streaming: true };
    this.turns = [...this.turns, turn];
    this.save();
    return id;
  }

  appendText(turnId: string, text: string) {
    this.turns = this.turns.map(t => {
      if (t.id !== turnId) return t;
      const lastPart = t.parts.at(-1);
      if (lastPart?.type === "text") {
        return { ...t, parts: [...t.parts.slice(0, -1), { type: "text", text: lastPart.text + text }] };
      }
      return { ...t, parts: [...t.parts, { type: "text", text }] };
    });
  }

  setText(turnId: string, text: string) {
    this.turns = this.turns.map(t => {
      if (t.id !== turnId) return t;
      const nonTextParts = t.parts.filter(p => p.type !== "text");
      return { ...t, parts: text ? [...nonTextParts, { type: "text", text }] : nonTextParts };
    });
  }
  addPart(turnId: string, part: TurnPart) {
    this.turns = this.turns.map(t =>
      t.id === turnId ? { ...t, parts: [...t.parts, part] } : t
    );
  }
  finishTurn(turnId: string) {
    // Drop turns that ended up with no content at all (empty voice transcript,
    // interrupted before any output). Keeping them pollutes history and breaks
    // LLM providers that reject { content: "" }.
    const turn = this.turns.find(t => t.id === turnId);
    if (turn && turn.parts.length === 0) {
      this.turns = this.turns.filter(t => t.id !== turnId);
    } else {
      this.turns = this.turns.map(t =>
        t.id === turnId ? { ...t, streaming: false } : t
      );
    }
    this.save();
  }


  setToolCallStatus(turnId: string, toolCallId: string, status: "pending" | "done" | "error") {
    this.turns = this.turns.map(t => {
      if (t.id !== turnId) return t;
      let found = false;
      return {
        ...t,
        parts: t.parts.map(p => {
          if (!found && p.type === "tool-call" && p.id === toolCallId && p.status !== status) {
            found = true;
            return { ...p, status };
          }
          return p;
        }),
      };
    });
  }

  /** Complete a tool call: set its final status and attach a human-readable
   *  summary (and optional detail) describing what it did. Used by both text
   *  and live modes so the debug panel shows the same rich info either way. */
  completeToolCall(turnId: string, toolCallId: string, status: "done" | "error", summary?: string, detail?: string) {
    this.turns = this.turns.map(t => {
      if (t.id !== turnId) return t;
      let found = false;
      return {
        ...t,
        parts: t.parts.map(p => {
          if (!found && p.type === "tool-call" && p.id === toolCallId) {
            found = true;
            return { ...p, status, summary, detail };
          }
          return p;
        }),
      };
    });
  }

  /** Mark all pending tool-call parts on a turn as a given status. Used when stream ends. */
  finalizePendingToolCalls(turnId: string, status: "done" | "error") {
    this.turns = this.turns.map(t => {
      if (t.id !== turnId) return t;
      return {
        ...t,
        parts: t.parts.map(p =>
          p.type === "tool-call" && p.status === "pending" ? { ...p, status } : p
        ),
      };
    });
  }

  clearAll() {
    this.turns = [];
    this.save();
  }

  setMessages(turns: Turn[]) {
    this.turns = turns;
    this.save();
  }

  setMode(mode: ConversationMode) {
    this.activeMode = mode;
  }

  setPendingImage(base64: string, mimeType: string) {
    this.pendingImage = { base64, mimeType };
  }

  clearPendingImage() {
    this.pendingImage = null;
  }
}

const instance = new ConversationStore();
export function useConversation() { return instance; }
