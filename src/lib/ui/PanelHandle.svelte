<script lang="ts">
  // PanelHandle: a subtle top-center grab bar that expands on hover (pointer)
  // or tap (touch) to reveal close + minimize buttons. Replaces the old
  // per-panel floating-close buttons with a unified interaction.
  import { useUI } from "$lib/stores/ui.svelte";
  import { X, ChevronDown } from "@lucide/svelte";
  import { browser } from "$app/environment";

  let {
    panelId,
    title,
    canMinimize = true,
  }: {
    panelId: string;
    title?: string;
    canMinimize?: boolean;
  } = $props();

  const ui = useUI();
  let expanded = $state(false);

  // Detect once: pointer devices expand on hover, touch devices expand on tap.
  const canHover = browser && window.matchMedia("(hover: hover)").matches;

  function close() {
    ui.close(panelId);
    expanded = false;
  }

  function minimize() {
    ui.minimize(panelId);
    expanded = false;
  }
</script>

<div
  class="handle-zone"
  class:expanded
  role="button"
  tabindex="0"
  aria-label={title ? `${title} controls` : "Panel controls"}
  aria-expanded={expanded}
  onpointerenter={canHover ? () => (expanded = true) : undefined}
  onpointerleave={canHover ? () => (expanded = false) : undefined}
  onclick={() => { if (!canHover) expanded = !expanded; }}
  onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); expanded = !expanded; } }}
>
  <span class="handle-bar" aria-hidden="true"></span>
  <div class="handle-actions">
    {#if canMinimize}
      <button type="button" class="handle-btn" onclick={minimize} aria-label="Minimize panel" title="Minimize">
        <ChevronDown class="h-3.5 w-3.5" />
      </button>
    {/if}
    <button type="button" class="handle-btn handle-btn--close" onclick={close} aria-label="Close panel" title="Close">
      <X class="h-3.5 w-3.5" />
    </button>
  </div>
</div>

<style>
  .handle-zone {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 0 0.25rem;
    height: 1.5rem;
    min-width: 2.5rem;
    z-index: 10;
    border-radius: 0 0 var(--radius-md) var(--radius-md);
    cursor: pointer;
    transition: background 0.15s ease, min-width 0.15s ease;
  }

  .handle-bar {
    width: 2.25rem;
    height: 0.25rem;
    border-radius: var(--radius-full);
    background: var(--color-muted-foreground);
    opacity: 0.25;
    transition: opacity 0.15s ease, width 0.15s ease;
    flex-shrink: 0;
  }

  /* Hover-capable devices: expand on hover */
  @media (hover: hover) {
    .handle-zone:hover {
      background: color-mix(in srgb, var(--color-muted) 60%, transparent);
      backdrop-filter: blur(8px);
      min-width: 5rem;
    }
    .handle-zone:hover .handle-bar {
      opacity: 0;
      width: 0;
    }
    .handle-zone:hover .handle-actions {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }
  }

  /* Touch devices: expand via .expanded class (toggled on tap) */
  .handle-zone.expanded {
    background: color-mix(in srgb, var(--color-muted) 60%, transparent);
    backdrop-filter: blur(8px);
    min-width: 5rem;
  }
  .handle-zone.expanded .handle-bar {
    opacity: 0;
    width: 0;
  }
  .handle-zone.expanded .handle-actions {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }

  .handle-actions {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 0.125rem;
    opacity: 0;
    pointer-events: none;
    transform: translateY(-0.25rem);
    transition: opacity 0.12s ease, transform 0.12s ease;
  }

  .handle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
    border-radius: var(--radius-full);
    background: color-mix(in srgb, var(--color-surface) 85%, transparent);
    color: var(--color-muted-foreground);
    cursor: pointer;
    transition: color 0.12s ease, background 0.12s ease, transform 0.1s ease;
  }
  .handle-btn:hover {
    color: var(--color-foreground);
    background: var(--color-muted);
  }
  .handle-btn:active {
    transform: scale(0.9);
  }
  :global(.handle-btn--close:hover) {
    color: var(--color-destructive);
    border-color: var(--color-destructive);
  }

  @media (prefers-reduced-motion: reduce) {
    .handle-zone,
    .handle-bar,
    .handle-actions,
    .handle-btn {
      transition-duration: 0.01ms;
    }
  }
</style>
