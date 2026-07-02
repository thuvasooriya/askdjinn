<script lang="ts">
  // Dock: bottom-right FAB cluster. Two tiers:
  //  1. Salient chips — panels that "jumped out" (needs-input, has-update,
  //     badge>0, pinned). Direct panel access.
  //  2. One persistent MENU button — its fan-out contains the full options
  //     menu directly (New Conversation, Lists, Session History, Settings,
  //     Re-run Onboarding, Clear Data), with any minimized/overflow panels
  //     appended at the top when they exist. No intermediate dialog.

  import { ShoppingBag, Heart, History, Send, Truck, Eye, MapPin, Check, Layers, MessageSquare, MoreVertical, X, Plus, RotateCcw, Trash2, Home, Package, Brain, ChevronLeft } from "@lucide/svelte";
  import { type Component, onDestroy, untrack } from "svelte";
  import { fly, fade } from "svelte/transition";
  import { browser } from "$app/environment";

  import type { Panel } from "$lib/stores/panel-registry";
  import { useUI } from "$lib/stores/ui.svelte";
  import { useCart } from "$lib/stores/cart.svelte";

  let {
    onNewConversation,
    onRerunOnboarding,
    onClearCache,
    onCartClick,
    isHome = false,
  }: {
    onNewConversation: () => void;
    onRerunOnboarding: () => void;
    onClearCache: () => void;
    onCartClick?: (el: HTMLElement) => void;
    isHome?: boolean;
  } = $props();

  const ui = useUI();
  const cart = useCart();

  const ICONS: Record<string, Component> = {
    products: Layers, conversation: MessageSquare, cart: ShoppingBag,
    "product-detail": Eye, lists: Heart, sessions: History,
    checkout: Send, "address-select": MapPin, "address-form": MapPin,
    "delivery-info": Truck, "order-tracking": Truck,
    wishlist: Heart, orders: Package, "address-book": MapPin, memories: Brain,
  };
  function iconFor(panel: Panel): Component {
    return ICONS[panel.type] ?? Layers;
  }

  // Minimized/overflow panels — only panels evicted due to splits or manually minimized.
  const minimizedPanels = $derived(ui.placement.minimized.filter(p => p.type !== "conversation"));
  function badgeFor(panel: Panel): number | string | undefined {
    if (panel.type === "cart") return cart.count > 0 ? cart.count : undefined;
    return panel.badge;
  }

  const reducedMotion = $derived(browser && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  let expanded = $state(false);
  function toggle(e?: MouseEvent) { e?.stopPropagation(); expanded = !expanded; }
  function collapse() { expanded = false; }

  function activate(panel: Panel, e: MouseEvent) {
    if (panel.minimized) ui.restore(panel.id);
    else ui.focus(panel.id);
    if (panel.type === "cart") onCartClick?.(e.currentTarget as HTMLElement);
    collapse();
  }

  // Outside-click / Esc to collapse the fan-out.
  let dockEl: HTMLElement | undefined = $state();
  function onWindowClick(e: MouseEvent) {
    if (expanded && dockEl && !dockEl.contains(e.target as Node)) collapse();
  }
  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && expanded) collapse();
  }
  let chipsCollapsed = $state(true);
  let collapseTimer: number | undefined;

  // Auto-expand on new minimized panel changes, reset timer
  $effect(() => {
    const count = minimizedPanels.length;
    if (count > 0) {
      untrack(() => {
        chipsCollapsed = false;
        resetCollapseTimer();
      });
    }
    void count;
  });

  function resetCollapseTimer() {
    if (collapseTimer) window.clearTimeout(collapseTimer);
    collapseTimer = window.setTimeout(() => {
      chipsCollapsed = true;
    }, 4000);
  }

  onDestroy(() => {
    if (collapseTimer) window.clearTimeout(collapseTimer);
  });
</script>

<svelte:window onclick={onWindowClick} onkeydown={onKeydown} />

<div class="dock" role="region" aria-label="Minimized panels" onmouseenter={resetCollapseTimer}>
  {#if chipsCollapsed && minimizedPanels.length > 0}
    <!-- Chevron Left button to expand chips -->
    <button
      type="button"
      class="chevron-toggle-btn"
      onclick={(e) => { e.stopPropagation(); chipsCollapsed = false; resetCollapseTimer(); }}
      aria-label="Expand panel chips"
      title="Expand"
      transition:fade={{ duration: 150 }}
    >
      <span class="chevron-glow"></span>
      <ChevronLeft class="h-5 w-5 relative z-10" />
    </button>
  {:else}
    <!-- Stack minimized panels (separate icons stacked vertically in right middle edge) -->
    {#each minimizedPanels as panel (panel.id)}
      {@const Icon = iconFor(panel)}
      {@const badge = badgeFor(panel)}
      <button
        type="button"
        class="chip glass shadow-lg {panel.status === 'needs-input' ? 'chip--urgent' : ''} {ui.activePanelId === panel.id ? 'chip--active' : ''}"
        onclick={(e) => activate(panel, e)}
        aria-label={panel.title}
        title={panel.title}
        transition:fly={{ x: 15, duration: reducedMotion ? 0 : 150 }}
      >
        <Icon class="h-4 w-4" />
        {#if badge != null && badge !== 0}
          <span class="chip-badge">{badge}</span>
        {/if}
      </button>
    {/each}
  {/if}
</div>

{#if ui.isSplit || !ui.agentInputOpen}
  <div class="options-menu-container" bind:this={dockEl} transition:fade={{ duration: 150 }}>
  <!-- Home Button (hidden when already on home screen) -->
  {#if !isHome}
  <button
    type="button"
    class="chip glass shadow-lg"
    onclick={() => { ui.goHome(); collapse(); }}
    aria-label="Home"
    title="Home"
  >
    <Home class="h-4 w-4" />
  </button>
  {/if}

  <!-- Options Menu Button (fixed in the bottom-right corner) -->
  <button
    type="button"
    class="options-toggle glass shadow-lg {expanded ? 'options-toggle--open' : ''}"
    onclick={toggle}
    aria-label="Options Menu"
    aria-haspopup="true"
    aria-expanded={expanded}
    title="Options Menu"
  >
    {#if expanded}<X class="h-4 w-4" />{:else}<MoreVertical class="h-4 w-4" />{/if}
  </button>

  {#if expanded}
    <div class="fanout" role="menu" aria-label="Options" transition:fly={{ y: 8, duration: reducedMotion ? 0 : 150 }}>
      <!-- Options menu (direct — no separate settings dialog) -->
      {#if ui.canRestoreLastLayout}
        <button type="button" class="fanout-item" role="menuitem" onclick={() => { ui.restoreLastLayout(); collapse(); }}>
          <RotateCcw class="h-4 w-4" />
          <span class="fanout-label">Restore Layout</span>
        </button>
      {/if}
      <div class="fanout-sep"></div>
      <button type="button" class="fanout-item" class:fanout-item--active={ui.isOpen("wishlist")} role="menuitemcheckbox" aria-checked={ui.isOpen("wishlist")} onclick={() => { ui.togglePanel("wishlist" as never); collapse(); }}>
        <Heart class="h-4 w-4" />
        <span class="fanout-label">Wishlist</span>
      </button>
      <button type="button" class="fanout-item" class:fanout-item--active={ui.isOpen("sessions")} role="menuitemcheckbox" aria-checked={ui.isOpen("sessions")} onclick={() => { ui.togglePanel("sessions" as never); collapse(); }}>
        <History class="h-4 w-4" />
        <span class="fanout-label">Session History</span>
      </button>
      <button type="button" class="fanout-item" class:fanout-item--active={ui.isOpen("orders")} role="menuitemcheckbox" aria-checked={ui.isOpen("orders")} onclick={() => { ui.togglePanel("orders" as never); collapse(); }}>
        <Package class="h-4 w-4" />
        <span class="fanout-label">Orders</span>
      </button>
      <button type="button" class="fanout-item" class:fanout-item--active={ui.isOpen("address-book")} role="menuitemcheckbox" aria-checked={ui.isOpen("address-book")} onclick={() => { ui.togglePanel("address-book" as never); collapse(); }}>
        <MapPin class="h-4 w-4" />
        <span class="fanout-label">Address Book</span>
      </button>
      <button type="button" class="fanout-item" class:fanout-item--active={ui.isOpen("memories")} role="menuitemcheckbox" aria-checked={ui.isOpen("memories")} onclick={() => { ui.togglePanel("memories" as never); collapse(); }}>
        <Brain class="h-4 w-4" />
        <span class="fanout-label">Memories</span>
      </button>
      <div class="fanout-sep"></div>
      <button type="button" class="fanout-item" role="menuitem" onclick={() => { onNewConversation(); collapse(); }}>
        <Plus class="h-4 w-4" />
        <span class="fanout-label">New Conversation</span>
      </button>
      <button type="button" class="fanout-item" role="menuitem" onclick={() => { onRerunOnboarding(); collapse(); }}>
        <RotateCcw class="h-4 w-4" />
        <span class="fanout-label">Re-run Onboarding</span>
      </button>
      <button type="button" class="fanout-item fanout-item--danger" role="menuitem" onclick={() => { onClearCache(); collapse(); }}>
        <Trash2 class="h-4 w-4" />
        <span class="fanout-label">Clear All Data</span>
      </button>
    </div>
  {/if}
</div>
{/if}

<style>
  .dock {
    position: fixed;
    top: 50%;
    right: 0.35rem;
    transform: translateY(-50%);
    z-index: 58;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .options-menu-container {
    position: fixed;
    bottom: 0.75rem;
    right: 0.75rem;
    z-index: 58;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }

  .chip, .options-toggle {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-foreground);
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s, transform 0.1s;
  }

  button.chevron-toggle-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    border: none;
    background: transparent;
    background-color: transparent;
    color: var(--color-primary);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: color 0.15s, transform 0.1s;
    outline: none;
  }
  button.chevron-toggle-btn:hover {
    background: transparent;
    background-color: transparent;
  }
  button.chevron-toggle-btn:active {
    transform: scale(0.92);
  }

  .chevron-glow {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 0.9rem;
    height: 0.9rem;
    border-radius: var(--radius-full);
    background: var(--color-primary);
    filter: blur(8px);
    opacity: 0.4;
    transition: opacity 0.15s, filter 0.15s;
    pointer-events: none;
    z-index: 1;
  }
  .chevron-toggle-btn:hover .chevron-glow {
    opacity: 0.75;
    filter: blur(10px);
  }
  .chip:hover, .options-toggle:hover { border-color: var(--color-primary); }
  .chip:active, .options-toggle:active { transform: scale(0.95); }
  .chip--active {
    background: color-mix(in srgb, var(--color-primary) 15%, transparent);
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
  .chip--urgent {
    animation: pulse-soft 1.5s ease-in-out infinite;
    border-color: var(--color-primary);
  }
  .options-toggle--open { background: var(--color-muted); }

  .chip-badge {
    position: absolute;
    top: -0.125rem;
    right: -0.125rem;
    min-width: 0.875rem;
    height: 0.875rem;
    padding: 0 0.1875rem;
    border-radius: var(--radius-full);
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    font-size: var(--fs-xs);
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .fanout {
    position: absolute;
    bottom: 3.25rem;
    right: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.375rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-float);
    z-index: 59;
    min-width: 12rem;
    max-height: 70vh;
    overflow-y: auto;
  }
  .fanout-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.4rem 0.5rem;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-foreground);
    font-size: var(--fs-md);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease, color 0.12s ease;
  }
  .fanout-item:hover { background: var(--color-muted); }
  .fanout-item:active { background: color-mix(in srgb, var(--color-muted) 80%, var(--color-foreground)); }
  .fanout-item--active {
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
    color: var(--color-primary);
    font-weight: 600;
  }
  .fanout-item--active:hover {
    background: color-mix(in srgb, var(--color-primary) 18%, transparent);
  }
  .fanout-item--danger { color: var(--color-destructive); }
  .fanout-item--danger:hover { background: color-mix(in srgb, var(--color-destructive) 10%, transparent); }
  .fanout-item--danger:active { background: color-mix(in srgb, var(--color-destructive) 20%, transparent); }
  .fanout-label { flex: 1; }
  .fanout-sep { height: 1px; background: var(--color-border); margin: 0.125rem 0; }

  @media (prefers-reduced-motion: reduce) {
    .chip--urgent { animation: none; }
  }
</style>
