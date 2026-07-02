<script lang="ts" generics>
  import { fade, fly } from "svelte/transition";
  import { onDestroy, onMount } from "svelte";
  import { Camera } from "@lucide/svelte";
  import { toasts } from "$lib/ui/toast";

  let {
    onCapture,
    onClose,
  }: {
    onCapture: (base64: string, mimeType: string) => void;
    onClose: () => void;
  } = $props();

  let videoEl = $state<HTMLVideoElement>();
  let stream = $state<MediaStream | null>(null);

  onMount(async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } }
      });
      setTimeout(() => {
        if (videoEl && stream) {
          videoEl.srcObject = stream;
        }
      }, 50);
    } catch (err) {
      toasts.error("Webcam access denied");
      onClose();
    }
  });

  function capture() {
    if (!videoEl || !stream) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoEl.videoWidth || 640;
    canvas.height = videoEl.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    const base64 = dataUrl.split(",")[1];
    onCapture(base64, "image/jpeg");
  }

  onDestroy(() => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }
  });
</script>

<div class="webcam-modal-overlay" transition:fade={{ duration: 150 }}>
  <div class="webcam-modal glass shadow-2xl" transition:fly={{ y: 20, duration: 250 }}>
    <header class="webcam-header">
      <h3>Take Photo</h3>
      <button type="button" class="webcam-close" onclick={onClose}>×</button>
    </header>
    <div class="webcam-video-container">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={videoEl} autoplay playsinline muted></video>
    </div>
    <div class="webcam-actions">
      <button type="button" class="btn-secondary" onclick={onClose}>Cancel</button>
      <button type="button" class="btn-primary flex items-center gap-1.5" onclick={capture}>
        <Camera class="h-4 w-4" /> Capture
      </button>
    </div>
  </div>
</div>

<style>
  .webcam-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .webcam-modal {
    width: min(440px, 90vw);
    border-radius: var(--radius-2xl);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .webcam-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-border);
  }
  .webcam-header h3 {
    font-size: var(--fs-md);
    font-weight: 700;
    text-transform: uppercase;
    color: var(--color-muted-foreground);
    margin: 0;
  }
  .webcam-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: var(--color-muted-foreground);
    cursor: pointer;
    line-height: 1;
  }
  .webcam-video-container {
    aspect-ratio: 4 / 3;
    background: black;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .webcam-video-container video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .webcam-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--color-border);
  }
  .btn-primary {
    padding: 0.5rem 1.25rem;
    border: none;
    border-radius: var(--radius-lg);
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .btn-primary:hover {
    opacity: 0.9;
  }
  .btn-secondary {
    padding: 0.5rem 1.25rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: transparent;
    color: var(--color-foreground);
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-secondary:hover {
    background: var(--color-muted);
  }
</style>
