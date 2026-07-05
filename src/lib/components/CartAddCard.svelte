<script lang="ts">
  // Inline card shown when cart_add completes. Resolves product names from the
  // UI product registry at render time (the tool result only carries IDs).

  import { ShoppingCart, Check, AlertTriangle } from "@lucide/svelte";
  import { useUI } from "$lib/stores/ui.svelte";

  let {
    results,
    partial = false,
    error,
  }: {
    results: Array<{ product_id: string; quantity: number; added: boolean }>;
    partial?: boolean;
    error?: string;
  } = $props();

  const ui = useUI();

  const items = $derived(
    results.map((r) => ({
      name: ui.productRegistry.get(r.product_id)?.name ?? r.product_id,
      quantity: r.quantity,
      added: r.added,
    })),
  );
  const successCount = $derived(results.filter((r) => r.added).length);
</script>

<div class="cac" class:cac--error={!!error} class:cac--partial={partial && !error}>
  <div class="cac-header">
    {#if error}
      <AlertTriangle class="cac-icon cac-icon--warn" />
      <span>Couldn't add to cart</span>
    {:else if partial}
      <AlertTriangle class="cac-icon cac-icon--warn" />
      <span>{successCount} of {results.length} added</span>
    {:else}
      <ShoppingCart class="cac-icon cac-icon--ok" />
      <span>Added to cart</span>
    {/if}
  </div>
  {#if error}
    <p class="cac-detail">{error}</p>
  {:else}
    <div class="cac-items">
      {#each items as item, i (`${item.name}-${i}`)}
        <div class="cac-item">
          {#if item.added}
            <Check class="cac-check" />
          {/if}
          <span class="cac-name">{item.name}</span>
          {#if item.quantity > 1}
            <span class="cac-qty">x{item.quantity}</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .cac {
    display: inline-flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.375rem 0.5rem;
    border: 1px solid color-mix(in srgb, var(--color-success) 30%, var(--color-border));
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-success) 5%, var(--color-surface));
    font-size: var(--fs-xs);
    line-height: 1.3;
  }
  .cac--partial {
    border-color: color-mix(in srgb, var(--color-warning, #f59e0b) 30%, var(--color-border));
    background: color-mix(in srgb, var(--color-warning, #f59e0b) 5%, var(--color-surface));
  }
  .cac--error {
    border-color: color-mix(in srgb, var(--color-destructive) 30%, var(--color-border));
    background: color-mix(in srgb, var(--color-destructive) 5%, var(--color-surface));
  }

  .cac-header {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-weight: 600;
  }
  :global(.cac-icon) { width: 0.875rem; height: 0.875rem; flex-shrink: 0; }
  :global(.cac-icon--ok) { color: var(--color-success); }
  :global(.cac-icon--warn) { color: var(--color-warning, #f59e0b); }

  .cac-detail {
    color: var(--color-muted-foreground);
    font-size: var(--fs-2xs);
    margin: 0;
  }

  .cac-items {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .cac-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  :global(.cac-check) { width: 0.75rem; height: 0.75rem; color: var(--color-success); flex-shrink: 0; }
  .cac-name {
    color: var(--color-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cac-qty {
    color: var(--color-muted-foreground);
    font-size: var(--fs-2xs);
    flex-shrink: 0;
  }
</style>
