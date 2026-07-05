<script lang="ts">
  import { MessageCircleQuestion, Check, SendHorizonal, X } from "@lucide/svelte";
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
  let customText = $state("");
  let inputEl = $state<HTMLInputElement>();
  let selectTimer: number | undefined;

  $effect(() => {
    return () => { if (selectTimer) window.clearTimeout(selectTimer); };
  });

  function handleSelect(idx: number) {
    selectedIdx = idx;
    selectTimer = window.setTimeout(() => onSelect(options[idx]), 180);
  }

  function handleCustomSubmit(e: Event) {
    e.preventDefault();
    const text = customText.trim();
    if (text) onSelect(text);
  }

</script>

<div class="fr-wrap" transition:fly={{ y: 20, duration: 250 }}>
  <div class="fr-bubble">
    <!-- Header -->
    <div class="fr-header">
      <span class="fr-agent-name">{profile.agent?.name ?? 'Agent'}</span>
      <button type="button" class="fr-close" onclick={onDismiss} aria-label="Dismiss">
        <X class="fr-close-icon" />
      </button>
    </div>
    <!-- Question -->
    <p class="fr-question">{question}</p>

    <!-- Options -->
    <div class="fr-options">
      {#each options as option, idx (option)}
        <button
          type="button"
          class="fr-opt"
          class:fr-opt--sel={selectedIdx === idx}
          onclick={() => handleSelect(idx)}
          disabled={selectedIdx != null}
        >
          <span>{option}</span>
          {#if selectedIdx === idx}
            <Check class="fr-check" />
          {/if}
        </button>
      {/each}
    </div>

    <!-- Type your own -->
    {#if selectedIdx == null}
      <form onsubmit={handleCustomSubmit} class="fr-custom">
        <input
          bind:this={inputEl}
          bind:value={customText}
          type="text"
          placeholder="Type your own answer..."
          class="fr-input"
        />
        <button
          type="submit"
          class="fr-send-btn"
          disabled={!customText.trim()}
          aria-label="Submit custom answer"
        >
          <SendHorizonal class="fr-send-icon" />
        </button>
      </form>
    {/if}
  </div>
</div>

<style>
  .fr-wrap {
    position: fixed;
    bottom: 6.5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 56;
    width: min(440px, calc(100vw - 2rem));
    pointer-events: auto;
  }
  .fr-bubble {
    width: 100%;
    max-height: 360px;
    border-radius: var(--radius-xl);
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in srgb, var(--color-surface) 72%, transparent);
    backdrop-filter: blur(18px) saturate(140%);
    -webkit-backdrop-filter: blur(18px) saturate(140%);
    padding: 0.75rem 0.875rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    box-shadow: var(--shadow-float);
  }

  .fr-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
    padding-bottom: 0.375rem;
    flex-shrink: 0;
  }
  .fr-agent-name {
    font-size: var(--fs-sm);
    font-weight: 700;
    color: var(--color-primary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .fr-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    border: none;
    background: color-mix(in srgb, var(--color-muted) 30%, transparent);
    color: var(--color-muted-foreground);
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
    flex-shrink: 0;
  }
  .fr-close:hover {
    background: color-mix(in srgb, var(--color-muted) 50%, transparent);
    color: var(--color-foreground);
  }
  .fr-close :global(.fr-close-icon) {
    width: 0.875rem;
    height: 0.875rem;
  }

  .fr-question {
    font-size: var(--fs-xs);
    font-weight: 600;
    line-height: 1.5;
    color: var(--color-foreground);
    margin: 0;
    flex-shrink: 0;
  }

  .fr-options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .fr-opt {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    border-radius: var(--radius-lg);
    border: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
    background: color-mix(in srgb, var(--color-muted) 30%, transparent);
    padding: 0.375rem 0.625rem;
    font-size: var(--fs-xs);
    font-weight: 500;
    color: var(--color-foreground);
    cursor: pointer;
    transition: border-color 0.15s, background-color 0.15s, transform 0.1s;
  }
  .fr-opt:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
    background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  }
  .fr-opt:active:not(:disabled) {
    transform: scale(0.97);
  }
  .fr-opt--sel {
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    color: var(--color-primary);
  }
  .fr-opt:disabled {
    cursor: default;
    opacity: 0.85;
  }
  .fr-opt--sel :global(.fr-check) {
    width: 0.75rem;
    height: 0.75rem;
    color: var(--color-primary);
  }

  .fr-custom {
    display: flex;
    gap: 0.375rem;
  }
  .fr-input {
    flex: 1;
    border: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-surface-elevated) 50%, transparent);
    padding: 0.375rem 0.5rem;
    font-size: var(--fs-xs);
    color: var(--color-foreground);
    outline: none;
    transition: border-color 0.15s;
  }
  .fr-input::placeholder { color: var(--color-muted-foreground); opacity: 0.6; }
  .fr-input:focus {
    border-color: color-mix(in srgb, var(--color-primary) 50%, transparent);
  }
  .fr-send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
    flex-shrink: 0;
  }
  .fr-send-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .fr-send-btn:active:not(:disabled) {
    transform: scale(0.93);
  }
  .fr-send-btn :global(.fr-send-icon) {
    width: 1rem;
    height: 1rem;
  }

</style>
