<script lang="ts">
  import { useConversation, type TurnPart } from "$lib/stores/conversation.svelte";
  import { useUI } from "$lib/stores/ui.svelte";
  import { useAgentStatus } from "$lib/stores/agent-status.svelte";
  import { useLiveVoice } from "$lib/stores/live-voice.svelte";
  import { useChat } from "$lib/stores/chat.svelte";
  import { useProfile } from "$lib/stores/profile.svelte";
  import { renderMarkdown } from "$lib/markdown";
  import { Maximize2, ChevronDown, AlertCircle } from "@lucide/svelte";
  import BrailleSpinner from "$lib/ui/BrailleSpinner.svelte";
  import { browser } from "$app/environment";
  import { fly, fade } from "svelte/transition";
  import { onDestroy } from "svelte";
  import OrderConfirmationCard from "$lib/components/OrderConfirmationCard.svelte";
  import { getCreatedOrderFromToolPart, type ToolCallPart } from "$lib/order/order-render";
  import type { CreatedOrder } from "$lib/order/create-order-client";
import DeliveryCheckCard from "$lib/components/DeliveryCheckCard.svelte";
import { getDeliveryCheckFromToolPart } from "$lib/delivery/delivery-render";

  const conv = useConversation();
  const ui = useUI();
  const agentStatus = useAgentStatus();
  const liveVoice = useLiveVoice();
  const chat = useChat();
  const profile = useProfile();

  const reducedMotion = $derived(browser && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  let dismissedTurnId = $state<string | null>(null);
  let bodyEl = $state<HTMLElement>();
  let containerEl = $state<HTMLDivElement>();
  const lastTurn = $derived(conv.lastTurn);
  const lastTurnId = $derived(lastTurn?.id ?? null);

  // Captured once at mount: the last turn id persisted from a prior session.
  // The idle pill only surfaces turns produced in THIS session (plus any active
  // status), so reloading the app never resurrects a stale agent-name nub.
  const initialLastTurnId = conv.lastTurn?.id ?? null;
  const visible = $derived(
    lastTurnId !== null && lastTurnId !== initialLastTurnId && lastTurnId !== dismissedTurnId,
  );

  const isAssistant = $derived(lastTurn?.role === "assistant");
  const text = $derived(lastTurn ? conv.getText(lastTurn) : "");

  const textModePendingTools = $derived(
    lastTurn?.parts.some(p => p.type === "tool-call" && p.status === "pending") ?? false
  );
  const hasPendingToolCall = $derived(
    liveVoice.log.some(e => e.type === "tool-call" && e.status === "pending")
    || textModePendingTools
  );
  const isError = $derived(liveVoice.state === "error");

  const liveState = $derived(liveVoice.state);
  const liveActive = $derived(liveState !== "idle" && liveState !== "error");

  // ── Collapse state ──────────────────────────────────────────────────────────
  // collapsed = small center pill (status or agent name)
  // expanded = full response bubble
  let collapsed = $state(true);
  let collapseTimer: ReturnType<typeof setTimeout> | undefined;

  // Auto-expand only once there's actual content (text, order, delivery),
  // not the instant a turn starts streaming — mirrors live mode, where the pill
  // stays put until there's something to render. Avoids the empty bubble
  // flashing open the moment the user hits Enter.
  $effect(() => {
    if (liveActive) return;
    if (lastTurn?.streaming && renderItems.length > 0) {
      collapsed = false;
    }
  });

  // Auto-expand when user returns from chat panel with content to show
  let wasPanelOpen = $state(false);
  $effect(() => {
    if (ui.conversationVisible) {
      wasPanelOpen = true;
    } else if (wasPanelOpen && collapsed && renderItems.length > 0) {
      collapsed = false;
      wasPanelOpen = false;
      clearTimeout(collapseTimer);
      collapseTimer = setTimeout(() => { collapsed = true; }, 30000);
    }
  });

  // Auto-collapse after idle timeout
  $effect(() => {
    const _stream = lastTurn?.streaming;
    const _pending = hasPendingToolCall;

    clearTimeout(collapseTimer);
    if (collapsed) return;
    if (_stream || _pending) return;

    collapseTimer = setTimeout(() => {
      collapsed = true;
    }, 30000);
  });

  // Collapse when user clicks outside the bubble container
  function onDocumentClick(e: MouseEvent) {
    if (!containerEl) return;
    if (containerEl.contains(e.target as Node)) return;
    collapsed = true;
  }

  $effect(() => {
    if (!browser) return;
    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  });

  function expand(e: MouseEvent) {
    e.stopPropagation();
    collapsed = false;
  }

  function collapse(e?: MouseEvent) {
    e?.stopPropagation();
    collapsed = true;
  }

  onDestroy(() => clearTimeout(collapseTimer));

  // ── ─────────────────────────────────────────────────────────────────────────
  // ── Render items ─────────────────────────────────────────────────────────
  type RenderItem =
    | { type: "text"; text: string }
    | { type: "order-confirmation"; order: CreatedOrder }
    | { type: "delivery-group"; city: string; rate?: number; dates: Array<{ date: string; available: boolean }> };
  const renderItems = $derived.by((): RenderItem[] => {
    if (!lastTurn) return [];
    const items: RenderItem[] = [];

    for (const part of lastTurn.parts) {
      if (part.type === "tool-call") {
        const createdOrder = getCreatedOrderFromToolPart(part);
        if (createdOrder) {
          items.push({ type: "order-confirmation", order: createdOrder });
        } else {
          const deliveryCheck = getDeliveryCheckFromToolPart(part);
          if (deliveryCheck) {
            items.push({ type: "delivery-group", city: deliveryCheck.city, rate: deliveryCheck.rate, dates: deliveryCheck.dates });
          }
          // Regular tool calls are shown in the conversation tile — skip here
        }
      } else if (part.type === "text") {
        if (part.text) {
          items.push({ type: "text", text: part.text });
        }
      }
    }
    return items;
  });

  const statusText = $derived.by(() => {
    if (liveActive) {
      if (liveState === "connecting" || liveState === "connected") return "Connecting";
      if (liveState === "listening") return "Listening";
      if (liveState === "speaking") return "Speaking";
      return "Live";
    }
    if (chat.isStreaming) {
      if (agentStatus.isActive) return agentStatus.status.label;
      if (hasPendingToolCall) return "Searching Kapruka";
      return "Thinking";
    }
    return null;
  });

  const statusAnimation = $derived.by(() => {
    if (liveActive) {
      if (liveState === "listening") return "dna";
      if (liveState === "speaking") return "pulse";
      return "helix";
    }
    if (hasPendingToolCall || agentStatus.isActive) return "rain";
    if (chat.isStreaming) return "cascade";
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
    const _text = text;
    const _items = renderItems.length;
    const _stream = lastTurn?.streaming;

    if (bodyEl) {
      bodyEl.scrollTop = bodyEl.scrollHeight;
    }
  });

  function expandChat() {
    ui.open("conversation" as import("$lib/panel-contracts").PanelType, { kind: "static" });
    collapsed = true;
  }
</script>

{#if !ui.conversationVisible && (visible || statusText || conv.turns.length > 0) && !ui.askUser}
  <div bind:this={containerEl} class="floating-bubble-container" transition:fly={{ y: 20, duration: reducedMotion ? 0 : 250 }}>
    {#if collapsed}
      <button type="button" class="status-pill glass shadow-md" onclick={expand}>
        {#if statusText}
          {#if isError}
            <AlertCircle class="h-3 w-3 text-red-500" />
          {:else if statusAnimation}
            {#key statusAnimation}
              <div transition:fade={{ duration: reducedMotion ? 0 : 200 }}>
                <BrailleSpinner name={statusAnimation} size="sm" label={statusText} />
              </div>
            {/key}
          {/if}
        {/if}
        <span class="status-text">{statusText ?? profile.agent?.name ?? 'Agent'}</span>
      </button>
    {:else}
      <!-- Expanded bubble -->
      <div class="response-bubble glass shadow-xl flex flex-col">
        <!-- Header controls -->
        <div class="bubble-header flex items-center justify-between gap-4">
          <span class="bubble-agent-name">{profile.agent?.name ?? 'Agent'}</span>

          <!-- Status pill centered in the bubble header! -->
          {#if statusText}
            <div class="header-status flex items-center gap-1 text-[10px] font-semibold text-[var(--color-muted-foreground)]">
              {#if isError}
                <AlertCircle class="h-3 w-3 text-red-500" />
              {:else if statusAnimation}
                {#key statusAnimation}
                  <div transition:fade={{ duration: reducedMotion ? 0 : 200 }}>
                    <BrailleSpinner name={statusAnimation} size="sm" label={statusText} />
                  </div>
                {/key}
              {/if}
              <span>{statusText}</span>
            </div>
          {/if}

          <div class="flex items-center gap-2">
            <button type="button" class="ctrl-btn" onclick={collapse} aria-label="Minimize" title="Minimize">
              <ChevronDown class="h-3 w-3" />
            </button>
            <button type="button" class="ctrl-btn" onclick={expandChat} aria-label="Expand chat" title="Expand">
              <Maximize2 class="h-3 w-3" />
            </button>
          </div>
        </div>

        <!-- Scrollable text content -->
        <div bind:this={bodyEl} class="bubble-body overflow-y-auto pr-1">
          {#if lastTurn}
            {#each renderItems as item, i (`${lastTurn.id}-${i}`)}
              {#if item.type === "text"}
                <div class="prose prose-sm dark:prose-invert bubble-text">
                  {@html renderMarkdown(item.text)}
                </div>
              {:else if item.type === "order-confirmation"}
                <OrderConfirmationCard order={item.order} compact />
              {:else if item.type === "delivery-group"}
                <DeliveryCheckCard city={item.city} rate={item.rate} dates={item.dates} />
              {/if}
            {/each}
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
    z-index: 1001;
    width: min(440px, calc(100vw - 2rem));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    pointer-events: auto;
  }

  .status-pill {
    padding: 0.375rem 0.75rem;
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border-subtle);
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--color-foreground);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    box-shadow: var(--shadow-card);
  }
  .status-pill:hover {
    transform: scale(1.03);
  }
  .status-pill:active {
    transform: scale(0.97);
  }

  .response-bubble {
    width: 100%;
    max-height: 200px;
    border-radius: var(--radius-xl);
    border: 1px solid var(--color-border-subtle);
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 6%, transparent), transparent 60%),
      color-mix(in srgb, var(--color-surface) 72%, transparent);
    backdrop-filter: blur(18px) saturate(140%);
    -webkit-backdrop-filter: blur(18px) saturate(140%);
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
</style>
