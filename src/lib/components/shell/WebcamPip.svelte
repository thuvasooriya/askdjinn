<script lang="ts">
  import { X } from "@lucide/svelte";
  import { fade } from "svelte/transition";

  let {
    stream,
    onClose,
  }: {
    stream: MediaStream;
    onClose: () => void;
  } = $props();

  let pipX = $state(20);
  let pipY = $state(20);
  let draggingPip = $state(false);
  let startX = 0;
  let startY = 0;

  function startDrag(e: PointerEvent) {
    if ((e.target as HTMLElement).closest(".pip-close")) return;
    draggingPip = true;
    startX = e.clientX - pipX;
    startY = e.clientY - pipY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const onMove = (me: PointerEvent) => {
      if (!draggingPip) return;
      pipX = me.clientX - startX;
      pipY = me.clientY - startY;
    };
    const onUp = (ue: PointerEvent) => {
      draggingPip = false;
      (e.target as HTMLElement).releasePointerCapture(ue.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
</script>

<div
  class="webcam-pip"
  role="region"
  aria-label="Webcam preview"
  transition:fade={{ duration: 150 }}
  style="transform: translate({pipX}px, {pipY}px)"
  onpointerdown={startDrag}
>
  <!-- svelte-ignore a11y_media_has_caption -->
  <video srcObject={stream} autoplay playsinline muted></video>
  <button type="button" class="pip-close" onclick={onClose} aria-label="Close webcam">
    <X class="pip-close-icon" />
  </button>
  <span class="pip-label">Camera</span>
</div>

<style>
  .webcam-pip {
    position: fixed;
    top: 1rem;
    right: 1rem;
    width: 10rem;
    aspect-ratio: 4 / 3;
    z-index: 62;
    border-radius: var(--radius-lg);
    border: 2px solid color-mix(in srgb, var(--color-border) 50%, transparent);
    overflow: hidden;
    cursor: grab;
    touch-action: none;
    background: color-mix(in srgb, var(--color-surface) 72%, transparent);
    backdrop-filter: blur(18px) saturate(140%);
    -webkit-backdrop-filter: blur(18px) saturate(140%);
    box-shadow: var(--shadow-float);
  }
  .webcam-pip:active {
    cursor: grabbing;
  }
  .webcam-pip video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .pip-close {
    position: absolute;
    top: 0.375rem;
    right: 0.375rem;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: var(--radius-full);
    background: color-mix(in srgb, var(--color-foreground) 70%, transparent);
    color: var(--color-background);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
    opacity: 0.8;
    z-index: 1;
  }
  .pip-close:hover {
    opacity: 1;
    background: var(--color-foreground);
  }
  .pip-close :global(.pip-close-icon) {
    width: 0.65rem;
    height: 0.65rem;
  }
  .pip-label {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 0.125rem 0.375rem;
    font-size: 0.5625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-foreground);
    background: linear-gradient(transparent, color-mix(in srgb, var(--color-surface) 80%, transparent));
    pointer-events: none;
    user-select: none;
  }
</style>
