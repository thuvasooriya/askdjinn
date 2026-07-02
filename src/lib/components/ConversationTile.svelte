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
  import ChatInputBar from "./shell/ChatInputBar.svelte";
  import { exportFullDebugBundle } from "$lib/debug/app-inspector";

  const reducedMotion = $derived(typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  let { liveActive = false }: { liveActive?: boolean } = $props();

  const chat = useChat();
  const ui = useUI();
  const conv = useConversation();
  const profile = useProfile();
  const agentStatus = useAgentStatus();
  const liveVoice = useLiveVoice();

  let scrollContainer: HTMLElement | undefined = $state();

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
          const base = `  [tool:${part.name} ${part.status}]`;
          lines.push(part.summary ? `${base} ${part.summary}` : base);
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
                <div class="chip chip--{part.status}">
                  {#if part.status === "pending"}<BrailleSpinner name="orbit" size="sm" label={part.label ?? part.name} />{/if}
                  <span class="chip-label">{part.label ?? part.name}</span>
                  {#if part.summary}<span class="chip-summary">{part.summary}</span>{/if}
                </div>
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
  <!-- Chat input bar inside conversation tile -->
  <ChatInputBar
    class="chat-input-bar"
    {liveActive}
  />
</div>

<style>
  .conv-tile {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .conv-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.875rem;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }
  .conv-title { font-size: var(--fs-lg); font-weight: 700; color: var(--color-foreground); }
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
    background: color-mix(in srgb, var(--color-surface-elevated) 85%, transparent);
    backdrop-filter: blur(12px);
    border: 1px solid var(--color-border);
    border-bottom-left-radius: 0.375rem;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .user-text { white-space: pre-wrap; }
  .bubble-text { overflow-wrap: anywhere; }
  .bubble-text :global(p) { margin: 0 0 0.5rem; }
  .bubble-text :global(p:last-child) { margin-bottom: 0; }
  .bubble-text + .chip,
  .chip + .bubble-text {
    margin-top: 0.125rem;
  }
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
    margin-block: 0.25rem;
  }
  .message-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  /* Tool chips */
  .chip {
    display: inline-flex; align-items: center; gap: 0.375rem;
    padding: 0.1875rem 0.5rem; border-radius: var(--radius-sm);
    font-size: var(--fs-xs); border: 1px solid var(--color-border);
    background: color-mix(in srgb, var(--color-muted) 60%, transparent);
    backdrop-filter: blur(4px);
  }
  .chip--pending { opacity: 0.6; }
  .chip--done { border-color: var(--color-success); color: var(--color-success); }
  .chip--error { border-color: var(--color-destructive); color: var(--color-destructive); }
  .chip-label { font-weight: 600; }
  .chip-summary { color: var(--color-muted-foreground); }

  /* Markdown Tables */
  .bubble-text :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0.5rem 0;
    font-size: var(--fs-sm);
  }
  .bubble-text :global(th), .bubble-text :global(td) {
    border: 1px solid var(--color-border);
    padding: 0.375rem 0.5rem;
    text-align: left;
  }
  .bubble-text :global(th) {
    background: color-mix(in srgb, var(--color-muted) 40%, transparent);
    font-weight: 600;
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
  .chat-input-bar:focus-within {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 1px var(--color-primary);
    background: color-mix(in srgb, var(--color-surface) 98%, transparent);
  }

  .chat-input-bar {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-xl);
    background: color-mix(in srgb, var(--color-surface) 95%, transparent);
    flex-shrink: 0;
    width: calc(100% - 1.5rem);
    max-width: 32rem;
    margin: 0.5rem auto 0.75rem;
    box-shadow: var(--shadow-sm);
  }
  @media (prefers-reduced-motion: reduce) {
    .conv-tile { transition-duration: 0.01ms; }
    .chat-input-bar { transition-duration: 0.01ms; }
  }
</style>
