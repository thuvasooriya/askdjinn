<script lang="ts">
  // Floating response orchestrator. Renders the StatusPill anchor + the
  // BubbleStack that emanates above it. All phase/spinner/render logic lives in
  // dedicated components and stores -- this file is just layout + visibility.

  import { useConversation } from "$lib/stores/conversation.svelte";
  import { useUI } from "$lib/stores/ui.svelte";
  import { useSessionPhase } from "$lib/stores/session-phase.svelte";
  import { browser } from "$app/environment";
  import { fly } from "svelte/transition";
  import StatusPill from "./StatusPill.svelte";
  import BubbleStack from "./BubbleStack.svelte";

  const conv = useConversation();
  const ui = useUI();
  const sessionPhase = useSessionPhase();

  const reducedMotion = $derived(
    browser && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  // Captured at mount: the last turn id from a prior session. The floating area
  // only surfaces turns produced in THIS session (plus active processing), so a
  // page reload never resurrects a stale agent-name pill.
  const initialLastTurnId = conv.lastTurn?.id ?? null;
  const lastTurnId = $derived(conv.lastTurn?.id ?? null);
  const hasNewTurns = $derived(lastTurnId !== null && lastTurnId !== initialLastTurnId);

  const containerVisible = $derived(
    !ui.conversationVisible && !ui.askUser && (hasNewTurns || sessionPhase.isActive),
  );

  // Clicking the status pill re-surfaces the most recently dismissed bubble.
  // Opening the full chat panel is via the Dock's Chat button.
  let pillClicks = $state(0);
</script>

{#if containerVisible}
  <div class="floating-bubble-container" transition:fly={{ y: 20, duration: reducedMotion ? 0 : 250 }}>
    <BubbleStack {pillClicks} />
    <StatusPill onclick={() => pillClicks++} />
  </div>
{/if}

<style>
  .floating-bubble-container {
    position: fixed;
    bottom: 6.5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1001;
    width: min(440px, calc(100vw - 2rem));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    pointer-events: auto;
  }
</style>
