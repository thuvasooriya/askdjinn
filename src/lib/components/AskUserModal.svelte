<script lang="ts">
  import { MessageCircleQuestion, Check } from "@lucide/svelte";
  import { useProfile } from "$lib/stores/profile.svelte";
  import { useUI } from "$lib/stores/ui.svelte";
  import { fly } from "svelte/transition";

  let {
    question,
    options,
    onSelect,
    onDismiss,
  }: {
    question: string;
    options: string[];
    onSelect: (answer: string) => void;
    onDismiss: () => void;
  } = $props();

  const profile = useProfile();
  const ui = useUI();
  
  let selectedIdx = $state<number | null>(null);
  let selectTimer: number | undefined;

  $effect(() => {
    return () => { if (selectTimer) window.clearTimeout(selectTimer); };
  });

  function handleSelect(idx: number) {
    selectedIdx = idx;
    // Brief delay so the user sees the selection highlight before resolving
    selectTimer = window.setTimeout(() => onSelect(options[idx]), 180);
  }
</script>

<div class="floating-bubble-container" transition:fly={{ y: 20, duration: 250 }}>
  <div class="response-bubble glass shadow-xl flex flex-col">
    <!-- Header -->
    <div class="bubble-header flex items-center justify-between gap-4">
      <span class="bubble-agent-name">{profile.agent?.name ?? 'Agent'} Question</span>
      <div class="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-primary)]/10">
        <MessageCircleQuestion class="h-3.5 w-3.5 text-[var(--color-primary)]" />
      </div>
    </div>
    
    <!-- Question -->
    <div class="bubble-body overflow-y-auto max-h-20">
      <p class="text-xs font-semibold leading-relaxed text-[var(--color-foreground)]">{question}</p>
    </div>

    <!-- Options as inline chips -->
    <div class="flex flex-wrap gap-1.5 pt-1">
      {#each options as option, idx (option)}
        <button
          type="button"
          onclick={() => handleSelect(idx)}
          class="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition active:scale-95 {selectedIdx === idx
            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
            : 'border-[var(--color-border)] bg-[var(--color-muted)]/30 text-[var(--color-foreground)] hover:border-[var(--color-primary)]/30'}"
        >
          <span>{option}</span>
          {#if selectedIdx === idx}
            <Check class="h-3 w-3 inline ml-1 text-[var(--color-primary)]" />
          {/if}
        </button>
      {/each}
    </div>

    <!-- Dismiss -->
    <div class="border-t border-[var(--color-border)] pt-2 flex justify-between items-center">
      <button
        type="button"
        onclick={onDismiss}
        class="text-[10px] font-medium text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)]"
      >
        Dismiss
      </button>
    </div>
  </div>
</div>

<style>
  .floating-bubble-container {
    position: fixed;
    bottom: 6.5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 56; /* Higher than response bubble and mobile sheets */
    width: min(440px, calc(100vw - 2rem));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    pointer-events: auto;
  }

  .response-bubble {
    width: 100%;
    max-height: 280px;
    border-radius: var(--radius-2xl);
    border: 1px solid var(--color-border);
    background: color-mix(in srgb, var(--color-surface-elevated) 85%, transparent);
    padding: 0.75rem 0.875rem;
    gap: 0.5rem;
    box-shadow: var(--shadow-float);
  }

  .bubble-header {
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
    padding-bottom: 0.375rem;
    margin-bottom: 0.125rem;
    flex-shrink: 0;
  }
  .bubble-agent-name {
    font-size: var(--fs-sm);
    font-weight: 700;
    color: var(--color-primary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .bubble-body {
    flex: 1;
    overflow-y: auto;
  }

  .bubble-header :global(svg) {
    flex-shrink: 0;
  }
</style>
