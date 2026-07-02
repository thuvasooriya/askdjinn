<script lang="ts">
  import { useMediaAttach } from "$lib/attach-media.svelte";
  import { useConversation } from "$lib/stores/conversation.svelte";
  import { useProfile } from "$lib/stores/profile.svelte";
  import { useLiveVoice } from "$lib/stores/live-voice.svelte";
  import { useChat } from "$lib/stores/chat.svelte";
  import { useUI } from "$lib/stores/ui.svelte";
  import { devLog } from "$lib/dev-log";
  import { ArrowUp, Camera, Video, Upload, X } from "@lucide/svelte";
  import { fly, fade, scale } from "svelte/transition";
  import { browser } from "$app/environment";
  import WebcamCaptureModal from "./WebcamCaptureModal.svelte";

  let {
    class: className = "",
    liveActive = false,
    onLiveStart,
    onLiveEnd,
  }: {
    class?: string;
    liveActive?: boolean;
    onLiveStart?: () => void;
    onLiveEnd?: () => void;
  } = $props();

  const chat = useChat();
  const conv = useConversation();
  const liveVoice = useLiveVoice();
  const profile = useProfile();
  const ui = useUI();

  let text = $state("");
  let textarea: HTMLTextAreaElement | undefined = $state();
  let fileInput: HTMLInputElement | undefined = $state();

  const reducedMotion = $derived(browser && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const media = useMediaAttach({
    liveActive: () => liveActive,
    liveVoice,
    conv,
    onLiveStart: () => onLiveStart?.(),
  });
  // Wrapper action for Svelte use: directive
  function setCameraMenuAction(node: HTMLElement) {
    media.setCameraMenuAction(node);
  }

  function submit() {
    const value = text.trim();
    devLog.uiCommand("chat-input submit", { hasText: value.length > 0, liveActive, chatStreaming: chat.isStreaming });

    if ((!value && !conv.pendingImage) || chat.isStreaming) {
      return;
    }

    if (liveActive && liveVoice.state === "listening") {
      liveVoice.sendText(value);
      text = "";
      if (textarea) textarea.style.height = "auto";
      return;
    }

    chat.send(value);
    text = "";
    if (textarea) textarea.style.height = "auto";
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function autoResize() {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 80) + "px";
  }

  $effect(() => {
    void text;
    autoResize();
  });
</script>

<svelte:window onclick={(e) => { if (media.cameraMenuOpen && media.cameraMenuEl && !media.cameraMenuEl.contains(e.target as Node)) media.closeCameraMenu(); }} />

<div class="chat-input-container {className}">
  {#if conv.pendingImage}
    <div class="flex items-center gap-2 p-1.5 border border-[var(--color-border-subtle)] rounded-lg bg-[var(--color-surface)] mb-2 relative" transition:scale={{ duration: 150 }}>
      <img src="data:{conv.pendingImage.mimeType};base64,{conv.pendingImage.base64}" alt="Pending attachment" class="h-10 w-10 object-cover rounded-md border border-[var(--color-border)]" />
      <span class="text-[10px] text-[var(--color-muted-foreground)] flex-1 truncate">Image attached</span>
      <button type="button" class="remove-btn text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 p-1 rounded-full" onclick={() => conv.clearPendingImage()} aria-label="Remove image">
        <X class="h-3.5 w-3.5" />
      </button>
    </div>
  {/if}

  <div class="flex items-end gap-2 w-full">
    <!-- Camera/Attachment options -->
    <div class="relative flex items-center justify-center">
      <button
        type="button"
        onclick={(e) => { e.stopPropagation(); media.toggleCameraMenu(); }}
        class="action-btn flex items-center justify-center text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors p-1.5"
        aria-label="Camera and attachments"
        title="Attachments"
      >
        <Camera class="h-4 w-4" />
      </button>
      {#if media.cameraMenuOpen}
        <div class="camera-dropdown glass shadow-xl" transition:fly={{ y: -10, duration: 150 }} use:setCameraMenuAction>
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

    <!-- Text area input -->
    <textarea
      bind:this={textarea}
      bind:value={text}
      onkeydown={handleKeydown}
      oninput={autoResize}
      placeholder="Type a message..."
      rows="1"
      class="chat-input"
    ></textarea>

    <!-- Send button -->
    <button
      type="button"
      class="chat-send-btn"
      onclick={submit}
      disabled={(!text.trim() && !conv.pendingImage) || chat.isStreaming}
      aria-label="Send message"
    >
      <ArrowUp class="h-4 w-4" />
    </button>
  </div>
</div>

<!-- Webcam Capture Modal -->
{#if media.webcamCaptureOpen}
  <WebcamCaptureModal onCapture={media.onWebcamCapture} onClose={media.closeWebcamCapture} />
{/if}

<style>
  .chat-input-container {
    display: flex;
    flex-direction: column;
    width: 100%;
  }
  .action-btn {
    background: none;
    border: none;
    cursor: pointer;
    border-radius: var(--radius-sm);
  }
  .remove-btn {
    background: none;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .chat-input {
    flex: 1;
    min-width: 0;
    max-height: 80px;
    background: transparent;
    border: none;
    outline: none;
    resize: none;
    font-size: var(--fs-md);
    line-height: 1.5;
    padding: 0.375rem 0;
    color: var(--color-foreground);
  }
  .chat-send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--radius-full);
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    border: none;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s, background-color 0.15s;
    flex-shrink: 0;
  }
  .chat-send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .chat-send-btn:active:not(:disabled) {
    transform: scale(0.92);
  }
  .chat-send-btn:hover:not(:disabled) {
    opacity: 0.92;
    transform: scale(1.05);
  }
  .hidden {
    display: none;
  }

  /* Camera Dropdown Menu */
  .camera-dropdown {
    position: absolute;
    bottom: 3rem;
    left: 0;
    z-index: 60;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.375rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-float);
    min-width: 9rem;
  }
  .camera-dropdown .dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.4rem 0.5rem;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-foreground);
    font-size: var(--fs-sm);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease;
  }
  .camera-dropdown .dropdown-item:hover {
    background: var(--color-muted);
  }
</style>
