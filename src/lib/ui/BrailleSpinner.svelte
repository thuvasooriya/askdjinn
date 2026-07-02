<script lang="ts">
  import { SPINNERS, type SpinnerName, brailleToGrid } from "./spinners";

  let {
    name = "braille" as SpinnerName,
    label = "Loading",
    size = "md",
  }: {
    name?: SpinnerName;
    label?: string;
    size?: "sm" | "md" | "lg";
  } = $props();

  const spinner = $derived(SPINNERS[name] ?? SPINNERS.braille);
  const frames = $derived(spinner.frames);
  const interval = $derived(spinner.interval);
  let frame = $state(0);

  const grid = $derived(brailleToGrid(frames[frame] ?? ""));

  $effect(() => {
    frame = 0;
    const timer = window.setInterval(() => {
      frame = (frame + 1) % frames.length;
    }, interval);
    return () => window.clearInterval(timer);
  });
</script>

<span class="braille-spinner braille-spinner--{size}" role="status" aria-label={label} title={label}>
  {#if grid && grid[0]}
    <svg
      viewBox="0 0 {grid[0].length * 4} 16"
      class="spinner-svg"
    >
      {#each grid as row, r}
        {#each row as active, c}
          <circle
            cx={c * 4 + 2}
            cy={r * 4 + 2}
            r="1.15"
            fill="currentColor"
            opacity={active ? 1 : 0.12}
          />
        {/each}
      {/each}
    </svg>
  {/if}
</span>


<style>
  .braille-spinner {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--color-primary);
    vertical-align: middle;
  }

  .spinner-svg {
    height: 1em;
    width: auto;
    display: block;
  }

  .braille-spinner--sm { font-size: 0.875rem; }
  .braille-spinner--md { font-size: 1rem; }
  .braille-spinner--lg { font-size: 1.25rem; }

  @media (prefers-reduced-motion: reduce) {
    .braille-spinner { opacity: 0.85; }
  }
</style>
