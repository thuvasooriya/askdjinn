<script lang="ts">
  // The permanent anchor at the bottom of the floating response area.
  // Shows the current session phase (spinner + label) and is always present
  // while the floating container is visible. Bubbles emanate above it.
  // Clicking opens the full chat panel.

  import { useSessionPhase } from "$lib/stores/session-phase.svelte";
  import { useProfile } from "$lib/stores/profile.svelte";
  import BrailleSpinner from "$lib/ui/BrailleSpinner.svelte";
  import { AlertCircle } from "@lucide/svelte";
  import { fade } from "svelte/transition";
  import { browser } from "$app/environment";

  let { onclick }: { onclick?: () => void } = $props();

  const sessionPhase = useSessionPhase();
  const profile = useProfile();
  const reducedMotion = $derived(
    browser && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
</script>

<!-- idlePill: true when no active session — show small bar that expands on hover -->
{#if sessionPhase.isActive || sessionPhase.label}
  <button
    type="button"
    class="status-pill glass shadow-md"
    {onclick}
    data-bubble-preserve
    aria-label={sessionPhase.label ?? profile.agent?.name ?? "Agent"}
  >
    {#if sessionPhase.label}
      {#if sessionPhase.phase === "error"}
        <AlertCircle class="h-3 w-3 text-red-500" />
      {:else if sessionPhase.spinner}
        <div transition:fade={{ duration: reducedMotion ? 0 : 200 }}>
          <BrailleSpinner name={sessionPhase.spinner} size="sm" label={sessionPhase.label} />
        </div>
      {/if}
    {/if}
    <span class="status-text">{sessionPhase.label ?? profile.agent?.name ?? "Agent"}</span>
  </button>
{:else}
  <!-- Idle: compact handle-like pill, no glass — just the bar -->
  <button
    type="button"
    class="status-pill status-pill--idle"
    {onclick}
    data-bubble-preserve
    aria-label={profile.agent?.name ?? "Agent"}
  >
    <span class="idle-bar"></span>
    <span class="status-text">{profile.agent?.name ?? "Agent"}</span>
  </button>
{/if}

<style>
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
    transition: transform 0.12s ease, padding 0.2s ease, gap 0.2s ease;
  }
  .status-pill:hover {
    transform: scale(1.03);
  }
  .status-pill:active {
    transform: scale(0.97);
  }

  /* ── Idle state: compact bar only; no glass container, expands on hover ── */
  .status-pill--idle {
    padding: 0.375rem;
    gap: 0;
    border: none;
    background: none;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  .status-pill--idle .idle-bar {
    display: block;
    width: 1.5rem;
    height: 0.25rem;
    border-radius: var(--radius-full);
    background: var(--color-primary);
    opacity: 0.6;
    transition: opacity 0.15s ease, width 0.2s ease;
    flex-shrink: 0;
  }
  .status-pill--idle .status-text {
    opacity: 0;
    max-width: 0;
    transition: max-width 0.2s ease, opacity 0.15s ease 0.05s;
    white-space: nowrap;
    overflow: hidden;
  }
  .status-pill--idle:hover {
    padding: 0.375rem 0.75rem;
    gap: 0.5rem;
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in srgb, var(--color-surface) 70%, transparent);
    box-shadow: var(--shadow-card);
    backdrop-filter: blur(28px) saturate(180%);
    -webkit-backdrop-filter: blur(28px) saturate(180%);
  }
  .status-pill--idle:hover .idle-bar {
    opacity: 0;
    width: 0;
  }
  .status-pill--idle:hover .status-text {
    max-width: 12rem;
    opacity: 1;
  }
</style>
