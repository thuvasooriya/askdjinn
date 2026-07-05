<script lang="ts">
  // Conversation transcript. Glass-style chat bubbles inspired by chat-ui.
  // Auto-hides in live mode -- parent shows a live status overlay instead.

  import { useConversation, type Turn, type TurnPart } from "$lib/stores/conversation.svelte";
  import { useProfile } from "$lib/stores/profile.svelte";
  import { useAgentStatus } from "$lib/stores/agent-status.svelte";
  import { useLiveVoice } from "$lib/stores/live-voice.svelte";
  import { renderMarkdown } from "$lib/markdown";
  import BrailleSpinner from "$lib/ui/BrailleSpinner.svelte";
  import { formatMoney } from "$lib/money";
  import { fly, fade } from "svelte/transition";
  import AgentOrb from "./AgentOrb.svelte";

  import { useChat } from "$lib/stores/chat.svelte";
  import { Copy, Brain } from "@lucide/svelte";
  import { useUI } from "$lib/stores/ui.svelte";
  import { toasts } from "$lib/ui/toast";
  import ChatComposer from "./shell/ChatComposer.svelte";
  import { exportFullDebugBundle } from "$lib/debug/app-inspector";
  import OrderConfirmationCard from "$lib/components/OrderConfirmationCard.svelte";
  import { getCreatedOrderFromToolPart } from "$lib/order/order-render";
import DeliveryCheckCard from "$lib/components/DeliveryCheckCard.svelte";
import { getDeliveryCheckFromToolPart } from "$lib/delivery/delivery-render";

  const reducedMotion = $derived(typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  let { liveActive = false }: { liveActive?: boolean } = $props();

  const chat = useChat();
  const ui = useUI();
  const conv = useConversation();
  const profile = useProfile();
  const agentStatus = useAgentStatus();
  const liveVoice = useLiveVoice();

  let scrollContainer: HTMLElement | undefined = $state();
  let selectedPart: TurnPart | undefined = $state();

  function closePopup() {
    selectedPart = undefined;
  }

  $effect(() => {
    void conv.turns.length;
    void conv.lastTurn?.parts.length;
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  });

  function getTurnText(turn: Turn | null): string {
    if (!turn) return "";
    return conv.getText(turn);
  }


  // In live mode, show only the last few messages + live transcripts
  const visibleTurns = $derived(
    liveActive ? conv.turns.slice(-4) : conv.turns
  );

  function copyConversation() {
    const lines: string[] = [];
    for (const turn of conv.turns) {
      lines.push(`${turn.role} [${turn.source}]:`);
      for (const part of turn.parts) {
        if (part.type === "text" && part.text) lines.push(`  ${part.text}`);
        else if (part.type === "tool-call") {
          const partLines: string[] = [];
          partLines.push(`  [tool:${part.name} ${part.status}]`);
          if (part.summary) partLines.push(`    ${part.summary}`);
          if (part.args) {
            const argsStr = JSON.stringify(part.args, null, 2);
            partLines.push(`    args: ${argsStr}`);
          }
          if (part.result) {
            const resultStr = JSON.stringify(part.result, null, 2);
            partLines.push(`    result: ${resultStr}`);
          }
          lines.push(partLines.join("\n"));
        }
      }
    }
    navigator.clipboard.writeText(lines.join("\n"));
    toasts.success("Copied to clipboard");
  }

  function copyInspector() {
    navigator.clipboard.writeText(exportFullDebugBundle());
    toasts.success("Inspector bundle copied");
  }
</script>
<div class="conv-tile" role="log" aria-label="Conversation">
  <!-- Compact header (only when not live) -->
  {#if !liveActive}
    <div class="conv-header">
      <AgentOrb size={22} />
      <h2 class="conv-title">{profile.agent.name}</h2>
      <span class="conv-count">{conv.turns.length}</span>
      {#if agentStatus.isActive}
        <span class="conv-status">
          <BrailleSpinner name="helix" size="sm" label={agentStatus.status.label} />
          {agentStatus.status.label}
        </span>
      {/if}
      <div class="flex-1"></div>
      <button type="button" class="collapse-btn" onclick={copyInspector} aria-label="Copy inspector bundle" title="Inspector">
        <Brain class="h-3.5 w-3.5" />
      </button>
      <button type="button" class="collapse-btn" onclick={copyConversation} aria-label="Copy conversation" title="Copy">
        <Copy class="h-3.5 w-3.5" />
      </button>
    </div>
  {/if}

  <!-- Live mode overlay bar -->
  {#if liveActive}
    <div class="live-bar">
      <AgentOrb mode="live" phase={liveVoice.state === "listening" ? "listening" : liveVoice.state === "speaking" ? "speaking" : liveVoice.state === "connecting" ? "thinking" : "idle"} audioLevel={liveVoice.audioLevel} size={28} />
      <div class="live-info">
        <span class="live-state">{liveVoice.state === "listening" ? "Listening" : liveVoice.state === "speaking" ? `${profile.agent.name} speaking` : liveVoice.state === "connecting" ? "Connecting" : "Live"}</span>
        {#if liveVoice.inputTranscript}<span class="live-transcript">{liveVoice.inputTranscript}</span>{/if}
      </div>
    </div>
  {/if}

  <!-- Messages -->
  <div bind:this={scrollContainer} class="conv-scroll">
    {#each visibleTurns as turn (turn.id)}
      {#if turn.role === "user"}
        <div class="msg-row msg-row--user" in:fly={{ y: 8, duration: reducedMotion ? 0 : 200 }}>
          <div class="bubble bubble--user user-text">
            {getTurnText(turn)}
          </div>
        </div>
      {:else}
        <div class="msg-row msg-row--assistant" in:fade={{ duration: reducedMotion ? 0 : 150 }}>
          <div class="bubble bubble--assistant">
            {#each turn.parts as part, i (`${turn.id}-${i}`)}
              {#if part.type === "text" && part.text}
                <div class="bubble-text">{@html renderMarkdown(part.text)}</div>
              {:else if part.type === "tool-call"}
                {@const createdOrder = getCreatedOrderFromToolPart(part)}
                {#if createdOrder}
                  <OrderConfirmationCard order={createdOrder} />
                {:else}
                  {@const deliveryCheck = getDeliveryCheckFromToolPart(part)}
                  {#if deliveryCheck}
                    <DeliveryCheckCard city={deliveryCheck.city} rate={deliveryCheck.rate} dates={deliveryCheck.dates} />
                  {:else}
                    <div
                      class="chip chip--{part.status}"
                      role="button"
                      tabindex="0"
                      onclick={() => selectedPart = part}
                      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectedPart = part; } }}
                    >
                      {#if part.status === "pending"}<BrailleSpinner name="orbit" size="sm" label={part.summary ?? part.label ?? part.name} />{/if}
                      <span class="chip-text">{part.summary ?? part.label ?? part.name}</span>
                    </div>
                  {/if}
                {/if}
              {:else if part.type === "image"}
                <div class="message-image-container">
                  <img src="data:{part.mimeType};base64,{part.base64}" alt="Sent media" class="message-image" />
                </div>
              {/if}
            {/each}

            {#if !getTurnText(turn) && turn.streaming}
              <div class="typing-spinner"><BrailleSpinner name="breathe" label="Writing response" /></div>
            {/if}

          </div>
        </div>
      {/if}
    {/each}

    {#if conv.isEmpty && !liveActive}
      <div class="conv-empty" in:fade={{ duration: reducedMotion ? 0 : 200 }}>
        <p>Tap to type, hold the orb to speak.</p>
        <p class="conv-empty-hint">Try: "Find chocolate cakes under LKR 8000"</p>
      </div>
    {/if}
  </div>

  <!-- Tool chip detail popup -->
  {#if selectedPart?.type === "tool-call"}
    {@const toolPart = selectedPart}
    {@const argsPreview = toolPart.args ? Object.entries(toolPart.args).slice(0, 8) : []}
    <div class="popup-overlay" role="presentation" onclick={closePopup}>
       <div class="popup-glass" role="dialog" aria-modal="true" aria-label={toolPart.name} tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { if (e.key === 'Escape') closePopup(); }}>
        <div class="popup-header">
          <span class="popup-title">{toolPart.name}</span>
          <button class="popup-close" onclick={closePopup} aria-label="Close">&times;</button>
        </div>

        {#if toolPart.status === "error"}
          <div class="popup-error">
            {toolPart.summary ?? "Tool failed"}
          </div>
        {/if}

        {#if argsPreview.length > 0}
          <div class="popup-section">
            <span class="popup-section-title">Arguments</span>
            <div class="popup-args">
              {#each argsPreview as [key, val]}
                <div class="popup-args-row">
                  <span class="popup-args-key">{key}</span>
                  <span class="popup-args-val">{typeof val === "object" ? JSON.stringify(val) : String(val)}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if toolPart.result}
          <div class="popup-section">
            <span class="popup-section-title">Result</span>
            <pre class="popup-result">{JSON.stringify(toolPart.result, null, 2)}</pre>
          </div>
        {/if}
      </div>
    </div>
  {/if}
  <!-- Chat input surface (shared with AgentBar) -->
  <ChatComposer variant="panel" {liveActive} />
</div>

<style>
  .conv-tile {
    display: flex;
    flex-direction: column;
    height: 100%;
    container-type: inline-size;
  }

  .conv-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    height: var(--panel-header-h);
    padding: 0 0.875rem;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }
  .conv-title {
    font-family: var(--font-display);
    font-size: var(--fs-xl);
    line-height: 1;
    font-weight: 700;
    color: var(--color-foreground);
  }
  .conv-count {
    font-size: 0.5625rem; font-weight: 600; color: var(--color-muted-foreground);
    padding: 0.0625rem 0.3125rem; border-radius: var(--radius-sm); background: var(--color-muted);
  }
  .conv-status { margin-left: auto; display: flex; align-items: center; gap: 0.25rem; font-size: 0.5625rem; color: var(--color-muted-foreground); }

  /* Live mode overlay */
  .live-bar {
    display: flex; align-items: center; gap: 0.625rem;
    padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--color-border);
    background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
    flex-shrink: 0;
  }
  .live-info { display: flex; flex-direction: column; gap: 0.125rem; min-width: 0; }
  .live-state { font-size: var(--fs-sm); font-weight: 700; color: var(--color-primary); }
  .live-transcript { font-size: var(--fs-xs); color: var(--color-muted-foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .conv-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* Chat bubbles */
  .msg-row { display: flex; }
  .msg-row--user { justify-content: flex-end; }
  .msg-row--assistant { justify-content: flex-start; }

  .bubble {
    max-width: 80%;
    padding: 0.625rem 0.875rem;
    border-radius: var(--radius-2xl);
    font-size: var(--fs-md);
    line-height: 1.5;
    word-break: break-word;
  }
  .bubble--user {
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    border-bottom-right-radius: 0.375rem;
  }
  .bubble--assistant {
    max-width: 80%;
    background: color-mix(in srgb, var(--color-surface-elevated) 85%, transparent);
    backdrop-filter: blur(12px);
    border: 1px solid var(--color-border);
  }
  /* On narrow panels, agent bubbles fill the available width */
  @container (max-width: 420px) {
    .bubble--assistant {
      max-width: 100%;
    }
  }
  .user-text { white-space: pre-wrap; }
  .bubble-text { overflow-wrap: anywhere; }
  .bubble-text :global(p) { margin: 0 0 0.5rem; }
  .bubble-text :global(p:last-child) { margin-bottom: 0; }
  .bubble-text :global(ul) { padding-left: 1rem; margin: 0.25rem 0; }
  .bubble-text :global(li) { margin: 0.125rem 0; }
  .bubble-text :global(strong) { font-weight: 700; }
  .bubble-text :global(a) { color: var(--color-primary); text-decoration: underline; }

  .typing-spinner {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0;
  }

  .message-image-container {
    max-width: 14rem;
    max-height: 12rem;
    overflow: hidden;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
  }
  /* Tool chips — frosted glass */
  .chip {
    display: inline-flex; align-items: center; gap: 0.25rem;
    padding: 0.125rem 0.5rem; margin-right: 0.375rem; border-radius: var(--radius-md);
    font-size: var(--fs-xs); font-weight: 500;
    border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
    background: color-mix(in srgb, var(--color-surface) 75%, transparent);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    color: var(--color-muted-foreground);
    cursor: pointer;
    transition: border-color 0.2s, background-color 0.2s, color 0.2s;
    user-select: none;
  }
  .chip:hover {
    border-color: color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
  }
  .chip + .chip { margin-top: 0.1875rem; }
  .chip--pending {
    border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
    background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
    color: var(--color-primary);
  }
  .chip--done {
    border-color: color-mix(in srgb, var(--color-success) 50%, transparent);
    background: color-mix(in srgb, var(--color-success) 8%, var(--color-surface));
    color: var(--color-success);
  }
  .chip--error {
    border-color: color-mix(in srgb, var(--color-destructive) 50%, transparent);
    background: color-mix(in srgb, var(--color-destructive) 8%, var(--color-surface));
    color: var(--color-destructive);
  }
  .chip-text {
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    max-width: 14rem;
  }

  /* Tool chip detail popup */
  .popup-overlay {
    position: fixed; inset: 0; z-index: 2000;
    display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--color-surface) 50%, transparent);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }
  .popup-glass {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 1rem;
    max-width: 32rem; width: 90%; max-height: 80vh;
    overflow-y: auto;
    box-shadow: var(--shadow-float);
  }
  .popup-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 0.75rem;
  }
  .popup-title {
    font-size: var(--fs-sm); font-weight: 700;
    color: var(--color-foreground);
    font-family: var(--font-mono);
  }
  .popup-close {
    background: none; border: none;
    color: var(--color-muted-foreground);
    font-size: 1.125rem; cursor: pointer; line-height: 1;
    padding: 0.125rem 0.375rem;
    border-radius: var(--radius-sm);
    transition: color 0.15s, background 0.15s;
  }
  .popup-close:hover {
    color: var(--color-foreground);
    background: var(--color-muted);
  }
  .popup-error {
    background: color-mix(in srgb, var(--color-destructive) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-destructive) 30%, transparent);
    border-radius: var(--radius-sm);
    padding: 0.5rem 0.625rem;
    margin-bottom: 0.75rem;
    font-size: var(--fs-xs);
    color: var(--color-destructive);
  }
  .popup-section { margin-bottom: 0.75rem; }
  .popup-section-title {
    display: block;
    font-size: var(--fs-xs); font-weight: 600;
    color: var(--color-muted-foreground);
    margin-bottom: 0.375rem;
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  .popup-args {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.125rem 0.5rem;
    font-size: var(--fs-xs);
  }
  .popup-args-key {
    font-weight: 600; color: var(--color-muted-foreground);
    font-family: var(--font-mono);
  }
  .popup-args-val {
    color: var(--color-foreground);
    word-break: break-all;
    font-family: var(--font-mono);
  }
  .popup-result {
    background: var(--color-muted);
    border-radius: var(--radius-sm);
    padding: 0.5rem 0.625rem;
    font-size: var(--fs-xs);
    font-family: var(--font-mono);
    color: var(--color-foreground);
    overflow-x: auto;
    white-space: pre-wrap;
    max-height: 12rem;
  }

  .conv-empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 0.5rem; flex: 1; text-align: center;
    color: var(--color-muted-foreground); font-size: var(--fs-md);
  }
  .conv-empty-hint { font-size: var(--fs-xs); opacity: 0.6; }

  .collapse-btn {
    background: none;
    border: none;
    color: var(--color-muted-foreground);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border-radius: var(--radius-sm);
    transition: color 0.15s, background-color 0.15s;
  }
  .collapse-btn:hover {
    color: var(--color-foreground);
    background-color: var(--color-muted);
  }
  @media (prefers-reduced-motion: reduce) {
    .conv-tile { transition-duration: 0.01ms; }
  }
</style>
