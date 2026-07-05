<script lang="ts">
  // Renders a contiguous text run from the current turn as markdown.
  // Grows live during streaming; the collapse ring (provided by BubbleFrame)
  // pauses while streaming and counts down once the turn completes.
  // Auto-scrolls to bottom when new text arrives mid-stream.

  import type { TextSegment } from "$lib/stores/bubble-feed";
  import { renderMarkdown } from "$lib/markdown";
  import BubbleFrame from "./BubbleFrame.svelte";

  let { segment, onTimeout }: { segment: TextSegment; onTimeout: () => void } = $props();

  let bubbleEl: HTMLDivElement | undefined = $state();

  // Auto-scroll to bottom when text grows during streaming
  $effect(() => {
    segment.text; // track text changes
    if (segment.streaming && bubbleEl) {
      bubbleEl.scrollTop = bubbleEl.scrollHeight;
    }
  });
</script>

<BubbleFrame timeout={15000} streaming={segment.streaming} {onTimeout}>
  <div class="text-bubble glass shadow-md" bind:this={bubbleEl}>
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
    padding: 0.75rem 0.875rem;
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
