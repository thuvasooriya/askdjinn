<script lang="ts">
  import { useConversation } from "$lib/stores/conversation.svelte";
  import { useUI } from "$lib/stores/ui.svelte";
  import { useAgentStatus } from "$lib/stores/agent-status.svelte";
  import { useLiveVoice } from "$lib/stores/live-voice.svelte";
  import { useChat } from "$lib/stores/chat.svelte";
  import { useProfile } from "$lib/stores/profile.svelte";
  import { renderMarkdown } from "$lib/markdown";
  import { Maximize2, AlertCircle, Wrench, Sparkles } from "@lucide/svelte";
  import BrailleSpinner from "$lib/ui/BrailleSpinner.svelte";
  import { browser } from "$app/environment";

  import { fly } from "svelte/transition";

  const conv = useConversation();
  const ui = useUI();
  const agentStatus = useAgentStatus();
  const liveVoice = useLiveVoice();
  const chat = useChat();
  const profile = useProfile();

  const reducedMotion = $derived(browser && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  let dismissedTurnId = $state<string | null>(null);
  let bodyEl = $state<HTMLElement>();
  const lastTurn = $derived(conv.lastTurn);
  const lastTurnId = $derived(lastTurn?.id ?? null);
  
  // Visible if there's a turn and we haven't dismissed this specific turn
  const visible = $derived(lastTurnId !== null && lastTurnId !== dismissedTurnId);

  const isAssistant = $derived(lastTurn?.role === "assistant");
  const text = $derived(lastTurn ? conv.getText(lastTurn) : "");

  const hasPendingToolCall = $derived(liveVoice.log.some(e => e.type === "tool-call" && e.status === "pending"));
  const isError = $derived(liveVoice.state === "error" || (lastTurn?.parts.some(p => p.type === "tool-call" && p.status === "error") ?? false));

  const liveState = $derived(liveVoice.state);
  const liveActive = $derived(liveState !== "idle" && liveState !== "error");

  const statusText = $derived.by(() => {
    if (liveActive) {
      if (liveState === "connecting" || liveState === "connected") return "Connecting";
      if (liveState === "listening") return "Listening";
      if (liveState === "speaking") return `${profile.agent.name} speaking`;
      return "Live";
    }
    if (chat.isStreaming) return "Thinking";
    if (agentStatus.isActive) return agentStatus.status.label;
    if (hasPendingToolCall) return "Searching Kapruka";
    if (conv.isStreaming) return "Writing";
    return null;
  });

  // Whenever conversation is collapsed, reset dismissedTurnId so the bubble is shown again
  $effect(() => {
    if (!ui.conversationVisible) {
      dismissedTurnId = null;
    }
  });

  // Autoscroll logic for streaming response content
  $effect(() => {
    // Establish dependencies on text content, parts list, and streaming flag
    const _text = text;
    const _parts = lastTurn?.parts.length;
    const _stream = lastTurn?.streaming;

    if (bodyEl) {
      bodyEl.scrollTop = bodyEl.scrollHeight;
    }
  });

  function expandChat() {
    ui.open("conversation" as import("$lib/panel-contracts").PanelType, { kind: "static" });
    dismissedTurnId = lastTurnId;
  }
</script>

{#if !ui.conversationVisible && (visible || statusText) && !ui.askUser}
  {@const showBubble = isAssistant && (text || lastTurn?.streaming)}
  <div class="floating-bubble-container" transition:fly={{ y: 20, duration: reducedMotion ? 0 : 250 }}>
    <!-- Status pill (only when bubble is NOT visible) -->
    {#if statusText && !showBubble}
      <div class="status-pill glass shadow-md flex items-center gap-1.5">
        {#if isError}
          <AlertCircle class="h-3 w-3 text-red-500" />
        {:else}
          <BrailleSpinner name="helix" size="sm" label={statusText} />
        {/if}
        <span class="status-text">{statusText}</span>
      </div>
    {/if}

    <!-- Bubble -->
    {#if showBubble}
      <div class="response-bubble glass shadow-xl flex flex-col">
        <!-- Header controls -->
        <div class="bubble-header flex items-center justify-between gap-4">
          <span class="bubble-agent-name">{profile.agent?.name ?? 'Agent'}</span>
          
          <!-- Status pill centered in the bubble header! -->
          {#if statusText}
            <div class="header-status flex items-center gap-1 text-[10px] font-semibold text-[var(--color-muted-foreground)]">
              {#if isError}
                <AlertCircle class="h-3 w-3 text-red-500" />
              {:else}
                <Sparkles class="h-3 w-3 text-[var(--color-primary)] animate-pulse" />
              {/if}
              <span>{statusText}</span>
            </div>
          {/if}

          <div class="flex items-center gap-2">
            <button type="button" class="ctrl-btn" onclick={expandChat} aria-label="Expand chat" title="Expand">
              <Maximize2 class="h-3 w-3" />
            </button>
          </div>
        </div>

        <!-- Scrollable text content -->
        <div bind:this={bodyEl} class="bubble-body overflow-y-auto pr-1">
          {#if lastTurn}
            {#each lastTurn.parts as part, i (`${lastTurn.id}-${i}`)}
              {#if part.type === "text" && part.text}
                <div class="prose prose-sm dark:prose-invert bubble-text">
                  {@html renderMarkdown(part.text)}
                </div>
              {:else if part.type === "tool-call"}
                <span class="bubble-tool-marker bubble-tool-marker--{part.status}" title={part.summary ?? part.label ?? part.name} aria-label={part.summary ?? part.label ?? part.name}>
                  {#if part.status === "pending"}<BrailleSpinner name="orbit" size="sm" label={part.label ?? part.name} />{:else if part.status === "error"}<AlertCircle class="h-3 w-3" />{:else}<Wrench class="h-3 w-3" />{/if}
                </span>
              {:else if part.type === "image"}
                <div class="message-image-container">
                  <img src="data:{part.mimeType};base64,{part.base64}" alt="Sent media" class="message-image" />
                </div>
              {/if}
            {/each}
            {#if !text && lastTurn.streaming}
              <div class="typing-spinner"><BrailleSpinner name="breathe" label="Writing response" /></div>
            {/if}
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .floating-bubble-container {
    position: fixed;
    bottom: 6.5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 54;
    width: min(440px, calc(100vw - 2rem));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    pointer-events: auto;
  }

  .status-pill {
    padding: 0.375rem 0.75rem;
    border-radius: var(--radius-full);
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in srgb, var(--color-surface) 92%, transparent);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--color-foreground);
    display: flex;
    align-items: center;
  }

  .response-bubble {
    width: 100%;
    max-height: 200px;
    border-radius: var(--radius-2xl);
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in srgb, var(--color-primary) 12%, color-mix(in srgb, var(--color-surface-elevated) 82%, transparent));
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    padding: 0.75rem 0.875rem;
    gap: 0.5rem;
    box-shadow: var(--shadow-float);
  }

  .bubble-header {
    margin-bottom: 0.25rem;
    flex-shrink: 0;
  }
  .bubble-agent-name {
    font-size: var(--fs-sm);
    font-weight: 700;
    color: var(--color-primary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .header-status {
    flex: 1;
    justify-content: center;
  }
  .ctrl-btn {
    background: none;
    border: none;
    color: var(--color-muted-foreground);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.125rem;
    border-radius: var(--radius-sm);
    transition: color 0.15s;
  }
  .ctrl-btn:hover {
    color: var(--color-primary);
  }

  .bubble-body {
    flex: 1;
    overflow-y: auto;
  }

  .message-image-container {
    max-width: 12rem;
    max-height: 10rem;
    overflow: hidden;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    margin-block: 0.25rem;
  }
  .message-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .bubble-text {
    font-size: var(--fs-md);
    line-height: 1.5;
    color: var(--color-foreground);
  }
  .bubble-text :global(p) {
    margin: 0 0 0.5rem;
  }
  .bubble-text :global(p:last-child) {
    margin-bottom: 0;
  }
  .bubble-text + .bubble-tool-marker,
  .bubble-tool-marker + .bubble-text {
    margin-top: 0.25rem;
  }
  .bubble-tool-marker {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    margin-block: 0.125rem;
    border-radius: var(--radius-full);
    border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
    background: color-mix(in srgb, var(--color-muted) 60%, transparent);
    color: var(--color-muted-foreground);
    vertical-align: middle;
  }
  .bubble-tool-marker--done { color: var(--color-success); }
  .bubble-tool-marker--error { border-color: var(--color-destructive); color: var(--color-destructive); }
  .typing-spinner { display: inline-flex; align-items: center; padding: 0.25rem 0; }
</style>
