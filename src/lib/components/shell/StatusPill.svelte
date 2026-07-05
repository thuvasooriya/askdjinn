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
    transition: transform 0.12s ease;
  }
  .status-pill:hover {
    transform: scale(1.03);
  }
  .status-pill:active {
    transform: scale(0.97);
  }
</style>
