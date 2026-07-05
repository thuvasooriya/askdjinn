<script lang="ts">
  // Renders a contiguous text run from the current turn as markdown.
  // Grows live during streaming; the collapse ring (provided by BubbleFrame)
  // pauses while streaming and counts down once the turn completes.

  import type { TextSegment } from "$lib/stores/bubble-feed";
  import { renderMarkdown } from "$lib/markdown";
  import BubbleFrame from "./BubbleFrame.svelte";

  let { segment, onTimeout }: { segment: TextSegment; onTimeout: () => void } = $props();
</script>

<BubbleFrame timeout={15000} streaming={segment.streaming} {onTimeout}>
  <div class="text-bubble glass shadow-md">
    <div class="prose prose-sm dark:prose-invert bubble-text">
      {@html renderMarkdown(segment.text)}
    </div>
  </div>
</BubbleFrame>

<style>
  .text-bubble {
    width: min(440px, calc(100vw - 2rem));
    max-height: 200px;
    overflow-y: auto;
    border-radius: var(--radius-xl);
    border: 1px solid var(--color-border-subtle);
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 6%, transparent), transparent 60%),
      color-mix(in srgb, var(--color-surface) 72%, transparent);
    backdrop-filter: blur(18px) saturate(140%);
    -webkit-backdrop-filter: blur(18px) saturate(140%);
    padding: 0.75rem 0.875rem;
    box-shadow: var(--shadow-float);
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
