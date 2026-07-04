<script lang="ts">
  import { Camera, Video, Upload } from "@lucide/svelte";
  import { fly } from "svelte/transition";
  import { cn } from "$lib/utils";

  type Media = {
    cameraMenuOpen: boolean;
    cameraMenuEl: HTMLElement | undefined;
    setCameraMenuAction: (node: HTMLElement) => { update(): void; destroy(): void };
    toggleCameraMenu: () => void;
    closeCameraMenu: () => void;
    startVideoCall: () => void;
    openWebcamCapture: () => void;
    handleImageSelect: (e: Event) => void;
  };

  let {
    media,
    align = "right",
    triggerClass = "",
  }: {
    media: Media;
    align?: "left" | "right";
    triggerClass?: string;
  } = $props();

  let fileInput: HTMLInputElement | undefined = $state();

  function setCameraMenuAction(node: HTMLElement) {
    return media.setCameraMenuAction(node);
  }
</script>

<svelte:window
  onclick={(e) => {
    if (media.cameraMenuOpen && media.cameraMenuEl && !media.cameraMenuEl.contains(e.target as Node)) {
      media.closeCameraMenu();
    }
  }}
/>

<div class="relative flex items-center justify-center">
  <button
    type="button"
    onclick={(e) => { e.stopPropagation(); media.toggleCameraMenu(); }}
    class={triggerClass}
    aria-label="Camera and attachments"
    title="Attachments"
  >
    <Camera class="h-4 w-4" />
  </button>
  {#if media.cameraMenuOpen}
    <div
      class={cn("dropdown-menu", align === "left" ? "dropdown-menu--left" : "dropdown-menu--right")}
      transition:fly={{ y: -10, duration: 150 }}
      use:setCameraMenuAction
    >
      <button type="button" class="dropdown-item" onclick={media.startVideoCall}>
        <Video class="h-3.5 w-3.5" /> Video Call
      </button>
      <button type="button" class="dropdown-item" onclick={media.openWebcamCapture}>
        <Camera class="h-3.5 w-3.5" /> Take Photo
      </button>
      <button type="button" class="dropdown-item" onclick={() => { media.closeCameraMenu(); fileInput?.click(); }}>
        <Upload class="h-3.5 w-3.5" /> Upload Image
      </button>
    </div>
  {/if}
</div>
<input bind:this={fileInput} type="file" accept="image/*" onchange={media.handleImageSelect} class="hidden" />
