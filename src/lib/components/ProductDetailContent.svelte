<script lang="ts">
  import { formatMoney } from "$lib/money";
  import { proxiedSrc } from "$lib/image";
  import type { Product } from "$lib/shopping-engine";
  import { untrack } from "svelte";
  import { fade } from "svelte/transition";
  import {
    ShoppingBag,
    Check,
    ExternalLink,
    Truck,
    Heart,
    Globe,
    Maximize2,
    Play,
    Pause,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
  } from "@lucide/svelte";
  import { useLists } from "$lib/stores/lists.svelte";
  import { toasts } from "$lib/ui/toast";

  let {
    product = null as Product | null,
    onAdd,
    onGalleryOpen,
    aspect = "portrait" as "compact" | "portrait" | "landscape" | "square",
  }: {
    product?: Product | null;
    onAdd?: (product: Product, sourceEl: HTMLElement | null) => void;
    onGalleryOpen?: (images: string[], index: number) => void;
    aspect?: "compact" | "portrait" | "landscape" | "square";
  } = $props();

  const lists = useLists();
  let added = $state(false);
  let imgError = $state(false);
  let activeImg = $state(0);
  let selectedVariantId = $state<string | null>(null);
  let slideshowPlaying = $state(true);

  const selectedVariant = $derived(
    product?.variants?.find(v => v.id === selectedVariantId) ?? null
  );

  // Real choices only — hide the Options section when there are no variants or
  // the only one is a placeholder ("default"/unnamed), since there's nothing to pick.
  const hasVariants = $derived.by(() => {
    const vs = product?.variants;
    if (!vs || vs.length === 0) return false;
    if (vs.length === 1) {
      const name = (vs[0].name ?? "").trim().toLowerCase();
      if (name === "" || name === "default" || name === "standard" || name === "base") return false;
    }
    return true;
  });

  const displayPrice = $derived(selectedVariant?.price ?? product?.price);
  const displayInStock = $derived(
    selectedVariant ? selectedVariant.inStock : product?.inStock
  );
  const displayStockLevel = $derived(
    selectedVariant ? selectedVariant.stockLevel : product?.stockLevel
  );
  const displayCompareAtPrice = $derived(
    selectedVariant ? undefined : product?.compareAtPrice
  );

  const hasDiscount = $derived(
    !selectedVariantId && product?.compareAtPrice != null && product.compareAtPrice > (product.price ?? 0)
  );
  const discountPercent = $derived.by(() => {
    if (!hasDiscount || !product?.compareAtPrice || !product?.price) return 0;
    const diff = product.compareAtPrice - product.price;
    return Math.round((diff / product.compareAtPrice) * 100);
  });
  const priced = $derived(product?.price != null);
  const liked = $derived(product ? lists.isLiked(product.id) : false);
  const displayImages = $derived.by(() => {
    if (!product) return [];
    const variantImg = (
      selectedVariant as { imageUrl?: string } | null
    )?.imageUrl;
    // Prefer the images array; fall back to the thumbnail only when it's empty.
    // The thumbnail is usually already inside the images array, so we don't
    // merge them — that was causing the duplicated first frame.
    const base = product.images?.length ? product.images : (product.imageUrl ? [product.imageUrl] : []);
    return [...new Set(variantImg ? [variantImg, ...base] : base)];
  });
  const displayAttributes = $derived.by(() => {
    if (!product) return null;
    const base = product.attributes ?? {};
    const variantAttrs = selectedVariant?.attributes ?? {};
    const merged = { ...base, ...variantAttrs };
    return Object.keys(merged).length ? merged : null;
  });

  const breadcrumb = $derived.by<string[]>(() => {
    if (!product) return [];
    if (product.categoryPath) return product.categoryPath.split(" > ");
    if (product.category) return [product.category];
    return [];
  });

  const ratingStars = $derived.by(() => {
    const r = product?.rating ?? 0;
    const full = Math.min(Math.floor(r), 5);
    const empty = 5 - full;
    return { full, empty };
  });

  // Reset state when product changes
  $effect(() => {
    if (product) {
      untrack(() => {
        selectedVariantId = null;
        activeImg = 0;
        slideshowPlaying = true;
        imgError = false;
      });
    }
  });

  // Slideshow interval
  $effect(() => {
    if (!slideshowPlaying || displayImages.length < 2) return;
    const timer = setInterval(() => {
      activeImg = (activeImg + 1) % displayImages.length;
    }, 4000);
    return () => clearInterval(timer);
  });

  $effect(() => {
    const count = displayImages.length;
    if (count === 0) {
      activeImg = 0;
      slideshowPlaying = false;
      return;
    }
    if (activeImg >= count) activeImg = 0;
  });


  let timeout: number | undefined;
  $effect(() => {
    return () => {
      if (timeout) window.clearTimeout(timeout);
    };
  });

  function handleAdd() {
    if (!product) return;
    const toAdd = selectedVariant
      ? {
          ...product,
          id: selectedVariant.id,
          name: `${product.name} (${selectedVariant.name})`,
          price: selectedVariant.price ?? product.price,
        }
      : product;
    onAdd?.(toAdd, null);
    added = true;
    timeout = window.setTimeout(() => (added = false), 1400);
  }

  function handleLike(e: MouseEvent) {
    e.stopPropagation();
    if (!product) return;
    const wasLiked = lists.isLiked(product.id);
    lists.toggleLike(product);
    toasts.success(wasLiked ? "Removed from wishlist" : "Added to wishlist");
  }

  function handleImageClick() {
    if (onGalleryOpen && displayImages.length > 0) {
      onGalleryOpen(displayImages, activeImg);
    }
  }

  function setActiveImage(index: number) {
    const count = displayImages.length;
    if (count === 0) return;
    activeImg = ((index % count) + count) % count;
    slideshowPlaying = false;
    imgError = false;
  }

  function previousImage(e?: MouseEvent) {
    e?.stopPropagation();
    setActiveImage(activeImg - 1);
  }

  function nextImage(e?: MouseEvent) {
    e?.stopPropagation();
    setActiveImage(activeImg + 1);
  }

  function toggleSlideshow(e?: MouseEvent) {
    e?.stopPropagation();
    slideshowPlaying = !slideshowPlaying;
  }

  function capitalize(s: string): string {
    const spaced = s.replace(/[_-]/g, " ").replace(/([A-Z])/g, " $1");
    const clean = spaced.trim().replace(/\s+/g, " ");
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  function sentenceCase(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }
</script>

{#if product}
  <div
    class="product-detail"
    class:landscape={aspect === "landscape"}
    class:compact={aspect === "compact"}
  >
    <div class="image-section">
      <div class="main-image-area" class:clickable={!!onGalleryOpen && displayImages.length > 0}>
        {#if displayImages.length > 0 && !imgError}
          <button
            type="button"
            class="main-image-button"
            onclick={handleImageClick}
            disabled={!onGalleryOpen}
            aria-label="Open gallery"
          >
            <div class="image-fade-wrap">
              {#key activeImg}
                <img
                  src={proxiedSrc(displayImages[activeImg] ?? displayImages[0])}
                  alt={product.name}
                  class="main-image"
                  onerror={() => (imgError = true)}
                  transition:fade={{ duration: 250 }}
                />
              {/key}
            </div>
          </button>

          {#if displayImages.length > 1}
            <button type="button" class="carousel-btn carousel-prev" onclick={previousImage} aria-label="Previous image">
              <ChevronLeft class="carousel-icon" />
            </button>
            <button type="button" class="carousel-btn carousel-next" onclick={nextImage} aria-label="Next image">
              <ChevronRight class="carousel-icon" />
            </button>
            <div class="image-counter">{activeImg + 1} / {displayImages.length}</div>
          {/if}

          <button type="button" class="overlay-btn like-btn" onclick={handleLike} aria-label="Toggle liked">
            <Heart class="like-icon {liked ? 'liked' : ''}" />
          </button>

          {#if onGalleryOpen}
            <button
              type="button"
              class="overlay-btn expand-btn"
              onclick={handleImageClick}
              aria-label="Open gallery"
            >
              <Maximize2 class="expand-icon" />
            </button>
          {/if}

          {#if displayImages.length > 1}
            <button
              type="button"
              class="overlay-btn slideshow-btn"
              onclick={toggleSlideshow}
              aria-label={slideshowPlaying ? 'Pause slideshow' : 'Play slideshow'}
            >
              {#if slideshowPlaying}
                <Pause class="slideshow-icon" />
              {:else}
                <Play class="slideshow-icon" />
              {/if}
            </button>
          {/if}
        {:else}
          <div class="placeholder-wrapper">
            <ShoppingBag class="placeholder big" />
          </div>
        {/if}
      </div>

      {#if displayImages.length > 1}
        <div class="thumbnail-strip" aria-label="Product images">
          {#each displayImages as img, i (img)}
            <button
              type="button"
              class="thumb-btn {i === activeImg ? 'thumb-active' : ''}"
              onclick={() => setActiveImage(i)}
              aria-label="View image {i + 1}"
              aria-current={i === activeImg ? "true" : undefined}
            >
              <img src={proxiedSrc(img)} alt="" />
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="detail-content">
      <div class="info-section">
        <div class="info-header">
          {#if breadcrumb.length > 0}
            <p class="breadcrumb">
              {#each breadcrumb as crumb, i}
                <span class="crumb">{crumb}</span>
                {#if i < breadcrumb.length - 1}
                  <span class="crumb-sep">&gt;</span>
                {/if}
              {/each}
            </p>
          {/if}

          <h2 class="product-name">{product.name}</h2>
          {#if product.summary && product.summary !== product.description}
            <p class="product-summary">{product.summary}</p>
          {/if}

          {#if product.rating && product.rating > 0}
            <div class="rating-row">
              <span class="stars">
                {#each Array(ratingStars.full) as _}
                  <span class="star filled">&#9733;</span>
                {/each}
                {#each Array(ratingStars.empty) as _}
                  <span class="star">&#9734;</span>
                {/each}
              </span>
              <span class="rating-num">{product.rating.toFixed(1)}</span>
            </div>
          {/if}

          <div class="price-block">
            {#if !priced}
              <span class="muted-text">Price on request</span>
            {:else}
              <span class="price-current">{formatMoney(displayPrice, product.currency)}</span>
              {#if hasDiscount}
                <span class="price-compare">{formatMoney(displayCompareAtPrice, product.currency)}</span>
                <span class="discount-badge">-{discountPercent}%</span>
              {/if}
            {/if}
          </div>

          <div class="chips-row">
            {#if displayInStock === false}
              <span class="chip chip-out">
                <span class="dot dot-red"></span>
                Out of Stock
              </span>
            {:else if displayStockLevel === "low"}
              <span class="chip chip-low">
                <span class="dot dot-amber"></span>
                Low Stock
              </span>
            {:else}
              <span class="chip chip-in">
                <span class="dot dot-green"></span>
                In Stock
              </span>
            {/if}
            {#if product.shipsInternationally}
              <span class="chip chip-neutral">
                <Globe class="chip-icon" />
                Global Shipping
              </span>
            {/if}
            {#if product.shipsFrom}
              <span class="chip chip-neutral">
                <Globe class="chip-icon" />
                Ships from {product.shipsFrom.toUpperCase()}
              </span>
            {/if}
          </div>
        </div>

        {#if product.reason}
          <details class="section" open>
            <summary class="section-summary">
              <span class="section-title">Agent's Take</span>
              <ChevronDown class="section-chevron" />
            </summary>
            <div class="section-content">
              <div class="reason-text">{product.reason}</div>
            </div>
          </details>
        {/if}

        {#if displayAttributes}
          <div class="section">
            <div class="section-content">
              <div class="attrs-grid">
                {#each Object.entries(displayAttributes) as [key, value]}
                  {#if value != null && value !== '' && !(key === 'subtype' && (displayAttributes.type ?? '').toLowerCase() === value.toLowerCase())}
                    <span class="attr-label">{capitalize(key)}</span>
                    <span class="attr-value">{sentenceCase(value)}</span>
                  {/if}
                {/each}
              </div>
            </div>
          </div>
        {/if}


        {#if hasVariants}
          <div class="section">
            <div class="section-content">
              <div class="variants-row">
                {#each product.variants as variant (variant.id)}
                  <button
                    type="button"
                    onclick={() => {
                      if (variant.inStock !== false) {
                        selectedVariantId = selectedVariantId === variant.id ? null : variant.id;
                      }
                    }}
                    class="variant-chip {variant.inStock === false ? 'variant-disabled' : ''} {selectedVariantId === variant.id ? 'variant-active' : ''}"
                    disabled={variant.inStock === false}
                  >
                    {#if /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(variant.name)}
                      <span class="color-swatch" style="background: {variant.name}"></span>
                    {/if}
                    <span class="variant-name" class:visually-hidden={/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(variant.name)}>{variant.name}</span>
                    {#if variant.inStock === false}
                      <span class="variant-unavailable">Unavailable</span>
                    {:else if variant.price}
                      <span class="variant-price">{formatMoney(variant.price, product.currency)}</span>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>
          </div>
        {/if}

        {#if product.description}
          <div class="section-card">
            <h3 class="section-card-title">Description</h3>
            <p class="desc-text">{product.description}</p>
          </div>
        {/if}

        {#if product.restrictedCountries && product.restrictedCountries.length > 0}
          <div class="section-card warning-card">
            <h3 class="section-card-title warning-title">Shipping Restrictions</h3>
            <p class="desc-text">This product cannot be shipped to: {product.restrictedCountries.join(', ')}</p>
          </div>
        {/if}
        </div>
      <div class="action-bar">
        <div class="action-buttons">
          <button
            type="button"
            class="add-btn {added ? 'added' : ''}"
            onclick={handleAdd}
            disabled={displayInStock === false}
          >
            {#if added}
              <Check class="btn-icon" />
              <span>Added</span>
            {:else}
              <ShoppingBag class="btn-icon" />
              <span>{selectedVariant ? `Add ${selectedVariant.name}` : 'Add to Cart'}</span>
            {/if}
          </button>
          {#if product.productUrl}
            <a
              href={product.productUrl}
              target="_blank"
              rel="noreferrer"
              class="view-link"
            >
              <ExternalLink class="btn-icon" />
              <span>View on site</span>
            </a>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ── Layout ── */
  .product-detail {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    /* Vertical: whole panel scrolls as one column (image + info), so a tall
       square image can be scrolled past instead of pinning the viewport. */
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--color-surface, var(--color-background));
  }

  .product-detail.landscape {
    flex-direction: row;
    /* Landscape keeps the image as a fixed sidebar; info scrolls internally. */
    overflow: hidden;
  }

  .detail-content {
    display: flex;
    /* grow to fill when content is short, but never shrink below content →
       when content is tall the column overflows and .product-detail scrolls. */
    flex: 1 0 auto;
    min-width: 0;
    flex-direction: column;
  }

  .product-detail.landscape .detail-content {
    min-height: 0;
    max-height: 100%;
    flex-shrink: 1;
    overflow: hidden;
  }

  /* ── Image Section ── */
  .image-section {
    flex-shrink: 0;
    padding: 0.75rem 0.75rem 0;
    min-width: 0;
  }

  .product-detail.landscape .image-section {
    display: flex;
    flex: 0 0 min(46%, 28rem);
    min-width: 14rem;
    min-height: 0;
    flex-direction: column;
    padding: 0.75rem;
    border-right: 1px solid var(--color-border);
  }

  .main-image-area {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    max-height: 45vh;
    background:
      radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--color-muted) 70%, transparent), transparent 72%),
      var(--color-muted);
    overflow: hidden;
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
  }

  .product-detail.landscape .main-image-area {
    flex: 1;
    min-height: 0;
    aspect-ratio: auto;
    max-height: none;
  }

  .main-image-area.clickable {
    cursor: pointer;
  }

  .main-image-button {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    background: transparent;
    padding: 0;
    cursor: inherit;
  }

  .main-image-button:disabled {
    cursor: default;
  }

  .image-fade-wrap {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .image-fade-wrap :global(.main-image) {
    position: absolute;
    inset: 0;
  }
  .main-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
    transition: opacity 0.2s ease, transform 0.2s ease;
    display: block;
  }

  .main-image:hover {
    opacity: 0.92;
  }

  .placeholder-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── Overlay Buttons ── */
  .overlay-btn {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-full);
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(4px);
    border: none;
    cursor: pointer;
    color: white;
    padding: 0;
    z-index: 2;
    transition: background 0.15s ease, transform 0.15s ease;
  }

  .overlay-btn:hover {
    background: rgba(0, 0, 0, 0.65);
    transform: scale(1.08);
  }

  .overlay-btn:active {
    transform: scale(0.95);
  }

  .like-btn {
    top: 0.625rem;
    right: 0.625rem;
  }

  /* Forwarded onto Lucide <Heart class="like-icon"> — :global() required */
  .like-btn :global(.like-icon) {
    width: 1rem;
    height: 1rem;
  }

  .like-btn :global(.liked) {
    fill: var(--color-destructive);
    color: var(--color-destructive);
  }

  .expand-btn {
    bottom: 0.625rem;
    right: 0.625rem;
  }

  /* Forwarded onto Lucide <Maximize2 class="expand-icon"> — :global() */
  .expand-btn :global(.expand-icon) {
    width: 1rem;
    height: 1rem;
  }

  .slideshow-btn {
    bottom: 0.625rem;
    left: 0.625rem;
  }

  /* Forwarded onto Lucide <Play/Pause class="slideshow-icon"> — :global() */
  .slideshow-btn :global(.slideshow-icon) {
    width: 1rem;
    height: 1rem;
  }

  .carousel-btn {
    position: absolute;
    top: 50%;
    z-index: 2;
    display: flex;
    width: 2.25rem;
    height: 2.75rem;
    align-items: center;
    justify-content: center;
    border: 1px solid rgb(255 255 255 / 0.12);
    border-radius: var(--radius-md);
    background: rgb(0 0 0 / 0.42);
    color: white;
    cursor: pointer;
    transform: translateY(-50%);
    transition: background 0.15s ease, opacity 0.15s ease, transform 0.15s ease;
  }

  .carousel-btn:hover {
    background: rgb(0 0 0 / 0.66);
    transform: translateY(-50%) scale(1.04);
  }

  .carousel-prev { left: 0.625rem; }
  .carousel-next { right: 0.625rem; }

  .carousel-btn :global(.carousel-icon) {
    width: 1.125rem;
    height: 1.125rem;
  }

  .image-counter {
    position: absolute;
    left: 50%;
    bottom: 0.625rem;
    z-index: 2;
    transform: translateX(-50%);
    border-radius: var(--radius-full);
    background: rgb(0 0 0 / 0.52);
    color: white;
    padding: 0.1875rem 0.5rem;
    font-size: var(--fs-xs);
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  /* ── Thumbnail Strip ── */
  .thumbnail-strip {
    display: flex;
    gap: 0.375rem;
    overflow-x: auto;
    padding: 0.5rem 0 0;
    scrollbar-width: thin;
    scrollbar-color: var(--color-border) transparent;
    overscroll-behavior-inline: contain;
  }

  .product-detail.landscape .thumbnail-strip {
    flex-shrink: 0;
  }

  .thumbnail-strip::-webkit-scrollbar {
    height: 3px;
  }

  .thumbnail-strip::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: var(--radius-full);
  }

  .thumb-btn {
    flex-shrink: 0;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--radius-md);
    overflow: hidden;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
    background: var(--color-muted);
    transition: border-color 0.15s ease, opacity 0.15s ease;
  }

  .thumb-btn:hover {
    opacity: 0.8;
  }

  .thumb-btn.thumb-active {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 1px var(--color-primary);
  }

  .thumb-btn img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* ── Info Section ── */
  .info-section {
    flex: 1;
    min-height: 0;
    padding: 0.75rem 0.75rem 0;
    display: flex;
    flex-direction: column;
  }

  /* Landscape: image is a fixed sidebar, so info scrolls inside its column. */
  .product-detail.landscape .info-section {
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
  }

  /* ── Info Header ── */
  .info-header {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding-bottom: 0.75rem;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0;
    margin: 0;
  }
  .crumb {
    font-size: var(--fs-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-muted-foreground);
    background: color-mix(in srgb, var(--color-muted-foreground) 10%, transparent);
    padding: 0.125rem 0.375rem;
    border-radius: var(--radius-full);
  }
  .crumb-sep {
    display: none;
  }

  .product-name {
    font-size: var(--fs-lg);
    font-weight: 600;
    line-height: 1.2;
    color: var(--color-foreground);
    margin: 0;
  }
  .product-summary {
    font-size: var(--fs-md);
    line-height: 1.4;
    color: var(--color-muted-foreground);
    margin: 0.375rem 0 0;
    font-weight: 500;
  }

  .rating-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .stars {
    display: flex;
    gap: 0.0625rem;
  }

  .star {
    font-size: var(--fs-md);
    color: var(--color-muted-foreground);
    opacity: 0.4;
  }

  .star.filled {
    color: var(--color-warning);
    opacity: 1;
  }

  .rating-num {
    font-size: var(--fs-sm);
    font-weight: 500;
    color: var(--color-muted-foreground);
  }

  .price-block {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .price-current {
    font-size: var(--fs-xl);
    font-weight: 700;
    color: var(--color-foreground);
  }

  .price-compare {
    font-size: var(--fs-sm);
    color: var(--color-muted-foreground);
    text-decoration: line-through;
  }

  .discount-badge {
    font-size: var(--fs-xs);
    font-weight: 700;
    background: var(--color-destructive);
    color: var(--color-destructive-foreground);
    padding: 0.125rem 0.375rem;
    border-radius: var(--radius-sm);
  }

  .muted-text {
    font-size: var(--fs-sm);
    color: var(--color-muted-foreground);
  }

  /* ── Chips Row ── */
  .chips-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-top: 0.125rem;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    font-size: var(--fs-xs);
    font-weight: 500;
    border-radius: var(--radius-full);
    white-space: nowrap;
    line-height: 1.5;
  }

  .chip-in {
    background: color-mix(in srgb, var(--color-success) 12%, transparent);
    color: var(--color-success);
  }

  .chip-low {
    background: color-mix(in srgb, var(--color-warning) 12%, transparent);
    color: var(--color-warning);
  }

  .chip-out {
    background: color-mix(in srgb, var(--color-destructive) 12%, transparent);
    color: var(--color-destructive);
  }

  .chip-neutral {
    background: color-mix(in srgb, var(--color-muted) 50%, transparent);
    color: var(--color-muted-foreground);
  }

  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .dot-green { background: var(--color-success); }
  .dot-amber { background: var(--color-warning); }
  .dot-red { background: var(--color-destructive); }

  /* Forwarded onto Lucide <Globe/Truck class="chip-icon"> — :global() */
  .chip :global(.chip-icon) {
    width: 0.75rem;
    height: 0.75rem;
    flex-shrink: 0;
  }

  /* ── Collapsible Sections ── */

  .section-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    padding: 0.625rem 0;
    user-select: none;
    list-style: none;
  }

  .section-summary::-webkit-details-marker {
    display: none;
  }

  .section-title {
    font-size: var(--fs-sm);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--color-muted-foreground);
  }

  /* Forwarded onto Lucide <ChevronDown class="section-chevron"> — :global() */
  .section-summary :global(.section-chevron) {
    width: 1rem;
    height: 1rem;
    color: var(--color-muted-foreground);
    transition: transform 0.2s ease;
    flex-shrink: 0;
  }

  details[open] .section-summary :global(.section-chevron) {
    transform: rotate(180deg);
  }

  .section-content {
    display: grid;
    grid-template-rows: 1fr;
    transition: grid-template-rows 0.25s ease, padding 0.25s ease;
    padding: 0.25rem 0.75rem;
  }

  details:not([open]) .section-content {
    grid-template-rows: 0fr;
    padding: 0;
  }

  .section-content > :global(*) {
    overflow: hidden;
  }

  /* ── Agent's Take ── */
  .reason-text {
    border-left: 3px solid var(--color-primary);
    padding: 0.5rem 0.75rem;
    font-size: var(--fs-sm);
    font-style: italic;
    line-height: 1.5;
    color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 5%, transparent);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  }
  .desc-text {
    font-size: var(--fs-md);
    line-height: 1.6;
    color: var(--color-muted-foreground);
    margin: 0;
    white-space: pre-wrap;
    text-align: justify;
  }

  /* ── Description Card ── */
  .section-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 0.25rem 0.75rem;
    background: color-mix(in srgb, var(--color-muted) 20%, transparent);
    margin: 0.5rem 0;
  }
  .section-card-title {
    font-size: var(--fs-sm);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-muted-foreground);
    margin: 0.5rem 0;
  }
  .warning-card {
    border-color: color-mix(in srgb, var(--color-destructive) 40%, var(--color-border));
    background: color-mix(in srgb, var(--color-destructive) 5%, transparent);
  }
  .warning-title {
    color: var(--color-destructive);
  }

  /* ── Attributes Table ── */
  .attrs-grid {
    display: grid;
    grid-template-columns: minmax(max-content, 5rem) 1fr;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: visible;
  }

  .attr-label {
    padding: 0.5rem 0.625rem;
    border-bottom: 1px solid var(--color-border);
    border-right: 1px solid var(--color-border);
    font-size: var(--fs-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-muted-foreground);
    white-space: nowrap;
    background: color-mix(in srgb, var(--color-muted) 25%, transparent);
    line-height: 1.3;
  }

  .attr-value {
    padding: 0.5rem 0.625rem;
    border-bottom: 1px solid var(--color-border);
    font-size: var(--fs-sm);
    color: var(--color-foreground);
    line-height: 1.3;
  }

  /* Remove bottom border from last row cells */
  .attr-label:nth-last-child(2),
  .attr-value:last-child {
    border-bottom: none;
  }

  /* ── Variant Chips ── */
  .variants-row {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .variant-chip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-muted) 30%, transparent);
    font-size: var(--fs-sm);
    font-weight: 500;
    color: var(--color-foreground);
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
    text-align: left;
    outline: none;
  }

  .variant-chip:hover:not(.variant-disabled) {
    background: color-mix(in srgb, var(--color-primary) 8%, transparent);
    border-color: var(--color-primary);
  }

  .variant-chip:active:not(.variant-disabled) {
    background: color-mix(in srgb, var(--color-primary) 16%, transparent);
  }

  .variant-chip.variant-active {
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 12%, var(--color-muted));
    box-shadow: 0 0 0 1px var(--color-primary);
    font-weight: 600;
  }

  .color-swatch {
    width: 1.25rem;
    height: 1.25rem;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    box-shadow: 0 0 0 1px var(--color-border), inset 0 0 0 1px rgba(0,0,0,0.08);
    margin-right: 0.25rem;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .variant-unavailable {
    font-size: var(--fs-xs);
    font-weight: 600;
    color: var(--color-muted-foreground);
    background: color-mix(in srgb, var(--color-muted) 40%, transparent);
    padding: 0.125rem 0.375rem;
    border-radius: var(--radius-sm);
    margin-left: auto;
  }

  .variant-chip.variant-disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: color-mix(in srgb, var(--color-muted) 15%, transparent);
    border-color: color-mix(in srgb, var(--color-border) 50%, transparent);
  }
  .variant-chip.variant-disabled .color-swatch {
    opacity: 0.4;
  }

  .variant-name {
    font-weight: 500;
  }

  .variant-price {
    font-size: var(--fs-xs);
    color: var(--color-muted-foreground);
    margin-left: auto;
  }


  /* ── Sticky Action Bar ── */
  /* Sticky so Add-to-cart stays reachable while the column scrolls in vertical. */
  .action-bar {
    position: sticky;
    bottom: 0;
    z-index: 1;
    flex-shrink: 0;
    padding: 0.75rem;
    border-top: 1px solid var(--color-border);
    background: var(--color-surface, var(--color-background));
  }

  .product-detail.landscape .action-bar {
    position: static;
  }

  /* Low-height landscape: compact action bar */
  @media (max-height: 500px) {
    .product-detail.landscape .action-bar {
      padding: 0.375rem 0.5rem;
    }
    .product-detail.landscape .add-btn {
      height: 2rem;
      font-size: var(--fs-xs);
      padding: 0 0.625rem;
    }
    .product-detail.landscape .view-link {
      height: 2rem;
      font-size: var(--fs-xs);
      padding: 0 0.625rem;
    }
    .product-detail.landscape .action-buttons {
      gap: 0.25rem;
    }
  }


  .action-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .add-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    height: 2.75rem;
    padding: 0 1rem;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--fs-sm);
    font-weight: 600;
    cursor: pointer;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    transition: background 0.15s ease, opacity 0.15s ease, transform 0.12s ease;
    white-space: nowrap;
  }

  .add-btn:hover:not(:disabled) {
    opacity: 0.9;
    transform: scale(1.02);
  }

  .add-btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .add-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .add-btn.added {
    background: var(--color-success);
    color: var(--color-success-foreground);
  }

  /* Forwarded onto Lucide <ShoppingBag/Check/ExternalLink class="btn-icon"> — :global() */
  .action-bar :global(.btn-icon) {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  .view-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    height: 2.75rem;
    padding: 0 1rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--fs-sm);
    font-weight: 500;
    color: var(--color-muted-foreground);
    background: transparent;
    text-decoration: none;
    white-space: nowrap;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .view-link:hover {
    background: var(--color-muted);
    color: var(--color-foreground);
  }

  /* ── Reduced Motion ── */
  @media (prefers-reduced-motion: reduce) {
    .main-image { transition-duration: 0.01ms; }
    .overlay-btn { transition-duration: 0.01ms; }
    .carousel-btn { transition-duration: 0.01ms; }
    .thumb-btn { transition-duration: 0.01ms; }
    .section-summary :global(.section-chevron) { transition-duration: 0.01ms; }
    .section-content { transition-duration: 0.01ms; }
    .variant-chip { transition-duration: 0.01ms; }
    .add-btn { transition-duration: 0.01ms; }
    .view-link { transition-duration: 0.01ms; }
    .overlay-btn:hover { transform: none; }
    .carousel-btn:hover { transform: translateY(-50%); }
    .add-btn:hover:not(:disabled) { transform: none; }
  }

</style>
