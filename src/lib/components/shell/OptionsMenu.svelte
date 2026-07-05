<script lang="ts">
  // OptionsMenu — single trigger for all input actions.
  // Conditionally shows "Start Voice" when onVoiceStart is provided;
  // always shows video / photo / upload.
  import { Plus, Mic, Video, Camera, Upload, Captions } from "@lucide/svelte";
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
    onVoiceStart,
    onToggleTranscript,
    transcriptActive = false,
  }: {
    media: Media;
    align?: "left" | "right";
    triggerClass?: string;
    onVoiceStart?: () => void;
    onToggleTranscript?: () => void;
    transcriptActive?: boolean;
  } = $props();

  let fileInput: HTMLInputElement | undefined = $state();

  function setCameraMenuAction(node: HTMLElement) {
    return media.setCameraMenuAction(node);
  }

  function startVoice() {
    media.closeCameraMenu();
    onVoiceStart?.();
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
    aria-label="Input options"
    title="Options"
  >
    <Plus class="h-4 w-4" />
  </button>
  {#if media.cameraMenuOpen}
    <div
      class={cn("dropdown-menu", align === "left" ? "dropdown-menu--left" : "dropdown-menu--right")}
      transition:fly={{ y: -10, duration: 150 }}
      use:setCameraMenuAction
    >
      {#if onVoiceStart}
        <button type="button" class="dropdown-item" onclick={startVoice}>
          <Mic class="h-3.5 w-3.5" /> Start Voice
        </button>
      {/if}
      {#if onToggleTranscript}
        <button type="button" class="dropdown-item" onclick={() => { media.closeCameraMenu(); onToggleTranscript(); }}>
          <Captions class="h-3.5 w-3.5" /> {transcriptActive ? "Hide Transcript" : "Show Transcript"}
        </button>
      {/if}
      <button type="button" class="dropdown-item" onclick={media.startVideoCall}>
        <Video class="h-3.5 w-3.5" /> Start Video
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
