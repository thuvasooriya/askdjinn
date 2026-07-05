<script lang="ts">
  // Shared wrapper for floating bubbles. Provides:
  // - A small circular progress spinner positioned outside the bubble's right
  //   edge. The spinner IS the timer: when its animation ends, onTimeout fires.
  //   Pausing (streaming / hover) pauses the effective timeout.
  // - data-bubble-preserve so the dismissal handler ignores clicks inside.
  // No visual wrapper — the content component provides its own styling.

  let {
    timeout = "manual" as number | "manual",
    streaming = false,
    onTimeout,
    children,
  }: {
    timeout?: number | "manual";
    streaming?: boolean;
    onTimeout: () => void;
    children: import("svelte").Snippet;
  } = $props();

  const ringDuration = $derived(typeof timeout === "number" ? `${timeout}ms` : undefined);
</script>

<div class="bubble-frame" class:streaming data-bubble-preserve>
  {@render children()}
  {#if ringDuration}
    <svg class="timeout-spinner" viewBox="0 0 36 36" aria-hidden="true">
      <circle class="timeout-track" cx="18" cy="18" r="15" />
      <circle
        class="timeout-progress"
        cx="18"
        cy="18"
        r="15"
        pathLength={100}
        onanimationend={onTimeout}
      />
    </svg>
  {/if}
</div>

<style>
  .bubble-frame {
    position: relative;
    transform-origin: bottom center;
  }

  .timeout-spinner {
    position: absolute;
    right: -1.375rem;
    top: 50%;
    transform: translateY(-50%);
    width: 1.125rem;
    height: 1.125rem;
    pointer-events: none;
  }

  .timeout-track {
    fill: none;
    stroke: var(--color-border-subtle);
    stroke-width: 3;
    opacity: 0.4;
  }

  .timeout-progress {
    fill: none;
    stroke: var(--color-primary);
    stroke-width: 3;
    stroke-linecap: round;
    stroke-dasharray: 100;
    stroke-dashoffset: 0;
    opacity: 0.5;
    transform: rotate(-90deg);
    transform-origin: 18px 18px;
    animation: timeout-deplete var(--bubble-timeout, 15s) linear forwards;
  }

  .bubble-frame.streaming .timeout-progress,
  .bubble-frame:hover .timeout-progress {
    animation-play-state: paused;
  }

  .bubble-frame.streaming .timeout-spinner {
    opacity: 0;
  }
  .bubble-frame:not(.streaming) .timeout-spinner {
    transition: opacity 0.3s ease;
  }

  @keyframes timeout-deplete {
    from {
      stroke-dashoffset: 0;
      opacity: 0.5;
    }
    to {
      stroke-dashoffset: 100;
      opacity: 0.9;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .timeout-progress {
      animation: none;
      opacity: 0.3;
    }
  }
</style>
