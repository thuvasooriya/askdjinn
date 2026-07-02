<script lang="ts">
  import { ArrowUp, Camera, Mic, MicOff, Video, Upload } from "@lucide/svelte";
  import { fade, fly } from "svelte/transition";
  import { browser } from "$app/environment";
  import AgentOrb, { type OrbState } from "./AgentOrb.svelte";
  import { useChat } from "$lib/stores/chat.svelte";
  import { useConversation } from "$lib/stores/conversation.svelte";
  import { useLiveVoice } from "$lib/stores/live-voice.svelte";
  import { useProfile } from "$lib/stores/profile.svelte";
  import { useAgentStatus } from "$lib/stores/agent-status.svelte";
  import { devLog } from "$lib/dev-log";
  import { useUI } from "$lib/stores/ui.svelte";
  import { useMediaAttach } from "$lib/attach-media.svelte";
  import WebcamCaptureModal from "./shell/WebcamCaptureModal.svelte";

  const reducedMotion = $derived(browser && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  let {
    liveActive = false,
    onLiveStart,
    onLiveEnd,
  }: {
    liveActive?: boolean;
    onLiveStart: () => void;
    onLiveEnd: () => void;
  } = $props();

  const ui = useUI();
  const chat = useChat();
  const conv = useConversation();
  const liveVoice = useLiveVoice();
  const profile = useProfile();
  const agentStatus = useAgentStatus();

  let pressing = $state(false);
  let longPressTriggered = $state(false);
  let holdProgress = $state(0);
  let progressRAF: ReturnType<typeof requestAnimationFrame> | null = null;
  let pressStartTime = 0;
  let inputOpen = $derived(ui.agentInputOpen);
  let liveModeFileInput: HTMLInputElement | undefined = $state();
  let fileInput: HTMLInputElement | undefined = $state();
  let text = $state("");
  let textarea: HTMLTextAreaElement | undefined = $state();
  const LONG_PRESS_MS = 500;
  const RING_RADIUS = 34;
  const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

  $effect(() => () => {
    if (progressRAF) cancelAnimationFrame(progressRAF);
  });

  const liveState = $derived(liveVoice.state);
  const orbState = $derived<OrbState>(
    chat.isStreaming ? "thinking"
    : liveActive ? (
      liveState === "speaking" ? "speaking"
      : liveState === "listening" ? "listening"
      : liveState === "connecting" || liveState === "connected" ? "thinking"
      : liveState === "error" ? "error"
      : "idle"
    )
    : agentStatus.isActive ? "searching"
    : "idle"
  );

  const hasPendingToolCall = $derived(liveVoice.log.some(e => e.type === "tool-call" && e.status === "pending"));
  const displayOrbState = $derived<OrbState>(
    hasPendingToolCall && orbState !== "speaking" && orbState !== "error" ? "searching" : orbState
  );

  const liveStatusLabel = $derived.by(() => {
    if (!liveActive) return null;
    if (liveState === "connecting" || liveState === "connected") return "Connecting...";
    if (liveState === "listening") return "Listening";
    if (liveState === "speaking") return `${profile.agent.name} speaking`;
    if (liveState === "error") return "Connection lost";
    return "Live";
  });

  function toggleLive() {
    if (liveActive) {
      onLiveEnd();
    } else {
      onLiveStart();
    }
  }

  // Long-press orb to start live voice
  function startPress() {
    if (liveActive) return;
    pressing = true;
    longPressTriggered = false;
    holdProgress = 0;
    pressStartTime = performance.now();
    function animateRing(now: number) {
      const elapsed = now - pressStartTime;
      const progress = Math.min(1, elapsed / LONG_PRESS_MS);
      holdProgress = progress;
      if (progress >= 1) {
        if (!longPressTriggered) { longPressTriggered = true; onLiveStart(); }
        return;
      }
      progressRAF = requestAnimationFrame(animateRing);
    }
    progressRAF = requestAnimationFrame(animateRing);
  }

  function endPress(e?: PointerEvent) {
    pressing = false;
    if (progressRAF) { cancelAnimationFrame(progressRAF); progressRAF = null; }
    if (!longPressTriggered && e?.type === "pointerup") {
      ui.agentInputOpen = !ui.agentInputOpen;
      if (ui.agentInputOpen) {
        setTimeout(() => { if (textarea) { textarea.focus(); autoResize(); } }, 100);
      }
    }
    holdProgress = 0;
  }

  function submit() {
    const value = text.trim();
    devLog.uiCommand("agent-bar submit", { hasText: value.length > 0, liveActive, chatStreaming: chat.isStreaming });
    if (!value || chat.isStreaming) return;
    if (liveActive && liveVoice.state === "listening") {
      liveVoice.sendText(value);
    } else {
      chat.send(value);
    }
    text = "";
    if (textarea) textarea.style.height = "auto";
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); }
  }

  function autoResize() {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 80) + "px";
  }

  $effect(() => { void text; autoResize(); });

  // Media attach hook for live mode
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
</script>

<svelte:window onclick={(e) => { if (media.cameraMenuOpen && media.cameraMenuEl && !media.cameraMenuEl.contains(e.target as Node)) media.closeCameraMenu(); }} />

<div class="agent-bar-container">
  {#if liveActive}
    <!-- Hold/Voice Active Mode -->
    <div class="flex items-center gap-3">
      <!-- Disconnect button -->
      <button
        type="button"
        onclick={toggleLive}
        class="floating-btn glass shadow-lg flex items-center justify-center text-red-500 hover:text-red-400"
        aria-label="Disconnect voice"
        transition:fade={{ duration: 150 }}
      >
        <MicOff class="h-4 w-4" />
      </button>

      <!-- Orb -->
      <div
        class="floating-orb-btn glass shadow-lg"
        onpointerdown={startPress}
        onpointerup={endPress}
        onpointerleave={endPress}
        role="button"
        tabindex="0"
        aria-label="Agent Orb"
        style="touch-action: none;"
      >
        <AgentOrb
          mode="live"
          phase={displayOrbState}
          size={56}
          audioLevel={liveVoice.audioLevel}
        />
      </div>

      <!-- Camera options button in live mode -->
      <div class="relative flex items-center justify-center">
        <button
          type="button"
          onclick={(e) => { e.stopPropagation(); media.toggleCameraMenu(); }}
          class="floating-btn glass shadow-lg flex items-center justify-center text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          aria-label="Camera options"
          transition:fade={{ duration: 150 }}
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
            <button type="button" class="dropdown-item" onclick={() => { media.closeCameraMenu(); liveModeFileInput?.click(); }}>
              <Upload class="h-3.5 w-3.5" /> Upload Image
            </button>
          </div>
        {/if}
      </div>
      <input bind:this={liveModeFileInput} type="file" accept="image/*" onchange={media.handleImageSelect} class="hidden" />
    </div>
  {:else}
    <!-- Regular / Minimal / Expanded Mode -->
    <div class="flex items-center gap-3">
      <!-- Orb -->
      <div
        class="floating-orb-btn glass shadow-lg"
        onpointerdown={startPress}
        onpointerup={endPress}
        onpointerleave={endPress}
        role="button"
        tabindex="0"
        aria-label="Agent Orb"
        style="touch-action: none;"
      >
        {#if holdProgress > 0 && holdProgress < 1}
          <svg class="press-ring" viewBox="0 0 80 80" aria-hidden="true">
            <circle cx="40" cy="40" r={RING_RADIUS} fill="none" stroke="var(--color-primary)" stroke-width="4" stroke-dasharray={CIRCUMFERENCE} stroke-dashoffset={CIRCUMFERENCE * (1 - holdProgress)} transform="rotate(-90 40 40)" stroke-linecap="round" />
          </svg>
        {/if}
        <AgentOrb
          mode="llm"
          phase={displayOrbState}
          size={56}
          audioLevel={liveVoice.audioLevel}
        />
      </div>

      {#if inputOpen}
        <!-- Input bar with integrated send button (only when there is text) -->
        <div class="floating-input-bar glass shadow-lg flex items-end" transition:fly={{ x: 15, duration: reducedMotion ? 0 : 150 }}>
          {#if conv.pendingImage}
            <div class="pending-preview-wrapper flex-shrink-0" transition:fade={{ duration: 100 }}>
              <img src="data:{conv.pendingImage.mimeType};base64,{conv.pendingImage.base64}" alt="Attached media" class="pending-preview-img" />
              <button type="button" class="pending-preview-remove" onclick={() => conv.clearPendingImage()} aria-label="Remove attachment">×</button>
            </div>
          {/if}
          <textarea
            bind:this={textarea}
            bind:value={text}
            onkeydown={handleKeydown}
            oninput={autoResize}
            placeholder="Ask me anything..."
            rows="1"
            class="bar-input"
          ></textarea>
          {#if text.trim() !== ''}
            <button
              type="button"
              onclick={submit}
              disabled={chat.isStreaming}
              class="bar-send-btn flex items-center justify-center"
              aria-label="Send message"
              transition:fade={{ duration: 100 }}
            >
              <ArrowUp class="h-4 w-4" />
            </button>
          {/if}
        </div>

        <!-- Camera options button -->
        <div class="relative flex items-center justify-center">
          <button
            type="button"
            onclick={(e) => { e.stopPropagation(); media.toggleCameraMenu(); }}
            class="floating-btn glass shadow-lg flex items-center justify-center text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            aria-label="Camera options"
            transition:fade={{ duration: 150 }}
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

        <!-- Mic button (start voice) -->
        <button
          type="button"
          onclick={onLiveStart}
          class="floating-btn glass shadow-lg flex items-center justify-center text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)]"
          aria-label="Start voice"
          transition:fade={{ duration: 150 }}
        >
          <Mic class="h-4 w-4" />
        </button>
      {/if}
    </div>
  {/if}

  <!-- Webcam Capture modal dialog -->
  {#if media.webcamCaptureOpen}
    <WebcamCaptureModal onCapture={media.onWebcamCapture} onClose={media.closeWebcamCapture} />
  {/if}
</div>

<style>
  .agent-bar-container {
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 65;
    pointer-events: auto;
  }

  /* Shared floating glass/pill button styling */
  .floating-btn {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: var(--radius);
    border: 1px solid var(--color-border);
    background: color-mix(in srgb, var(--color-surface) 80%, transparent);
    backdrop-filter: blur(16px);
    color: var(--color-foreground);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .floating-btn:hover {
    background: color-mix(in srgb, var(--color-surface) 95%, transparent);
    border-color: var(--color-primary);
    transform: scale(1.05);
  }
  .floating-btn:active {
    transform: scale(0.95);
  }

  .floating-orb-btn {
    width: 3.5rem;
    height: 3.5rem;
    border-radius: var(--radius-full);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    position: relative;
    border: 1px solid var(--color-border);
    background: color-mix(in srgb, var(--color-surface) 80%, transparent);
    backdrop-filter: blur(16px);
    box-shadow: var(--shadow-float);
  }
  .floating-orb-btn:hover {
    border-color: var(--color-primary);
    transform: scale(1.05);
  }
  .floating-orb-btn:active {
    transform: scale(0.95);
  }

  .press-ring {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 100%;
    height: 100%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .hidden {
    display: none;
  }
  /* Camera Dropdown Menu */
  .camera-dropdown {
    position: absolute;
    bottom: 3rem;
    right: 0;
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
  /* Inline floating input bar (deployed AgentBar design) */
  .floating-input-bar {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem 0.25rem 0.75rem;
    border-radius: 0.75rem;
    border: 1px solid var(--color-border);
    min-width: 0;
    flex: 1;
    max-height: 5rem;
  }
  .bar-input {
    flex: 1;
    min-width: 0;
    max-height: 80px;
    background: transparent;
    border: none;
    outline: none;
    resize: none;
    font-size: var(--fs-md);
    line-height: 1.5;
    padding: 0.25rem 0;
    color: var(--color-foreground);
  }
  .bar-send-btn {
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
  .bar-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .bar-send-btn:active:not(:disabled) { transform: scale(0.92); }
  .bar-send-btn:hover:not(:disabled) { opacity: 0.92; transform: scale(1.05); }
  .pending-preview-wrapper { position: relative; }
  .pending-preview-img {
    height: 2.25rem;
    width: 2.25rem;
    object-fit: cover;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
  }
  .pending-preview-remove {
    position: absolute;
    top: -0.3rem;
    right: -0.3rem;
    width: 1.1rem;
    height: 1.1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-full);
    background: var(--color-destructive);
    color: white;
    border: none;
    font-size: 0.8rem;
    line-height: 1;
    cursor: pointer;
  }
</style>
