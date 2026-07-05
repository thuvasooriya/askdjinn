<script lang="ts">
  // Inline card shown when cart_add completes. Resolves product names from the
  // UI product registry at render time (the tool result only carries IDs).

  import { ShoppingCart, Check, AlertTriangle, X } from "@lucide/svelte";
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

<div
  class="cac"
  class:cac--error={!!error}
  class:cac--partial={partial && !error}
>
  <div class="cac-left">
    <div class="cac-header">
      {#if error}
        <AlertTriangle class="cac-icon cac-icon--warn" />
        <span class="cac-title">Couldn't add to cart</span>
      {:else if partial}
        <AlertTriangle class="cac-icon cac-icon--warn" />
        <span class="cac-title">{successCount} of {results.length} added</span>
      {:else}
        <ShoppingCart class="cac-icon cac-icon--ok" />
        <span class="cac-title">Added to cart</span>
      {/if}
      {#if !error && results.length > 1}
        <span class="cac-badge">{results.length}</span>
      {/if}
    </div>
    {#if error}
      <p class="cac-detail">{error}</p>
    {:else}
      <div class="cac-items">
        {#each items as item, i (`${item.name}-${i}`)}
          <div class="cac-item" class:cac-item--fail={!item.added}>
            {#if item.added}
              <Check class="cac-check" />
            {:else}
              <X class="cac-cross" />
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

  {#if !error && successCount > 0}
    <div class="cac-right">
      <div class="cac-count-col">
        <span class="cac-count-num cac-count-num--ok">{successCount}</span>
        <Check class="cac-count-icon" />
      </div>
    </div>
  {/if}
</div>

<style>
  .cac {
    display: inline-flex;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    border: 1px solid color-mix(in srgb, var(--color-success) 30%, var(--color-border));
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-success) 5%, var(--color-surface));
    font-size: var(--fs-xs);
    line-height: 1.3;
    margin: 0.125rem 0;
    align-items: center;
  }
  .cac--partial {
    border-color: color-mix(in srgb, var(--color-warning, #f59e0b) 30%, var(--color-border));
    background: color-mix(in srgb, var(--color-warning, #f59e0b) 5%, var(--color-surface));
  }
  .cac--error {
    border-color: color-mix(in srgb, var(--color-destructive) 30%, var(--color-border));
    background: color-mix(in srgb, var(--color-destructive) 5%, var(--color-surface));
  }

  .cac-left {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .cac-header {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  :global(.cac-icon) { width: 0.875rem; height: 0.875rem; flex-shrink: 0; }
  :global(.cac-icon--ok) { color: var(--color-success); }
  :global(.cac-icon--warn) { color: var(--color-warning, #f59e0b); }

  .cac-title {
    font-weight: 600;
    white-space: nowrap;
  }

  .cac-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.125rem;
    height: 1.125rem;
    padding: 0 0.25rem;
    border-radius: var(--radius-full);
    background: color-mix(in srgb, var(--color-success) 20%, transparent);
    color: var(--color-success);
    font-size: var(--fs-2xs);
    font-weight: 700;
    line-height: 1;
  }
  .cac--partial .cac-badge {
    background: color-mix(in srgb, var(--color-warning, #f59e0b) 20%, transparent);
    color: var(--color-warning, #f59e0b);
  }

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
  :global(.cac-cross) { width: 0.75rem; height: 0.75rem; color: var(--color-destructive); flex-shrink: 0; }
  .cac-item--fail .cac-name {
    color: var(--color-muted-foreground);
    text-decoration: line-through;
  }

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

  .cac-right {
    display: flex;
    align-items: center;
    padding-left: 0.5rem;
    border-left: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
  }

  .cac-count-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
  }
  .cac-count-num {
    font-weight: 700;
    font-size: var(--fs-sm);
    line-height: 1;
  }
  .cac-count-num--ok { color: var(--color-success); }
  :global(.cac-count-icon) { width: 0.75rem; height: 0.75rem; color: var(--color-success); }
</style>
