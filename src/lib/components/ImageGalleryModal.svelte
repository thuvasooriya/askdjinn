<script lang="ts">
  import { X, ChevronLeft, ChevronRight } from "@lucide/svelte";
  import { proxiedSrc } from "$lib/image";
  import { fade } from "svelte/transition";
  import { browser } from "$app/environment";
  import { tick } from "svelte";

  let {
    images = [] as string[],
    activeIndex = 0,
    productName = "",
    open = false,
    onClose,
    onNavigate,
  }: {
    images?: string[];
    activeIndex?: number;
    productName?: string;
    open?: boolean;
    onClose?: () => void;
    onNavigate?: (index: number) => void;
  } = $props();

  const reducedMotion = $derived(browser && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const duration = $derived(reducedMotion ? 0 : 200);

  const total = $derived(images.length);
  const currentImage = $derived(images[activeIndex] ?? "");

  let overlayEl: HTMLDivElement | undefined = $state();
  let thumbnailContainerEl: HTMLDivElement | undefined = $state();
  let focusableEls: HTMLElement[] = [];
  let prevFocus: HTMLElement | null = null;

  function goTo(index: number) {
    if (index >= 0 && index < total) {
      onNavigate?.(index);
    }
  }

  function goPrev() {
    if (activeIndex > 0) goTo(activeIndex - 1);
  }

  function goNext() {
    if (activeIndex < total - 1) goTo(activeIndex + 1);
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === overlayEl) {
      onClose?.();
    }
  }
  function handleKeydown(e: KeyboardEvent) {
    if (!open) return;
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        onClose?.();
        break;
      case "ArrowLeft":
        e.preventDefault();
        goPrev();
        break;
      case "ArrowRight":
        e.preventDefault();
        goNext();
        break;
      case "Tab": {
        if (focusableEls.length === 0) break;
        const first = focusableEls[0];
        const last = focusableEls[focusableEls.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
        break;
      }
    }
  }

  // Focus management on open/close
  $effect(() => {
    if (!browser) return;
    if (open) {
      prevFocus = document.activeElement as HTMLElement;
      tick().then(() => {
        if (overlayEl) {
          focusableEls = Array.from(
            overlayEl.querySelectorAll<HTMLElement>(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
          );
          if (focusableEls.length > 0) {
            focusableEls[0].focus();
          }
        }
      });
    } else if (prevFocus) {
      prevFocus.focus();
      prevFocus = null;
    }
  });

  // Auto-scroll thumbnails when activeIndex changes
  $effect(() => {
    const idx = activeIndex;
    const isOpen = open;
    if (!browser || !isOpen || !thumbnailContainerEl) return;
    const container = thumbnailContainerEl;
    requestAnimationFrame(() => {
      const activeThumb = container.querySelector<HTMLElement>('[data-active="true"]');
      if (activeThumb) {
        activeThumb.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    });
  });
</script>

<svelte:window onkeydown={handleKeydown} />
{#if open && total > 0}
  <div
    role="dialog"
    aria-modal="true"
    aria-label={productName ? `Gallery for ${productName}` : "Image gallery"}
    tabindex="-1"
    class="gallery-overlay"
    transition:fade={{ duration }}
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    bind:this={overlayEl}
  >
    <!-- Top bar: counter + close button -->
    <div class="top-bar">
      <span class="counter">{activeIndex + 1} / {total}</span>
      <button
        aria-label="Close gallery"
        class="close-btn"
        onclick={onClose}
      >
        <X size={20} />
      </button>
    </div>

    <!-- Main image area with nav arrows -->
    <div class="image-area">
      {#if activeIndex > 0}
        <button
          aria-label="Previous image"
          class="nav-btn nav-btn--left"
          onclick={goPrev}
        >
          <ChevronLeft size={24} />
        </button>
      {/if}

      <div class="image-wrapper">
        {#key currentImage}
          <img
            src={proxiedSrc(currentImage)}
            alt={productName ? `${productName} image ${activeIndex + 1}` : ""}
            class="main-image"
            transition:fade={{ duration }}
          />
        {/key}
      </div>

      {#if activeIndex < total - 1}
        <button
          aria-label="Next image"
          class="nav-btn nav-btn--right"
          onclick={goNext}
        >
          <ChevronRight size={24} />
        </button>
      {/if}
    </div>

    <!-- Thumbnails strip -->
    {#if total > 1}
      <div
        class="thumbnails"
        role="tablist"
        aria-label="Image thumbnails"
        bind:this={thumbnailContainerEl}
      >
        {#each images as img, i}
          <button
            data-active={i === activeIndex}
            class="thumbnail"
            class:thumbnail--active={i === activeIndex}
            role="tab"
            aria-selected={i === activeIndex}
            aria-label={`Go to image ${i + 1}`}
            onclick={() => goTo(i)}
          >
            <img src={proxiedSrc(img)} alt="" class="thumbnail-img" />
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .gallery-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.92);
    outline: none;
  }

  .top-bar {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
  }

  .counter {
    font-size: var(--fs-sm);
    font-weight: 500;
    color: rgba(255, 255, 255, 0.8);
    -webkit-user-select: none;
    user-select: none;
  }

  .close-btn {
    display: flex;
    height: 2.5rem;
    width: 2.5rem;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-full);
    background: rgba(255, 255, 255, 0.1);
    color: white;
    backdrop-filter: blur(4px);
    transition: background 150ms, transform 150ms;
    cursor: pointer;
    border: none;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .close-btn:active {
    transform: scale(0.9);
  }

  .image-area {
    position: relative;
    display: flex;
    width: 100%;
    flex: 1;
    align-items: center;
    justify-content: center;
    padding: 0 1rem;
  }

  .nav-btn {
    position: absolute;
    z-index: 10;
    display: flex;
    height: 3rem;
    width: 3rem;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-full);
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(4px);
    border: none;
    cursor: pointer;
    transition: background 150ms, color 150ms, transform 150ms;
  }

  .nav-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }

  .nav-btn:active {
    transform: scale(0.9);
  }

  .nav-btn--left {
    left: 0.5rem;
  }

  .nav-btn--right {
    right: 0.5rem;
  }

  .image-wrapper {
    display: flex;
    max-height: 80vh;
    max-width: 90vw;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .main-image {
    max-height: 80vh;
    max-width: 90vw;
    object-fit: contain;
  }

  .thumbnails {
    display: flex;
    width: 100%;
    max-width: 80vw;
    gap: 0.5rem;
    overflow-x: auto;
    padding: 0.5rem 1rem 1rem;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
  }

  .thumbnails::-webkit-scrollbar {
    height: 4px;
  }

  .thumbnails::-webkit-scrollbar-track {
    background: transparent;
  }

  .thumbnails::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
  }

  .thumbnail {
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    overflow: hidden;
    border-radius: var(--radius-md);
    border: 2px solid transparent;
    background: transparent;
    padding: 0;
    cursor: pointer;
    transition: opacity 150ms, border-color 150ms;
    opacity: 0.6;
  }

  .thumbnail:hover {
    opacity: 0.85;
  }

  .thumbnail--active {
    opacity: 1;
    border-color: var(--color-primary);
  }

  .thumbnail-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .close-btn,
    .nav-btn,
    .thumbnail {
      transition-duration: 0.01ms;
    }

    .thumbnails {
      scroll-behavior: auto;
    }
  }
</style>
