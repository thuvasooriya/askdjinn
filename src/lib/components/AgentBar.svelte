<script lang="ts">
    import { MicOff, Captions } from "@lucide/svelte";
    import { fade } from "svelte/transition";
    import AgentOrb, { type OrbState } from "./AgentOrb.svelte";
    import OptionsMenu from "./shell/OptionsMenu.svelte";
    import ChatComposer from "./shell/ChatComposer.svelte";
    import { useSessionPhase } from "$lib/stores/session-phase.svelte";
    import { useConversation } from "$lib/stores/conversation.svelte";
    import { useLiveVoice } from "$lib/stores/live-voice.svelte";
    import { useProfile } from "$lib/stores/profile.svelte";
    import { useUI } from "$lib/stores/ui.svelte";
    import { useMediaAttach } from "$lib/attach-media.svelte";
    import WebcamCaptureModal from "./shell/WebcamCaptureModal.svelte";
    import SpiralArrow from "./SpiralArrow.svelte";


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
    const sessionPhase = useSessionPhase();
    const conv = useConversation();
    const liveVoice = useLiveVoice();
    const profile = useProfile();

    let pressing = $state(false);
    let longPressTriggered = $state(false);
    let holdProgress = $state(0);
    let progressRAF: ReturnType<typeof requestAnimationFrame> | null = null;
    let pressStartTime = 0;
    let inputOpen = $derived(ui.agentInputOpen);
    const LONG_PRESS_MS = 500;
    const RING_RADIUS = 34;
    const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
    let hintVisible = $state(false);
    let hintTimer: ReturnType<typeof setTimeout> | undefined = $state();
    $effect(() => {
        const shouldPrepare = displayOrbState === "idle" && !ui.agentInputOpen && conv.lastTurn === null;
        if (shouldPrepare) {
            hintTimer = setTimeout(() => { hintVisible = true; }, 4000);
        } else {
            clearTimeout(hintTimer);
            hintVisible = false;
        }
        return () => clearTimeout(hintTimer);
    });

    $effect(() => () => {
        if (progressRAF) cancelAnimationFrame(progressRAF);
    });

    // Orb phase comes from the single session-phase store -- no more local
    // re-derivation from liveVoice.state / chat.isStreaming / agentStatus.
    // Priority: error > speaking > listening > tool-running > thinking > idle.
    const displayOrbState = $derived<OrbState>(
        sessionPhase.phase === "error" ? "error"
        : sessionPhase.phase === "speaking" ? "speaking"
        : sessionPhase.phase === "listening" ? "listening"
        : sessionPhase.phase === "tool-running" || sessionPhase.hasPendingToolCall ? "searching"
        : sessionPhase.phase === "connecting"
          || sessionPhase.phase === "thinking"
          || sessionPhase.phase === "text-streaming" ? "thinking"
        : "idle",
    );

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
        }
        holdProgress = 0;
    }


    // Media attach hook for live mode
    const media = useMediaAttach({
        liveActive: () => liveActive,
        liveVoice,
        conv,
        onLiveStart: () => onLiveStart?.(),
    });
</script>

<div class="agent-bar-container" data-bubble-preserve>

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

            <!-- Transcript toggle: show/hide voice transcript bubbles -->
            <button
                type="button"
                onclick={() => (ui.voiceTranscript = !ui.voiceTranscript)}
                class="glass-btn"
                aria-label={ui.voiceTranscript ? "Hide transcript" : "Show transcript"}
                aria-pressed={ui.voiceTranscript}
                title={ui.voiceTranscript ? "Hide transcript" : "Show transcript"}
                style:opacity={ui.voiceTranscript ? 1 : 0.5}
                transition:fade={{ duration: 150 }}
            >
                <Captions class="h-4 w-4" />
            </button>

            <!-- Options button in live mode (no voice — already live) -->
            <div class="relative" transition:fade={{ duration: 150 }}>
                <OptionsMenu
                    {media}
                    align="right"
                    triggerClass="glass-btn"
                />
            </div>
            </div>
    {:else}
        <!-- Regular / Minimal / Expanded Mode -->
        <div class="flex items-center gap-3" class:agent-bar-expanded={inputOpen}>
            <div class="orb-wrapper">
                {#if hintVisible}
                  <div class="orb-hint">
                    <div class="hint-text">click on the orb to give input<br>and click and hold for awesomeness</div>
                    <SpiralArrow class="hint-arrow" />
                  </div>
                {/if}
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
            </div>

            {#if inputOpen}
                <ChatComposer
                    variant="floating"
                    {liveActive}
                    {onLiveStart}
                />
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
        z-index: 1001;
        pointer-events: auto;
    }

    /* When the input is open, give the row a definite width so the composer's
       flex:1 can actually grow to fill the available mobile viewport. */
    .agent-bar-expanded {
        width: calc(100vw - 2rem);
        max-width: 36rem;
    }

    .press-ring {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 130%;
        height: 130%;
        transform: translate(-50%, -50%);
        pointer-events: none;
    }

    /* ── Orb hint ──────────────────────────────────────────────────────── */
    .orb-wrapper {
        position: relative;
    }
    .orb-hint {
        position: absolute;
        bottom: 20%;
        right: 10%;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        pointer-events: none;
        animation: hint-fade-in 0.6s ease-out;
    }
    @keyframes hint-fade-in {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
    }
    .hint-text {
        text-align: left;
        font-family: "Caveat Variable", cursive;
        font-size: clamp(1rem, 2.5vw, 1.125rem);
        color: var(--color-muted-foreground);
        line-height: 1;
        max-width: min(240px, 70vw);
        margin-bottom: -100%;
        margin-left: -170%;
    }
    :global(.hint-arrow) {
        width: clamp(60px, 7vw, 72px);
        height: clamp(130px, 18vw, 192px);
        color: var(--color-muted-foreground);
        opacity: 0.7;
    }
</style>
