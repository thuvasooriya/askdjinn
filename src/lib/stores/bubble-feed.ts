// Pure adapters that normalize the current turn's parts into ordered segments.
//
// Both text-mode and voice-mode tool calls land in conv.turns as TurnParts, so
// one adapter covers both modes. The consumer (BubbleStack) decides whether to
// show voice transcript text segments via the transcript flag.
//
// Keeping these pure (no $state/$derived) makes them trivially testable and
// lets the consumer own reactivity.

import type { Turn } from "$lib/stores/conversation.svelte";
import type { ToolCallPart } from "$lib/delivery/delivery-render";

export interface TextSegment {
  id: string;
  kind: "text";
  text: string;
  streaming: boolean;
  bornAt: number;
}

export interface ToolSegment {
  id: string;
  kind: "tool";
  part: ToolCallPart;
  bornAt: number;
}

export type Segment = TextSegment | ToolSegment;

/** Split a turn's parts into ordered segments: contiguous text parts merged
 *  into one text segment, each tool-call its own segment. Returns [] for
 *  non-assistant or null turns (the stack only shows the assistant's work). */
export function turnToSegments(turn: Turn | null): Segment[] {
  if (!turn || turn.role !== "assistant") return [];
  const segments: Segment[] = [];
  let textBuffer = "";

  const flushText = () => {
    if (!textBuffer) return;
    segments.push({
      id: `${turn.id}-text-${segments.length}`,
      kind: "text",
      text: textBuffer,
      streaming: turn.streaming ?? false,
      bornAt: turn.timestamp,
    });
    textBuffer = "";
  };

  for (const part of turn.parts) {
    if (part.type === "text" && part.text) {
      textBuffer += part.text;
    } else if (part.type === "tool-call") {
      flushText();
      segments.push({ id: part.id, kind: "tool", part, bornAt: turn.timestamp });
    }
  }
  flushText();
  return segments;
}

/** Filter voice-mode transcript text segments out when the transcript toggle
 *  is off. Tool segments always pass through. */
export function filterVoiceTranscript(segments: Segment[], show: boolean): Segment[] {
  if (show) return segments;
  return segments.filter(s => s.kind === "tool");
}
