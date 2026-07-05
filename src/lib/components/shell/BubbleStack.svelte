<script lang="ts">
  // Manages the stack of bubbles that emanate above the status pill.
  //
  // - Segments come from the single bubble-feed adapter (current assistant turn).
  // - Only registered tools + text segments emit bubbles; unregistered tools
  //   stay in the status pill (session-phase).
  // - Each bubble's collapse ring (BubbleFrame) IS its timer -- when the ring
  //   animation ends, onTimeout fires and dismisses the bubble. Pausing the ring
  //   (streaming / hover) pauses the effective timeout. No JS timers needed.
  // - Stack is capped at MAX_BUBBLES; oldest evictable bubbles are dropped first.
  // - Dismissal: click outside all [data-bubble-preserve] elements or Escape.

  import { useConversation } from "$lib/stores/conversation.svelte";
  import { useSessionPhase } from "$lib/stores/session-phase.svelte";
  import { useUI } from "$lib/stores/ui.svelte";
  import { turnToSegments, filterVoiceTranscript, type Segment } from "$lib/stores/bubble-feed";
  import { getToolBubbleRender, type ToolBubbleOptions } from "$lib/stores/tool-render-registry";
  import TextBubble from "./TextBubble.svelte";
  import Bubble from "./Bubble.svelte";
  import { scale } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { browser } from "$app/environment";

  const MAX_BUBBLES = 5;
  const TEXT_TIMEOUT = 15_000;

  let { pillClicks = 0 }: { pillClicks?: number } = $props();

  const conv = useConversation();
  const sessionPhase = useSessionPhase();
  const ui = useUI();

  // Locally dismissed ids: spinner-completed, evicted, or user-dismissed.
  // dismissedOrder tracks the sequence so showLastDismissed can re-surface
  // the most recently hidden bubble when the user taps the status pill.
  let dismissed = $state<Set<string>>(new Set());
  let dismissedOrder: string[] = [];

  function dismiss(id: string) {
    if (dismissed.has(id)) return;
    dismissed = new Set([...dismissed, id]);
    dismissedOrder.push(id);
  }

  function dismissMany(ids: string[]) {
    const fresh = ids.filter(id => !dismissed.has(id));
    if (fresh.length === 0) return;
    dismissed = new Set([...dismissed, ...fresh]);
    dismissedOrder.push(...fresh);
  }

  function showLastDismissed() {
    if (dismissedOrder.length === 0) return;
    const last = dismissedOrder.pop()!;
    const next = new Set(dismissed);
    next.delete(last);
    dismissed = next;
  }

  // Fresh stack on turn change.
  let lastTurnId = $state<string | null>(null);
  $effect(() => {
    const id = conv.lastTurn?.id ?? null;
    if (id !== lastTurnId) {
      dismissed = new Set();
      dismissedOrder = [];
      lastTurnId = id;
    }
  });

  // Segments from the current turn. Voice mode defaults to tool-only unless the
  // user enables the transcript toggle; text mode always shows everything.
  const segments = $derived(
    filterVoiceTranscript(turnToSegments(conv.lastTurn), !sessionPhase.isVoice || ui.voiceTranscript),
  );

  interface ActiveBubble {
    segment: Segment;
    options: ToolBubbleOptions;
  }

  // Eligible: dismissed-filtered segments that have visible content.
  const eligible = $derived.by((): ActiveBubble[] => {
    const result: ActiveBubble[] = [];
    for (const seg of segments) {
      if (dismissed.has(seg.id)) continue;
      if (seg.kind === "text") {
        if (!seg.text) continue;
        result.push({ segment: seg, options: { timeout: TEXT_TIMEOUT, evictable: true } });
      } else {
        const render = getToolBubbleRender(seg.part.name);
        if (!render) continue;
        if (seg.part.status !== "done") continue;
        if (!render.extract(seg.part)) continue;
        result.push({ segment: seg, options: render.options });
      }
    }
    return result;
  });

  // Active: eligible after eviction. Pure computation; a follow-up effect
  // persists evicted ids so they don't reappear if pressure later drops.
  const active = $derived.by((): ActiveBubble[] => {
    if (eligible.length <= MAX_BUBBLES) return eligible;
    const evict = new Set<string>();
    let remaining = eligible.length;
    for (const b of eligible) {
      if (remaining <= MAX_BUBBLES) break;
      if (b.options.evictable) {
        evict.add(b.segment.id);
        remaining--;
      }
    }
    return eligible.filter(b => !evict.has(b.segment.id));
  });

  // Persist evictions permanently.
  $effect(() => {
    const activeIds = new Set(active.map(b => b.segment.id));
    const newlyEvicted = eligible
      .filter(b => !activeIds.has(b.segment.id) && !dismissed.has(b.segment.id))
      .map(b => b.segment.id);
    if (newlyEvicted.length > 0) {
      dismissMany(newlyEvicted);
    }
  });

  // Dismissal: click outside preserved elements or Escape key.
  function dismissAllTimed() {
    const ids = active.filter(b => b.options.timeout !== "manual").map(b => b.segment.id);
    if (ids.length === 0) return;
    dismissMany(ids);
  }

  $effect(() => {
    if (!browser) return;
    function onClick(e: MouseEvent) {
      const path = e.composedPath();
      const preserved = path.some(
        (el): el is HTMLElement =>
          el instanceof HTMLElement && el.dataset.bubblePreserve !== undefined,
      );
      if (!preserved) dismissAllTimed();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismissAllTimed();
    }
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  });

  // Status pill click: re-surface the most recently dismissed bubble.
  $effect(() => {
    if (pillClicks > 0) showLastDismissed();
  });
</script>

{#each active as b (b.segment.id)}
  <div
    animate:flip={{ duration: 200 }}
    in:scale={{ start: 0.85, duration: 300, opacity: 0 }}
    out:scale={{ start: 0.9, duration: 200, opacity: 0 }}
    style="transform-origin: bottom center;"
  >
    {#if b.segment.kind === "text"}
      <TextBubble segment={b.segment} onTimeout={() => dismiss(b.segment.id)} />
    {:else}
      <Bubble segment={b.segment} onTimeout={() => dismiss(b.segment.id)} />
    {/if}
  </div>
{/each}
