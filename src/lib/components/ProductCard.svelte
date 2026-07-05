<script lang="ts">
  import { formatMoney } from "$lib/money";
  import { proxiedSrc } from "$lib/image";
  import type { Product } from "$lib/shopping-engine";
  import { AlertTriangle, Heart, Star } from "@lucide/svelte";
  import Badge from "$lib/ui/Badge.svelte";
  import { useLists } from "$lib/stores/lists.svelte";
  import { toasts } from "$lib/ui/toast";

  let {
    product,
    highlighted = false,
    selected = false,
    annotation = undefined as string | undefined,

    onClick,
  }: {
    product: Product;
    highlighted?: boolean;
    selected?: boolean;

    annotation?: string;
    onClick?: (product: Product) => void;
  } = $props();

  const lists = useLists();

  let imgError = $state(false);
  let lowStockTipOpen = $state(false);
  let highlightTextEl = $state<HTMLSpanElement | null>(null);
  let highlightTextOverflow = $state(false);
  let nameEl = $state<HTMLHeadingElement | null>(null);
  let nameMeasureEl = $state<HTMLSpanElement | null>(null);
  let displayName = $state("");

  function handleClick() {
    onClick?.(product);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.(product);
    }
  }

  function handleLike(e: MouseEvent) {
    e.stopPropagation();
    const wasLiked = lists.isLiked(product.id);
    lists.toggleLike(product);
    toasts.success(wasLiked ? "Removed from wishlist" : "Added to wishlist");
  }

  function toggleLowStockTip(e: MouseEvent) {
    e.stopPropagation();
    lowStockTipOpen = !lowStockTipOpen;
  }

  function closeLowStockTip() {
    lowStockTipOpen = false;
  }

  const liked = $derived(lists.isLiked(product.id));
  const priced = $derived(product.price != null);

  const hasDiscount = $derived(
    product.compareAtPrice != null && product.compareAtPrice > (product.price ?? 0)
  );
  const discountPct = $derived(
    hasDiscount && product.compareAtPrice
      ? Math.round(((product.compareAtPrice - (product.price ?? 0)) / product.compareAtPrice) * 100)
      : 0
  );

  // Price range for multi-variant products
  const variantPrices = $derived(
    (product.variants ?? []).map((v) => v.price).filter((p): p is number => p != null)
  );
  const hasVariantPriceRange = $derived(
    variantPrices.length >= 2 && Math.min(...variantPrices) !== Math.max(...variantPrices)
  );
  const minVariantPrice = $derived(hasVariantPriceRange ? Math.min(...variantPrices) : 0);
  const maxVariantPrice = $derived(hasVariantPriceRange ? Math.max(...variantPrices) : 0);

  const stripAnnotation = $derived(annotation ?? "Top pick");

  // Character-based title truncation.
  //
  // CSS line-clamp + a fixed height is the first line of defense (see
  // .product-card-name below) and is enough in most browsers. This effect
  // is a belt-and-braces fallback that guarantees a hard 2-line limit
  // regardless of -webkit-line-clamp support, font metrics, or any CSS
  // cascade issue elsewhere in the app: it measures the real rendered
  // text against a hidden clone of the same box and binary-searches the
  // longest prefix (plus an ellipsis) that actually fits, re-running
  // whenever the card is resized (e.g. responsive column width changes).
  $effect(() => {
    const fullText = product.name;
    const visible = nameEl;
    const measure = nameMeasureEl;

    if (!visible || !measure) {
      displayName = fullText;
      return;
    }

    const fit = () => {
      const maxHeight = visible.clientHeight;
      measure.textContent = fullText;

      if (measure.scrollHeight <= maxHeight + 1) {
        displayName = fullText;
        return;
      }

      let lo = 0;
      let hi = fullText.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        measure.textContent = `${fullText.slice(0, mid).trimEnd()}…`;
        if (measure.scrollHeight <= maxHeight + 1) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      displayName = lo > 0 ? `${fullText.slice(0, lo).trimEnd()}…` : "…";
    };

    fit();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(measure);
    return () => observer.disconnect();
  });

  $effect(() => {
    const textEl = highlightTextEl;
    if (!highlighted || !textEl || typeof ResizeObserver === "undefined") {
      highlightTextOverflow = false;
      return;
    }

    const measureMarquee = () => {
      highlightTextOverflow = textEl.scrollWidth > textEl.clientWidth + 2;
    };
    measureMarquee();

    const observer = new ResizeObserver(measureMarquee);
    observer.observe(textEl);
    return () => observer.disconnect();
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="product-card-wrapper" class:highlighted>
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
          <svg
            class="product-card-placeholder-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 01-8 0" />
          </svg>
        </div>
      {/if}

      <!-- Badge stack -->
      <div class="product-card-badges">
        {#if hasDiscount}
          <Badge variant="destructive">-{discountPct}%</Badge>
        {/if}
        {#if false /* low stock indicator disabled for now */}
          <button
            type="button"
            class="product-card-stock-badge"
            aria-label="Low stock"
            aria-describedby={lowStockTipOpen ? `stock-tip-${product.id}` : undefined}
            onclick={toggleLowStockTip}
            onblur={closeLowStockTip}
          >
            <AlertTriangle class="product-card-stock-icon" />
          </button>
          <span
            id={`stock-tip-${product.id}`}
            class="product-card-stock-tooltip"
            class:visible={lowStockTipOpen}
            role="tooltip"
          >
            Low stock
          </span>
        {:else if product.inStock === false}
          <Badge variant="destructive">Sold out</Badge>
        {/if}
      </div>

      {#if highlighted}
        <div
          class="product-card-highlight-chip"
          title={stripAnnotation}
          aria-label="Agent pick: {stripAnnotation}"
        >
          <Star class="product-card-highlight-icon fill-current" />

          <span
            class="product-card-highlight-text"
            class:scrolling={highlightTextOverflow}
            bind:this={highlightTextEl}
          >
            <span class="product-card-highlight-marquee">{stripAnnotation}</span>
          </span>
        </div>
      {/if}
    </div>

    <!-- Info section -->
    <div class="product-card-info">
      <div class="product-card-name-wrap">
        <h3 class="product-card-name" title={product.name} bind:this={nameEl}>{displayName}</h3>
        <span class="product-card-name product-card-name-measure" aria-hidden="true" bind:this={nameMeasureEl}></span>
      </div>
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
        <button onclick={handleLike} type="button" class="product-card-like-btn" aria-label="Toggle liked">
          <Heart class="h-3.5 w-3.5 {liked ? 'fill-[var(--color-destructive)] text-[var(--color-destructive)]' : 'text-white'}" />
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  /*
    Local design tokens.
    A small, named spacing/radius scale keeps every rule below free of
    magic numbers and makes future tweaks a one-line change instead of
    a find-and-replace across the file.
  */
  .product-card-wrapper {
    --space-1: 0.25rem;
    --space-2: 0.375rem;
    --space-3: 0.5rem;
    --space-4: 0.625rem;
    --card-radius: var(--radius-lg);
    --card-radius-outer: calc(var(--radius-lg) + 4px);

    /* Accent defaults to "agent pick". All highlighted rules read from this
       single variable instead of duplicating a whole ruleset per state. */
    --accent: var(--color-primary);

    position: relative;
    display: flex;
    flex-direction: column;
    padding: 4px;
    border: 1px solid transparent;
    border-radius: var(--card-radius-outer);
    background:
      linear-gradient(var(--color-background), var(--color-background)) padding-box,
      linear-gradient(color-mix(in srgb, var(--color-border) 70%, transparent), transparent) border-box;
    transition: background 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
  }



  .product-card-wrapper.highlighted {
    background:
      linear-gradient(
        color-mix(in srgb, var(--color-surface) 92%, var(--accent) 4%),
        color-mix(in srgb, var(--color-surface) 96%, transparent)
      ) padding-box,
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--accent) 78%, transparent),
        color-mix(in srgb, var(--color-primary) 36%, transparent)
      ) border-box;
  }

  .product-card {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--color-border);
    border-radius: var(--card-radius);
    background:
      radial-gradient(circle at 14% 8%, color-mix(in srgb, var(--color-primary) 13%, transparent), transparent 34%),
      linear-gradient(145deg, color-mix(in srgb, var(--color-surface) 94%, var(--color-accent) 6%), var(--color-surface) 62%);
    cursor: pointer;
    outline: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease, background 0.2s ease;
  }

  .product-card:hover {
    border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
    transform: translateY(-1px);
  }

  .product-card.selected {
    box-shadow: 0 0 0 2px var(--color-primary);
  }

  .product-card-wrapper.highlighted .product-card {
    border-width: 2px;
    border-color: color-mix(in srgb, var(--accent) 76%, var(--color-border));
    background: color-mix(in srgb, var(--color-surface) 96%, var(--accent) 4%);
  }

  /* Image */

  .product-card-image {
    position: relative;
    flex: 0 0 auto;
    aspect-ratio: 1 / 1;
    overflow: hidden;
    background: var(--color-muted);
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

  /* Badges */

  .product-card-badges {
    position: absolute;
    top: var(--space-3);
    left: var(--space-3);
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
  }

  .product-card-stock-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-warning);
    cursor: help;
  }

  /* Forwarded onto Lucide <AlertTriangle class="product-card-stock-icon"> — :global() */
  .product-card-stock-badge :global(.product-card-stock-icon) {
    flex: 0 0 auto;
    width: 1.05rem;
    height: 1.05rem;
  }

  .product-card-stock-badge:hover + .product-card-stock-tooltip,
  .product-card-stock-badge:focus-visible + .product-card-stock-tooltip,
  .product-card-stock-tooltip.visible {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .product-card-stock-tooltip {
    position: absolute;
    top: calc(100% + 0.375rem);
    left: 0;
    z-index: 5;
    width: max-content;
    max-width: 9rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid color-mix(in srgb, var(--color-warning) 42%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-background) 86%, black 14%);
    color: var(--color-foreground);
    font-size: var(--fs-xs);
    font-weight: 650;
    line-height: 1.2;
    box-shadow: 0 10px 24px rgb(0 0 0 / 0.32);
    opacity: 0;
    transform: translateY(-2px);
    pointer-events: none;
    transition: opacity 0.14s ease, transform 0.14s ease;
  }

  /* Highlight chip */

  .product-card-highlight-chip {
    position: absolute;
    right: var(--space-3);
    bottom: var(--space-3);
    left: var(--space-3);
    z-index: 2;
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: var(--space-2);
    padding: 0.3125rem var(--space-3);
    border: 1px solid color-mix(in srgb, var(--accent) 34%, transparent);
    border-radius: var(--radius-full);
    background:
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--color-surface) 88%, var(--accent) 12%),
        color-mix(in srgb, var(--color-surface) 76%, transparent)
      );
    color: var(--accent);
    box-shadow:
      0 10px 24px rgb(0 0 0 / 0.28),
      inset 0 1px 0 rgb(255 255 255 / 0.08);
    -webkit-backdrop-filter: blur(14px) saturate(150%);
    backdrop-filter: blur(14px) saturate(150%);
    animation: highlight-chip-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* Forwarded onto Lucide <Star/Heart class="product-card-highlight-icon"> — :global() */
  .product-card-highlight-chip :global(.product-card-highlight-icon) {
    flex-shrink: 0;
    width: 0.8125rem;
    height: 0.8125rem;
  }

  .product-card-highlight-text {
    --highlight-text-window: 7.5rem;
    min-width: 0;
    overflow: hidden;
    color: currentColor;
    font-size: var(--fs-xs);
    font-weight: 750;
    line-height: 1.1;
    white-space: nowrap;
  }

  .product-card-highlight-marquee {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: bottom;
  }

  .product-card-highlight-text.scrolling .product-card-highlight-marquee {
    max-width: none;
    padding-right: 1.25rem;
    overflow: visible;
    text-overflow: clip;
    animation: highlight-text-marquee 5.5s linear infinite alternate;
  }

  /* Info / price */

  .product-card-info {
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: flex-start;
    min-height: 0;
  }

  .product-card-name-wrap {
    position: relative;
  }

  .product-card-name {
    /* Standards-based 2-line clamp: the -webkit- box/line-clamp pair is
       required for Safari; the unprefixed line-clamp is the modern
       equivalent for Chromium/Firefox. Both are kept for compatibility. */
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow-wrap: break-word;
    word-break: break-word;

    /*
      Fixed height — not max-height, not min-height. Two things both
      depend on this being an exact, unconditional value:
      1. Equal card heights: a max-height would let a 1-line title
         collapse shorter than a 2-line title, making cards uneven
         again. A fixed height reserves identical space regardless of
         how many lines the title actually uses.
      2. Guaranteed 2-line clipping: paired with overflow: hidden, a
         fixed height hard-clips anything past 2 lines no matter what —
         even if -webkit-line-clamp isn't honored by the rendering
         engine, or before the JS truncation effect below has run.
      flex: 0 0 auto stops this flex item (child of the column in
      .product-card-info) from being resized by flex's own sizing
      algorithm, which is what let content escape the box in the first
      place. box-sizing: content-box keeps the height math (2 lines)
      exact regardless of any global border-box reset elsewhere in
      the app.
    */
    height: calc(1.25em * 2);
    box-sizing: content-box;
    flex: 0 0 auto;
    margin: 0;
    padding: var(--space-3) var(--space-4) var(--space-2);
    color: var(--color-foreground);
    font-size: var(--fs-md);
    font-weight: 500;
    line-height: 1.25;
  }

  /*
    Must come after .product-card-name (equal specificity — source order
    decides) so these resets actually win and the clone can grow to its
    full, real height for accurate measurement.
  */
  .product-card-name-measure {
    position: absolute;
    inset: 0 0 auto 0;
    display: block;
    height: auto;
    overflow: visible;
    visibility: hidden;
    pointer-events: none;
    z-index: -1;
    -webkit-line-clamp: unset;
    line-clamp: unset;
  }

  .product-card-price-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    /* No right padding: the like button is meant to sit flush against
       the card's right edge (see its border-radius, which only rounds
       the outer corner). Padding here would inset it and break that. */
    padding: 0 0 0 var(--space-4);
    margin-left: var(--space-4);
    border-radius: var(--card-radius) 0 0 0;
    background: var(--color-surface-elevated);
    }

  .product-card-price {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1);
    min-width: 0;
    /* Small right gap so wrapped/long price text never touches the
       like button now that the row has no right padding of its own. */
    padding-right: var(--space-2);
  }

  .product-card-price-value {
    color: var(--color-foreground);
    font-size: var(--fs-sm);
    font-weight: 700;
  }

  .product-card-compare-at {
    color: var(--color-muted-foreground);
    font-size: 0.625rem;
    text-decoration: line-through;
  }

  .product-card-na {
    color: var(--color-muted-foreground);
    font-size: var(--fs-xs);
    font-weight: 600;
  }

  .product-card-like-btn {
    display: flex;
    flex: 0 0 auto;
    align-self: stretch;
    align-items: center;
    justify-content: center;
    width: 2.625rem;
    height: 2.5rem;
    border: 0;
    border-left: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
    border-radius: var(--card-radius) 0 var(--card-radius) 0;
    background: var(--color-muted);
    color: var(--color-foreground);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    cursor: pointer;
    transition: background 0.16s ease, transform 0.1s ease, color 0.16s ease;
  }

  .product-card-like-btn:hover {
    background: color-mix(in srgb, var(--color-muted) 82%, var(--color-primary) 18%);
    color: var(--color-primary);
  }

  .product-card-like-btn:active {
    transform: scale(0.8);
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

  @keyframes highlight-text-marquee {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(calc(-100% + var(--highlight-text-window)));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .product-card-highlight-chip {
      animation: none;
    }

    .product-card-highlight-text.scrolling .product-card-highlight-marquee {
      animation: none;
    }

    .product-card:hover,
    .product-card:hover .product-card-img {
      transform: none;
    }
  }
</style>
