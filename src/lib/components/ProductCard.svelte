<script lang="ts">
  import { formatMoney } from "$lib/money";
  import type { Product } from "$lib/shopping-engine";
  import { Heart, Star } from "@lucide/svelte";
  import Badge from "$lib/ui/Badge.svelte";
  import { useLists } from "$lib/stores/lists.svelte";

  let {
    product,
    highlighted = false,
    selected = false,
    userHighlighted = false,
    annotation = undefined as string | undefined,
    onClick,
  }: {
    product: Product;
    highlighted?: boolean;
    selected?: boolean;
    userHighlighted?: boolean;
    annotation?: string;
    onClick?: (product: Product) => void;
  } = $props();

  const lists = useLists();
  let imgError = $state(false);
  let stripViewport: HTMLDivElement | undefined = $state();
  let stripMeasure: HTMLSpanElement | undefined = $state();
  let stripOverflows = $state(false);


  function handleClick() { onClick?.(product); }

  function handleLike(e: MouseEvent) {
    e.stopPropagation();
    lists.toggleLike(product);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.(product);
    }
  }

  const hasDiscount = $derived(
    product.compareAtPrice != null && product.compareAtPrice > (product.price ?? 0)
  );
  const discountPct = $derived(
    hasDiscount && product.compareAtPrice
      ? Math.round(((product.compareAtPrice - (product.price ?? 0)) / product.compareAtPrice) * 100)
      : 0
  );
  const liked = $derived(lists.isLiked(product.id));
  const priced = $derived(product.price != null);

  // Price range for multi-variant products
  const variantPrices = $derived(
    (product.variants ?? [])
      .map(v => v.price)
      .filter((p): p is number => p != null)
  );
  const hasVariantPriceRange = $derived(
    variantPrices.length >= 2 && Math.min(...variantPrices) !== Math.max(...variantPrices)
  );
  const minVariantPrice = $derived(hasVariantPriceRange ? Math.min(...variantPrices) : 0);
  const maxVariantPrice = $derived(hasVariantPriceRange ? Math.max(...variantPrices) : 0);

  const stripAnnotation = $derived(
    annotation ?? (userHighlighted ? "Your pick" : "Top pick")
  );

  $effect(() => {
    const viewport = stripViewport;
    const measure = stripMeasure;
    const text = stripAnnotation;
    if (!viewport || !measure || !text) {
      stripOverflows = false;
      return;
    }

    const updateOverflow = () => {
      stripOverflows = measure.scrollWidth > viewport.clientWidth;
    };
    updateOverflow();

    const observer = new ResizeObserver(updateOverflow);
    observer.observe(viewport);
    observer.observe(measure);
    return () => observer.disconnect();
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="product-card-wrapper"
  class:highlighted
  class:user-highlighted={userHighlighted}
>
  <div
    onclick={handleClick}
    onkeydown={handleKeydown}
    role="button"
    aria-label="Open details for {product.name}"
    tabindex="0"
    class="product-card"
    class:selected
  >
    <!-- Image section -->
    <div class="product-card-image">
      {#if product.imageUrl && !imgError}
        <img
          src={product.imageUrl}
          alt={product.name}
          class="product-card-img"
          loading="lazy"
          onerror={() => (imgError = true)}
        />
      {:else}
        <div class="product-card-img-placeholder">
          <svg class="product-card-placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 01-8 0"/>
          </svg>
        </div>
      {/if}

      <!-- Badge stack -->
      <div class="product-card-badges">
        {#if hasDiscount}
          <Badge variant="destructive">-{discountPct}%</Badge>
        {/if}
        {#if product.stockLevel === "low"}
          <Badge variant="warning">Low stock</Badge>
        {:else if product.inStock === false}
          <Badge variant="destructive">Sold out</Badge>
        {/if}
      </div>

      <!-- Like button -->
      <button
        onclick={handleLike}
        type="button"
        class="product-card-like-btn"
        aria-label="Toggle liked"
      >
        <Heart class="h-3.5 w-3.5 {liked ? 'fill-[var(--color-destructive)] text-[var(--color-destructive)]' : 'text-white'}" />
      </button>
    </div>

    <!-- Info section -->
    <div class="product-card-info">
      <h3 class="product-card-name">{product.name}</h3>
      {#if product.category}
        <span class="product-card-category">{product.category}</span>
      {/if}
      <div class="product-card-price-row">
        <div class="product-card-price">
          {#if hasVariantPriceRange}
            <span class="product-card-price-value">
              {formatMoney(minVariantPrice, product.currency)} &ndash; {formatMoney(maxVariantPrice, product.currency)}
            </span>
          {:else if priced}
            <span class="product-card-price-value">{formatMoney(product.price, product.currency)}</span>
            {#if hasDiscount}
              <span class="product-card-compare-at">{formatMoney(product.compareAtPrice, product.currency)}</span>
            {/if}
          {:else}
            <span class="product-card-na">Price on request</span>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- Highlight strip -->
  {#if highlighted}
    <div class="product-card-strip" class:user-highlighted={userHighlighted}>
      <div class="product-card-strip-content" bind:this={stripViewport}>
        <span class="product-card-strip-measure" bind:this={stripMeasure} aria-hidden="true">
          {#if userHighlighted}
            <Heart class="product-card-strip-icon fill-current" />
          {:else}
            <Star class="product-card-strip-icon fill-current" />
          {/if}
          <span class="product-card-strip-text">{stripAnnotation}</span>
        </span>
        {#if stripOverflows}
          <span class="product-card-strip-track">
            <span class="product-card-strip-inner">
              {#if userHighlighted}
                <Heart class="product-card-strip-icon fill-current" />
              {:else}
                <Star class="product-card-strip-icon fill-current" />
              {/if}
              <span class="product-card-strip-text">{stripAnnotation}</span>
            </span>
            <span class="product-card-strip-inner" aria-hidden="true">
              {#if userHighlighted}
                <Heart class="product-card-strip-icon fill-current" />
              {:else}
                <Star class="product-card-strip-icon fill-current" />
              {/if}
              <span class="product-card-strip-text">{stripAnnotation}</span>
            </span>
          </span>
        {:else}
          <span class="product-card-strip-static">
            {#if userHighlighted}
              <Heart class="product-card-strip-icon fill-current" />
            {:else}
              <Star class="product-card-strip-icon fill-current" />
            {/if}
            <span class="product-card-strip-text">{stripAnnotation}</span>
          </span>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .product-card-wrapper {
    position: relative;
    padding: 6px;
    border-radius: calc(var(--radius-lg) + 6px);
    background: transparent;
    transition: background 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
    display: flex;
    flex-direction: column;
  }

  .product-card-wrapper.highlighted {
    background:
      radial-gradient(circle at 16% 10%, color-mix(in srgb, var(--color-primary) 45%, transparent), transparent 45%),
      linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 36%, transparent), color-mix(in srgb, var(--color-primary) 14%, transparent));
    box-shadow:
      0 0 0 1.5px color-mix(in srgb, var(--color-primary) 70%, transparent) inset,
      0 0 22px color-mix(in srgb, var(--color-primary) 34%, transparent),
      0 10px 28px color-mix(in srgb, var(--color-primary) 16%, transparent);
  }

  .product-card-wrapper.user-highlighted {
    background:
      radial-gradient(circle at 16% 10%, color-mix(in srgb, var(--color-accent) 45%, transparent), transparent 45%),
      linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 36%, transparent), color-mix(in srgb, var(--color-accent) 14%, transparent));
    box-shadow:
      0 0 0 1.5px color-mix(in srgb, var(--color-accent) 70%, transparent) inset,
      0 0 22px color-mix(in srgb, var(--color-accent) 34%, transparent),
      0 10px 28px color-mix(in srgb, var(--color-accent) 16%, transparent);
  }

  .product-card {
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    cursor: pointer;
    outline: none;
    overflow: hidden;
    transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
  }

  .product-card:hover {
    border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
  }

  .product-card-wrapper.highlighted .product-card {
    border-color: color-mix(in srgb, var(--color-primary) 78%, var(--color-border));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary) 38%, transparent);
  }

  .product-card-wrapper.user-highlighted .product-card {
    border-color: color-mix(in srgb, var(--color-accent) 78%, var(--color-border));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-accent) 38%, transparent);
  }

  .product-card.selected {
    box-shadow: 0 0 0 2px var(--color-primary);
  }

  .product-card-image {
    position: relative;
    aspect-ratio: 1 / 1;
    overflow: hidden;
    background: var(--color-muted);
  }

  .product-card-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease;
  }

  .product-card:hover .product-card-img {
    transform: scale(1.03);
  }

  .product-card-img-placeholder {
    display: flex;
    height: 100%;
    align-items: center;
    justify-content: center;
  }

  .product-card-placeholder-icon {
    width: 2rem;
    height: 2rem;
    color: var(--color-muted-foreground);
    opacity: 0.3;
  }

  .product-card-badges {
    position: absolute;
    left: 0.5rem;
    top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .product-card-like-btn {
    position: absolute;
    right: 0.5rem;
    top: 0.5rem;
    display: flex;
    height: 1.75rem;
    width: 1.75rem;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    background: rgb(0 0 0 / 0.5);
    -webkit-backdrop-filter: blur(4px);
    backdrop-filter: blur(4px);
    transition: transform 0.1s;
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .product-card-like-btn:active {
    transform: scale(0.8);
  }

  .product-card-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.75rem;
  }

  .product-card-name {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-clamp: 2;
    overflow: hidden;
    font-size: var(--fs-sm);
    font-weight: 500;
    line-height: 1.25;
    color: var(--color-foreground);
    margin: 0;
  }

  .product-card-category {
    font-size: var(--fs-xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-muted-foreground);
    opacity: 0.7;
  }

  .product-card-price-row {
    margin-top: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .product-card-price {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
  }

  .product-card-price-value {
    font-size: var(--fs-sm);
    font-weight: 700;
    color: var(--color-foreground);
  }

  .product-card-compare-at {
    font-size: 0.625rem;
    color: var(--color-muted-foreground);
    text-decoration: line-through;
  }

  .product-card-na {
    font-size: var(--fs-xs);
    font-weight: 600;
    color: var(--color-muted-foreground);
  }

  /* Highlight strip */
  .product-card-strip {
    padding: 0 6px;
    margin-top: 4px;
    color: var(--color-primary);
    font-size: var(--fs-xs);
    line-height: 1.5;
  }

  .product-card-strip.user-highlighted {
    color: var(--color-accent);
  }

  .product-card-strip-content {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 1.25rem;
    overflow: hidden;
    white-space: nowrap;
    border-radius: var(--radius-sm);
    text-shadow: 0 0 10px currentColor;
  }

  .product-card-strip-measure {
    position: absolute;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    visibility: hidden;
    pointer-events: none;
    white-space: nowrap;
  }

  .product-card-strip-static {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    max-width: 100%;
    font-weight: 700;
  }

  .product-card-strip-track {
    display: inline-flex;
    min-width: max-content;
    font-weight: 700;
    animation: scroll-text 15s linear infinite;
  }

  .product-card-strip:hover .product-card-strip-track {
    animation-play-state: paused;
  }

  .product-card-strip-inner {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding-right: 1rem;
  }

  /* Forwarded onto Lucide <Star/Heart class="product-card-strip-icon"> — :global() */
  .product-card-strip-inner :global(.product-card-strip-icon),
  .product-card-strip-static :global(.product-card-strip-icon),
  .product-card-strip-measure :global(.product-card-strip-icon) {
    height: 0.75rem;
    width: 0.75rem;
    flex-shrink: 0;
  }

  @keyframes scroll-text {
    0% { transform: translateX(0); }
    10% { transform: translateX(0); }
    90% { transform: translateX(-50%); }
    100% { transform: translateX(-50%); }
  }

  @media (prefers-reduced-motion: reduce) {
    .product-card-strip-track {
      animation: none;
    }

    .product-card:hover .product-card-img {
      transform: none;
    }
  }
</style>
