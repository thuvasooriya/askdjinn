<script lang="ts">
  import { flip } from "svelte/animate";
  import type { Product } from "$lib/shopping-engine";
  import { useUI } from "$lib/stores/ui.svelte";
  import { useInteraction } from "$lib/stores/interaction.svelte";
  import ProductCard from "./ProductCard.svelte";
  import { Layers, X, Search } from "@lucide/svelte";
  import BrailleSpinner from "$lib/ui/BrailleSpinner.svelte";

  let {
    onClickProduct,
  }: {
    onClickProduct: (product: Product) => void;
  } = $props();

  const ui = useUI();
  const interaction = useInteraction();

  let reduceMotion = $state(false);

  $effect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      reduceMotion = query.matches;
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  });

  let sortMode = $state<"picks" | "relevance" | "price-low" | "price-high">("picks");

  $effect(() => {
    const productId = ui.scrollToId;
    if (!productId) return;

    window.requestAnimationFrame(() => {
      const target = document.querySelector(`[data-product-id="${CSS.escape(productId)}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      ui.scrollToId = null;
    });
  });

  function sortedProducts(products: Product[]): Product[] {
    const sorted = sortMode === "price-low"
      ? [...products].sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
      : sortMode === "price-high"
      ? [...products].sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
      : [...products];
    const agentPicks: Product[] = [];
    const rest: Product[] = [];
    for (const p of sorted) {
      if (ui.highlightedIds.has(p.id)) agentPicks.push(p);
      else rest.push(p);
    }
    return [...agentPicks, ...rest];
  }
  // All highlighted products across every thread, deduped by id — pinned to
  // the top of the product pane so the best matches stay prominent regardless
  // of which query surfaced them.
  const highlightedProducts = $derived.by(() => {
    const seen = new Set<string>();
    const agentPicks: Product[] = [];
    for (const thread of ui.searchThreads) {
      for (const p of thread.products) {
        if (seen.has(p.id)) continue;
        if (ui.highlightedIds.has(p.id)) { seen.add(p.id); agentPicks.push(p); }
      }
    }
    return agentPicks;
  });
  function handleClick(product: Product) {
    interaction.onClick(product);
    ui.openProductDetail(product.id);
  }

  function removeThread(id: string) {
    ui.removeSearchThread(id);
  }

</script>

<div class="threads-tile" role="region" aria-label="Product search results">
  <div class="threads-header">
    <div class="threads-header-left">
      <Layers class="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
      <h2 class="threads-title">Products</h2>
      <span class="threads-count">{ui.searchThreads.length}</span>
    </div>
    <div class="threads-header-right">
      {#if ui.searchIsLoading}
        <span class="threads-loading"><BrailleSpinner name="scan" size="sm" label="Searching products" /> Searching</span>
      {/if}
      {#if ui.searchThreads.length > 0}
        <select bind:value={sortMode} class="sort-select" aria-label="Sort products">
          <option value="picks">Picks first</option>
          <option value="relevance">Relevance</option>
          <option value="price-low">Price: Low to High</option>
          <option value="price-high">Price: High to Low</option>
        </select>
      {/if}
    </div>
  </div>

  <div class="threads-scroll">
    {#if ui.searchThreads.length > 1 && highlightedProducts.length > 0}
      <div class="thread-grid highlights-grid">
        {#each highlightedProducts as product (product.id)}
          {@const isHighlighted = ui.highlightedIds.has(product.id)}

          {@const annotation = ui.annotations.get(product.id)}
          <div class="thread-product" data-product-id={product.id}>
            <ProductCard
              {product}
              highlighted={isHighlighted}

              {annotation}
              onClick={handleClick}
            />
          </div>
        {/each}
      </div>
    {/if}
    {#if ui.noResultsQuery}
      <div class="threads-no-results">
        <Search class="h-4 w-4" />
        <p>No results for <strong>{ui.noResultsQuery}</strong> — try a broader search or a different category.</p>
      </div>
    {/if}
    {#if ui.searchThreads.length === 0 && !ui.noResultsQuery}
      <div class="threads-empty">
        <Search class="h-6 w-6" />
        <p>Product results appear here after a search.</p>
      </div>
    {:else}
      {#each ui.searchThreads as thread (thread.id)}
        {@const productCount = thread.products.length}
        {@const pickCount = thread.products.filter(p => ui.highlightedIds.has(p.id)).length}
        <section class="thread-section">
          <div class="thread-bar">
            <span class="thread-query">{thread.query || "Search results"}</span>
            <span class="thread-stats">{productCount} results · {pickCount} picks</span>
            <button
              type="button"
              class="thread-close"
              onclick={() => removeThread(thread.id)}
              aria-label="Remove search thread"
            >
              <X class="h-3 w-3" />
            </button>
          </div>
          <div class="thread-grid">
            {#each sortedProducts(thread.products) as product (product.id)}
              {@const isHighlighted = ui.highlightedIds.has(product.id)}

              {@const annotation = ui.annotations.get(product.id)}
              <div class="thread-product" data-product-id={product.id} animate:flip={{ duration: reduceMotion ? 1 : 240 }}>
                <ProductCard
                  {product}
                  highlighted={isHighlighted}

                  {annotation}
                  onClick={handleClick}
                />
              </div>
            {/each}
          </div>
        </section>
      {/each}
    {/if}
  </div>
</div>

<style>
  .threads-tile {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .threads-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--panel-header-h);
    padding: 0 1rem;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }
  .threads-header-left { display: flex; align-items: center; gap: 0.375rem; }
  .threads-header-right { display: flex; align-items: center; gap: 0.5rem; }
  .threads-title {
    font-family: var(--font-display);
    font-size: var(--fs-xl);
    line-height: 1;
    font-weight: 700;
    color: var(--color-foreground);
  }
  .threads-count {
    font-size: var(--fs-xs);
    font-weight: 600;
    padding: 0.0625rem 0.375rem;
    border-radius: var(--radius-sm);
    background: var(--color-muted);
    color: var(--color-muted-foreground);
  }
  .threads-loading { display: inline-flex; align-items: center; gap: 0.25rem; font-size: var(--fs-xs); color: var(--color-primary); }

  .sort-select {
    font-size: var(--fs-xs);
    font-weight: 500;
    padding: 0.1875rem 0.5rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-muted);
    color: var(--color-foreground);
    cursor: pointer;
    outline: none;
  }
  .sort-select:hover { border-color: var(--color-primary); }

  .threads-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .threads-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    flex: 1;
    color: var(--color-muted-foreground);
    opacity: 0.4;
    font-size: var(--fs-md);
    text-align: center;
  }

  .threads-no-results {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    margin: 0.25rem 0 0.5rem;
    border-radius: var(--radius-md);
    background: var(--color-muted);
    color: var(--color-muted-foreground);
    font-size: var(--fs-sm);
  }
  .threads-no-results strong { color: var(--color-foreground); font-weight: 600; }

  .thread-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface-elevated);
    padding: 0.5rem;
    box-shadow: var(--shadow-card);
  }
  .highlights-grid {
    margin-bottom: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  .thread-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0.125rem;
  }
  .thread-query {
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--color-muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .thread-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-muted-foreground);
    cursor: pointer;
    transition: background 0.15s;
  }
  .thread-close:hover { background: var(--color-muted); color: var(--color-foreground); }
  .thread-stats {
    font-size: var(--fs-xs);
    color: var(--color-muted-foreground);
    white-space: nowrap;
  }

  .thread-grid {
    display: grid;
    /* auto-fit collapses empty tracks and lets 1fr distribute any
       leftover row width evenly across the actual cards, so a row of
       2 cards stretches to fill the width just as evenly as a row of
       6 — instead of auto-fill's fixed 180px cap, which left unused
       space at the end of a row. */
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    /* Cards are equal height by construction (see ProductCard.svelte:
       fixed image aspect-ratio + fixed title height + fixed price-row
       height), so start (not grid's default stretch) keeps that the
       source of truth rather than an implicit grid side effect. */
    align-items: start;
    gap: 0.5rem;
  }

  .thread-product {
    min-width: 0;
    /* Prevents a sparse row (e.g. 1-2 results) from stretching a card
       to the full row width; cards still fill available space via the
       grid's 1fr tracks, just capped at a sensible card width. */
    max-width: 220px;
    /*
      Grid items default to justify-items: stretch, meaning this element
      still occupies the full 1fr-stretched column width even though its
      own rendered box is capped at 220px by max-width above — and a
      block box narrower than its container left-aligns by default.
      That's the asymmetric look on narrow/single-column mobile viewports:
      one card sitting flush left with a large empty gap on the right.
      centering it within its own grid cell fixes that at every width,
      with no separate breakpoint needed — it's a no-op once the cell
      width is already at or below 220px.
    */
    justify-self: center;
    will-change: transform;
  }

  @media (prefers-reduced-motion: reduce) {
    .thread-product {
      will-change: auto;
    }
  }
</style>
