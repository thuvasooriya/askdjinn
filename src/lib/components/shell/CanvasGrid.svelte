<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    gridClass,
    children
  }: {
    gridClass: string;
    children: Snippet;
  } = $props();
</script>

<div class="tiles {gridClass}">
  {@render children()}
</div>

<style>
  .tiles {
    display: flex;
    padding: 0.75rem;
    height: 100dvh;
    width: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .tiles :global(.split),
  .tiles :global(.tile-host) {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  :global(.grid-home) {
    align-items: center;
    justify-content: center;
  }

  :global(.grid-mobile) {
    padding: 0.75rem;
    padding-bottom: 9.5rem;
  }
</style>
