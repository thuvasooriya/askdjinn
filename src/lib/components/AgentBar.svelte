<script lang="ts">
    import { ArrowUp, Mic, MicOff } from "@lucide/svelte";
    import { fade, fly } from "svelte/transition";
    import { browser } from "$app/environment";
    import AgentOrb, { type OrbState } from "./AgentOrb.svelte";
    import CameraMenu from "./shell/CameraMenu.svelte";
    import { useChat } from "$lib/stores/chat.svelte";
    import { useConversation } from "$lib/stores/conversation.svelte";
    import { useLiveVoice } from "$lib/stores/live-voice.svelte";
    import { useProfile } from "$lib/stores/profile.svelte";
    import { useAgentStatus } from "$lib/stores/agent-status.svelte";
    import { devLog } from "$lib/dev-log";
    import { useUI } from "$lib/stores/ui.svelte";
    import { useMediaAttach } from "$lib/attach-media.svelte";
    import WebcamCaptureModal from "./shell/WebcamCaptureModal.svelte";

    const reducedMotion = $derived(
        browser &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );

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
        chat.isStreaming
            ? "thinking"
            : liveActive
              ? liveState === "speaking"
                  ? "speaking"
                  : liveState === "listening"
                    ? "listening"
                    : liveState === "connecting" || liveState === "connected"
                      ? "thinking"
                      : liveState === "error"
                        ? "error"
                        : "idle"
              : agentStatus.isActive
                ? "searching"
                : "idle",
    );

    const hasPendingToolCall = $derived(
        liveVoice.log.some(
            (e) => e.type === "tool-call" && e.status === "pending",
        ),
    );
    const displayOrbState = $derived<OrbState>(
        hasPendingToolCall && orbState !== "speaking" && orbState !== "error"
            ? "searching"
            : orbState,
    );

    const liveStatusLabel = $derived.by(() => {
        if (!liveActive) return null;
        if (liveState === "connecting" || liveState === "connected")
            return "Connecting...";
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
                if (!longPressTriggered) {
                    longPressTriggered = true;
                    onLiveStart();
                }
                return;
            }
            progressRAF = requestAnimationFrame(animateRing);
        }
        progressRAF = requestAnimationFrame(animateRing);
    }

    function endPress(e?: PointerEvent) {
        pressing = false;
        if (progressRAF) {
            cancelAnimationFrame(progressRAF);
            progressRAF = null;
        }
        if (!longPressTriggered && e?.type === "pointerup") {
            ui.agentInputOpen = !ui.agentInputOpen;
            if (ui.agentInputOpen) {
                setTimeout(() => {
                    if (textarea) {
                        textarea.focus();
                        autoResize();
                    }
                }, 100);
            }
        }
        holdProgress = 0;
    }

    function submit() {
        const value = text.trim();
        devLog.uiCommand("agent-bar submit", {
            hasText: value.length > 0,
            liveActive,
            chatStreaming: chat.isStreaming,
        });
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

    // Media attach hook for live mode
    const media = useMediaAttach({
        liveActive: () => liveActive,
        liveVoice,
        conv,
        onLiveStart: () => onLiveStart?.(),
    });
</script>

<div class="agent-bar-container">

    <!-- ── Orb hint (idle state with no conversation) ────────────────────── -->
    {#if displayOrbState === "idle" && !ui.agentInputOpen && conv.lastTurn === null}
      <div class="orb-hint">
        <div class="hint-text">click on the orb to give input<br>and click and hold for awesomeness</div>
        <svg class="hint-arrow" viewBox="0 0 60 80" fill="none" aria-hidden="true">
          <path d="M30 2 C22 6 10 10 10 20 C10 34 50 34 50 20 C50 8 34 4 30 18 C26 32 30 40 36 48 C42 56 44 66 38 74 L30 80"
            stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          <path d="M30 80 L24 72 M30 80 L36 72"
            stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </div>
    {/if}
    <!-- ──────────────────────────────────────────────────────────────────── -->

    {#if liveActive}
        <!-- Hold/Voice Active Mode -->
        <div class="flex items-center gap-3">
            <!-- Disconnect button -->
            <button
                type="button"
                onclick={toggleLive}
                class="glass-btn glass-btn--danger"
                aria-label="Disconnect voice"
                transition:fade={{ duration: 150 }}
            >
                <MicOff class="h-4 w-4" />
            </button>

            <!-- Orb -->
            <div
                class="glass-btn glass-btn--lg"
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
            <div class="relative" transition:fade={{ duration: 150 }}>
                <CameraMenu
                    {media}
                    align="right"
                    triggerClass="glass-btn text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                />
            </div>
        </div>
    {:else}
        <!-- Regular / Minimal / Expanded Mode -->
        <div class="flex items-center gap-3">
            <!-- Orb -->
            <div
                class="glass-btn glass-btn--lg"
                onpointerdown={startPress}
                onpointerup={endPress}
                onpointerleave={endPress}
                role="button"
                tabindex="0"
                aria-label="Agent Orb"
                style="touch-action: none;"
            >
                {#if holdProgress > 0 && holdProgress < 1}
                    <svg
                        class="press-ring"
                        viewBox="0 0 80 80"
                        aria-hidden="true"
                    >
                        <circle
                            cx="40"
                            cy="40"
                            r={RING_RADIUS}
                            fill="none"
                            stroke="var(--color-primary)"
                            stroke-width="4"
                            stroke-dasharray={CIRCUMFERENCE}
                            stroke-dashoffset={CIRCUMFERENCE *
                                (1 - holdProgress)}
                            transform="rotate(-90 40 40)"
                            stroke-linecap="round"
                        />
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
                <div
                    class="floating-input-bar glass shadow-lg flex items-end"
                    transition:fly={{
                        x: 15,
                        duration: reducedMotion ? 0 : 150,
                    }}
                >
                    {#if conv.pendingImage}
                        <div
                            class="pending-preview-wrapper flex-shrink-0"
                            transition:fade={{ duration: 100 }}
                        >
                            <img
                                src="data:{conv.pendingImage
                                    .mimeType};base64,{conv.pendingImage
                                    .base64}"
                                alt="Attached media"
                                class="pending-preview-img"
                            />
                            <button
                                type="button"
                                class="pending-preview-remove"
                                onclick={() => conv.clearPendingImage()}
                                aria-label="Remove attachment">×</button
                            >
                        </div>
                    {/if}
                    <textarea
                        bind:this={textarea}
                        bind:value={text}
                        onkeydown={handleKeydown}
                        oninput={autoResize}
                        placeholder="Ask me anything..."
                        rows="1"
                        class="bar-input"></textarea>
                    {#if text.trim() !== ""}
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
                <div class="relative" transition:fade={{ duration: 150 }}>
                    <CameraMenu
                        {media}
                        align="right"
                        triggerClass="glass-btn text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                    />
                </div>

                <!-- Mic button (start voice) -->
                <button
                    type="button"
                    onclick={onLiveStart}
                    class="glass-btn text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)]"
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
        <WebcamCaptureModal
            onCapture={media.onWebcamCapture}
            onClose={media.closeWebcamCapture}
        />
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

    .press-ring {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 100%;
        height: 100%;
        transform: translate(-50%, -50%);
        pointer-events: none;
    }

    /* Inline floating input bar (deployed AgentBar design) */
    .floating-input-bar {
        display: flex;
        align-items: flex-end;
        gap: 0.5rem;
        padding: 0.25rem 0.5rem 0.25rem 0.75rem;
        border-radius: var(--radius-lg);
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
        transition:
            opacity 0.15s,
            transform 0.1s,
            background-color 0.15s;
        flex-shrink: 0;
    }
    .bar-send-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    .bar-send-btn:active:not(:disabled) {
        transform: scale(0.92);
    }
    .bar-send-btn:hover:not(:disabled) {
        opacity: 0.92;
        transform: scale(1.05);
    }
    .pending-preview-wrapper {
        position: relative;
    }
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

    /* ── Orb hint ──────────────────────────────────────────────────────── */
    .orb-hint {
        position: absolute;
        bottom: calc(100% + 12px);
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        pointer-events: none;
        animation: hint-fade-in 0.6s ease-out;
    }

    @keyframes hint-fade-in {
        from { opacity: 0; transform: translateX(-50%) translateY(8px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    .hint-text {
        text-align: center;
        font-size: var(--fs-xs);
        color: var(--color-muted-foreground);
        line-height: 1.4;
    }

    .hint-arrow {
        width: 28px;
        height: 64px;
        margin-top: -6px;
        opacity: 0.7;
    }
    /* ──────────────────────────────────────────────────────────────────── */
</style>
