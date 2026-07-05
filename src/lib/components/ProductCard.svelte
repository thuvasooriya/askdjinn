<script lang="ts">
  import { formatMoney } from "$lib/money";
  import { proxiedSrc } from "$lib/image";
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
          src={proxiedSrc(product.imageUrl)}
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

      {#if highlighted}
        <div
          class="product-card-highlight-chip"
          class:user-highlighted={userHighlighted}
          title={stripAnnotation}
          aria-label={userHighlighted ? `Your pick: ${stripAnnotation}` : `Agent pick: ${stripAnnotation}`}
        >
          {#if userHighlighted}
            <Heart class="product-card-highlight-icon fill-current" />
          {:else}
            <Star class="product-card-highlight-icon fill-current" />
          {/if}
          <span class="product-card-highlight-text">{stripAnnotation}</span>
        </div>
      {/if}
    </div>

    <!-- Info section -->
    <div class="product-card-info">
      <h3 class="product-card-name" title={product.name}>{product.name}</h3>
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
        <button
          onclick={handleLike}
          type="button"
          class="product-card-like-btn"
          aria-label="Toggle liked"
        >
          <Heart class="h-3.5 w-3.5 {liked ? 'fill-[var(--color-destructive)] text-[var(--color-destructive)]' : 'text-white'}" />
        </button>
      </div>
    </div>
  </div>

</div>

<style>
  .product-card-wrapper {
    position: relative;
    padding: 4px;
    border-radius: calc(var(--radius-lg) + 4px);
    background:
      linear-gradient(var(--color-background), var(--color-background)) padding-box,
      linear-gradient(color-mix(in srgb, var(--color-border) 70%, transparent), transparent) border-box;
    transition: background 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
    display: flex;
    flex-direction: column;
    border: 1px solid transparent;
  }

  .product-card-wrapper.highlighted {
    background:
      linear-gradient(color-mix(in srgb, var(--color-surface) 92%, var(--color-primary) 4%), color-mix(in srgb, var(--color-surface) 96%, transparent)) padding-box,
      linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 78%, transparent), color-mix(in srgb, var(--color-accent) 42%, transparent)) border-box;
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--color-primary) 18%, transparent),
      0 12px 30px color-mix(in srgb, var(--color-primary) 12%, transparent);
  }

  .product-card-wrapper.user-highlighted {
    background:
      linear-gradient(color-mix(in srgb, var(--color-surface) 92%, var(--color-accent) 4%), color-mix(in srgb, var(--color-surface) 96%, transparent)) padding-box,
      linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 78%, transparent), color-mix(in srgb, var(--color-primary) 36%, transparent)) border-box;
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--color-accent) 18%, transparent),
      0 12px 30px color-mix(in srgb, var(--color-accent) 12%, transparent);
  }

  .product-card {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 16.75rem;
    min-height: 16.75rem;
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    cursor: pointer;
    outline: none;
    overflow: hidden;
    transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease, background 0.2s ease;
  }

  .product-card:hover {
    border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
    transform: translateY(-1px);
  }

  .product-card-wrapper.highlighted .product-card {
    border-color: color-mix(in srgb, var(--color-primary) 48%, var(--color-border));
    background: color-mix(in srgb, var(--color-surface) 96%, var(--color-primary) 4%);
  }

  .product-card-wrapper.user-highlighted .product-card {
    border-color: color-mix(in srgb, var(--color-accent) 48%, var(--color-border));
    background: color-mix(in srgb, var(--color-surface) 96%, var(--color-accent) 4%);
  }

  .product-card.selected {
    box-shadow: 0 0 0 2px var(--color-primary);
  }

  .product-card-image {
    position: relative;
    flex: 0 0 auto;
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
    display: flex;
    height: 1.875rem;
    width: 1.875rem;
    flex: 0 0 auto;
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

  .product-card-highlight-chip {
    position: absolute;
    left: 0.5rem;
    right: 0.5rem;
    bottom: 0.5rem;
    z-index: 2;
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 0.375rem;
    border-radius: var(--radius-full);
    border: 1px solid color-mix(in srgb, var(--color-primary) 34%, transparent);
    background:
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--color-surface) 88%, var(--color-primary) 12%),
        color-mix(in srgb, var(--color-surface) 76%, transparent)
      );
    color: var(--color-primary);
    padding: 0.3125rem 0.5rem;
    box-shadow:
      0 10px 24px rgb(0 0 0 / 0.28),
      inset 0 1px 0 rgb(255 255 255 / 0.08);
    -webkit-backdrop-filter: blur(14px) saturate(150%);
    backdrop-filter: blur(14px) saturate(150%);
    animation: highlight-chip-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .product-card-highlight-chip.user-highlighted {
    border-color: color-mix(in srgb, var(--color-accent) 36%, transparent);
    background:
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--color-surface) 88%, var(--color-accent) 12%),
        color-mix(in srgb, var(--color-surface) 76%, transparent)
      );
    color: var(--color-accent);
  }

  .product-card-image::after {
    content: "";
    position: absolute;
    inset: auto 0 0;
    height: 35%;
    background: linear-gradient(to top, rgb(0 0 0 / 0.44), transparent);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }

  .product-card-wrapper.highlighted .product-card-image::after {
    opacity: 1;
  }

  /* Forwarded onto Lucide <Star/Heart class="product-card-highlight-icon"> — :global() */
  .product-card-highlight-chip :global(.product-card-highlight-icon) {
    height: 0.8125rem;
    width: 0.8125rem;
    flex-shrink: 0;
  }

  .product-card-highlight-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--fs-xs);
    font-weight: 750;
    line-height: 1.1;
    color: currentColor;
  }

  .product-card-info {
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: space-between;
    gap: 0.5rem;
    min-height: 0;
    padding: 0.625rem;
  }

  .product-card-name {
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: var(--fs-md);
    font-weight: 500;
    line-height: 1.25;
    height: 2.5em;
    max-height: 2.5em;
    color: var(--color-foreground);
    margin: 0;
  }

  .product-card-price-row {
    min-height: 1.875rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .product-card-price {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
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

  @keyframes highlight-chip-in {
    from {
      opacity: 0;
      transform: translateY(4px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .product-card-highlight-chip {
      animation: none;
    }

    .product-card:hover,
    .product-card:hover .product-card-img {
      transform: none;
    }
  }
</style>
