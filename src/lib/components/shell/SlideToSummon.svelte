<script lang="ts">
  import { ArrowRight } from "@lucide/svelte";
  import BrailleSpinner from "$lib/ui/BrailleSpinner.svelte";
  import { ensureHapticSwitch, hapticTap } from "$lib/actions/haptic";
  import { onMount } from "svelte";

  let {
    loading = false,
    oncomplete,
  }: {
    loading?: boolean;
    oncomplete?: () => void;
  } = $props();
  
  let container: HTMLDivElement | undefined = $state();
  let handle: HTMLDivElement | undefined = $state();
  
  let isDragging = $state(false);
  let progress = $state(0); // 0 to 1
  let startX = 0;
  
  onMount(ensureHapticSwitch);
  
  function onPointerDown(e: PointerEvent) {
    if (loading) return;
    isDragging = true;
    startX = e.clientX;
    handle?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!isDragging || !container || !handle) return;
    
    const containerWidth = container.offsetWidth;
    const handleWidth = handle.offsetWidth;
    const maxSlide = containerWidth - handleWidth - 8; // 4px padding on each side
    
    let delta = e.clientX - startX;
    
    // Calculate progress (0 to 1)
    let p = delta / maxSlide;
    if (p < 0) p = 0;
    if (p > 1) p = 1;
    
    progress = p;
  }

  function onPointerUp(e: PointerEvent) {
    if (!isDragging) return;
    isDragging = false;
    handle?.releasePointerCapture(e.pointerId);
    
    if (progress > 0.95) {
      progress = 1;
      hapticTap();
      oncomplete?.();
    } else {
      progress = 0;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (loading) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      progress = 1;
      hapticTap();
      oncomplete?.();
    }
  }
</script>

<div 
  class="slide-container" 
  bind:this={container}
  class:loading
>
  <div 
    class="slide-text" 
    style="opacity: {1 - progress * 1.5}"
  >
    {loading ? "summoning..." : "summon the djinn"}
  </div>
  
  {#if progress > 0}
    <div class="swipe-glow" style="width: calc({progress} * 100%)"></div>
  {/if}
  
  <div 
    class="slide-handle" 
    bind:this={handle}
    role="button"
    tabindex={loading ? -1 : 0}
    aria-label="Summon the djinn"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onkeydown={onKeydown}
    style="transform: translateX(calc({progress} * (100cqw - 3.5rem - 8px)))"
  >
    {#if loading}
      <BrailleSpinner name="cascade" size="sm" />
    {:else}
      <ArrowRight size={20} class="handle-icon" />
    {/if}
  </div>  <!-- closes slide-handle -->
</div>  <!-- closes slide-container -->

<style>
  .slide-container {
    position: relative;
    width: 100%;
    max-width: 320px;
    height: 3.5rem;
    border-radius: 9999px;
    background: color-mix(in srgb, var(--color-surface) 60%, transparent);
    border: 1px solid var(--color-border-subtle);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    user-select: none;
    touch-action: none;
    margin: 0 auto;
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
    container-type: inline-size;
  }

  .slide-text {
    font-family: var(--font-display);
    font-size: var(--fs-md);
    font-weight: 600;
    color: var(--color-muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    pointer-events: none;
    transition: opacity 0.1s;
    position: relative;
    z-index: 2;
  }
  
  .swipe-glow {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    border-radius: 9999px;
    background: linear-gradient(to right,
      color-mix(in srgb, var(--color-primary) 6%, transparent) 0%,
      color-mix(in srgb, var(--color-primary) 20%, transparent) 60%,
      color-mix(in srgb, var(--color-primary) 35%, transparent) 100%
    );
    pointer-events: none;
    z-index: 1;
    transition: width 0.05s linear;
  }

  .slide-handle {
    position: absolute;
    left: 4px;
    width: calc(3.5rem - 8px);
    height: calc(3.5rem - 8px);
    border-radius: 50%;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
    box-shadow: var(--shadow-sm);
    transition: transform 0.1s, box-shadow 0.15s;
    z-index: 10;
  }
  .slide-handle:active {
    cursor: grabbing;
    box-shadow: 0 0 20px color-mix(in srgb, var(--color-primary) 60%, transparent);
  }

  /* When JS updates transform, we want it to be instant if dragging, but snap back if released.
     Since we set progress=0 on release, we can use a CSS variable or just rely on svelte reactivity 
     without transition during drag, but adding transition when not dragging. */
  .slide-container:not(:active) .slide-handle {
    transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }

  .loading .slide-handle {
    transform: translateX(calc(1 * (100cqw - 3.5rem - 8px))) !important;
    cursor: default;
  }
</style>
