// Single source of truth for "what is the agent doing right now".
//
// Both text-mode (chat.isStreaming + agentStatus + conv.lastTurn) and
// voice-mode (liveVoice.state) inputs are merged into one phase view.
// FloatingResponse, AgentBar, and the orb all consume this -- killing the
// dual-derivation drift where each component re-derived the same state from
// the same inputs with slightly different logic.

import { useChat } from "./chat.svelte";
import { useConversation } from "./conversation.svelte";
import { useLiveVoice } from "./live-voice.svelte";
import { useAgentStatus } from "./agent-status.svelte";
import type { SpinnerName } from "$lib/ui/spinners";

export type SessionPhase =
  | "idle"
  // Text mode: turn started, no content yet.
  | "thinking"
  // Text mode: assistant text actively streaming.
  | "text-streaming"
  // Text or voice mode: one or more tool calls in flight.
  | "tool-running"
  // Voice mode: WebSocket connecting.
  | "connecting"
  // Voice mode: mic open, user speaking.
  | "listening"
  // Voice mode: model audio playing.
  | "speaking"
  // Voice mode: connection lost.
  | "error";

export interface SessionPhaseView {
  readonly phase: SessionPhase;
  readonly label: string | null;
  readonly spinner: SpinnerName | null;
  readonly isVoice: boolean;
  readonly isActive: boolean;
  readonly hasPendingToolCall: boolean;
}

function createSessionPhase() {
  const chat = useChat();
  const conv = useConversation();
  const liveVoice = useLiveVoice();
  const agentStatus = useAgentStatus();

  // Merges both sources. Voice tool calls arrive in liveVoice.log; text-mode
  // tool calls arrive as TurnPart on the last turn. One value, both feeds.
  const hasPendingToolCall = $derived(
    liveVoice.log.some((e) => e.type === "tool-call" && e.status === "pending")
    || (conv.lastTurn?.parts.some((p) => p.type === "tool-call" && p.status === "pending") ?? false),
  );

  const isVoice = $derived(liveVoice.state !== "idle" && liveVoice.state !== "error");

  const view = $derived.by((): SessionPhaseView => {
    const liveState = liveVoice.state;
    const pending = hasPendingToolCall;

    // Voice error -- highest priority, surfaces even mid-text-turn.
    if (liveState === "error") {
      return { phase: "error", label: "Connection lost", spinner: null, isVoice: true, isActive: true, hasPendingToolCall: pending };
    }

    // Voice modes.
    if (liveState === "connecting" || liveState === "connected") {
      return { phase: "connecting", label: "Connecting", spinner: "helix", isVoice: true, isActive: true, hasPendingToolCall: pending };
    }
    if (liveState === "listening") {
      return { phase: "listening", label: "Listening", spinner: "dna", isVoice: true, isActive: true, hasPendingToolCall: pending };
    }
    if (liveState === "speaking") {
      return { phase: "speaking", label: "Speaking", spinner: "pulse", isVoice: true, isActive: true, hasPendingToolCall: pending };
    }

    // Text modes.
    if (chat.isStreaming) {
      // agentStatus wins when set (e.g. "searching products"), else a bare
      // pending tool call falls back to the generic searching label.
      if (agentStatus.isActive) {
        return { phase: "tool-running", label: agentStatus.status.label, spinner: "rain", isVoice: false, isActive: true, hasPendingToolCall: pending };
      }
      if (pending) {
        return { phase: "tool-running", label: "Searching Kapruka", spinner: "rain", isVoice: false, isActive: true, hasPendingToolCall: pending };
      }
      const hasText = conv.lastTurn?.parts.some((p) => p.type === "text" && p.text) ?? false;
      if (hasText) {
        // Same label as 'thinking' for now -- Phase 2 (TextBubble) refines this.
        return { phase: "text-streaming", label: "Thinking", spinner: "cascade", isVoice: false, isActive: true, hasPendingToolCall: pending };
      }
      return { phase: "thinking", label: "Thinking", spinner: "cascade", isVoice: false, isActive: true, hasPendingToolCall: pending };
    }

    return { phase: "idle", label: null, spinner: null, isVoice: false, isActive: false, hasPendingToolCall: pending };
  });

  return {
    get phase() { return view.phase; },
    get label() { return view.label; },
    get spinner() { return view.spinner; },
    get isVoice() { return view.isVoice; },
    get isActive() { return view.isActive; },
    get hasPendingToolCall() { return view.hasPendingToolCall; },
    /** Full snapshot for consumers that need multiple fields co-invalidated. */
    get view() { return view; },
  };
}

const instance = createSessionPhase();
export function useSessionPhase() { return instance; }
