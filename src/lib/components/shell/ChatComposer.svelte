<script lang="ts">
    // ChatComposer — the single text input surface for the app.
    // Two variants share all logic, styling tokens, and behaviour:
    //   - "panel":   lives inside the conversation tile (chrome border + focus ring)
    //   - "floating": deployed by AgentBar on orb-tap (glass pill, auto-focus)
    //
    // Actions (submit / options) are rendered externally by the consumer
    // (AgentBar, ConversationTile) — this component is pure textarea + attachments.

    import { useMediaAttach } from "$lib/attach-media.svelte";
    import { useConversation } from "$lib/stores/conversation.svelte";
    import { useLiveVoice } from "$lib/stores/live-voice.svelte";
    import { useChat } from "$lib/stores/chat.svelte";
    import { devLog } from "$lib/dev-log";
    import { X } from "@lucide/svelte";
    import { fade, fly } from "svelte/transition";
    import { browser } from "$app/environment";

    import WebcamCaptureModal from "./WebcamCaptureModal.svelte";

    type Variant = "panel" | "floating";

    let {
        variant = "panel",
        class: className = "",
        liveActive = false,
        onLiveStart,
        placeholder,
        onTextChange,
    }: {
        variant?: Variant;
        class?: string;
        liveActive?: boolean;
        onLiveStart?: () => void;
        placeholder?: string;
        onTextChange?: (hasText: boolean) => void;
    } = $props();

    const chat = useChat();
    const conv = useConversation();
    const liveVoice = useLiveVoice();

    let text = $state("");
    let textarea: HTMLTextAreaElement | undefined = $state();
    let isMultiline = $state(false);

    const reducedMotion = $derived(
        browser &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );

    const isFloating = $derived(variant === "floating");
    const effectivePlaceholder = $derived(
        placeholder ??
            (isFloating ? "Ask me anything..." : "Type a message..."),
    );

    const hasText = $derived(text.trim().length > 0);
    const hasImage = $derived(!!conv.pendingImage);
    const canSend = $derived((hasText || hasImage) && !chat.isStreaming);
    // Notify parent when text presence changes (so external submit button
    // can switch between expand / send icon).
    $effect(() => {
        onTextChange?.(hasText);
    });



    const media = useMediaAttach({
        liveActive: () => liveActive,
        liveVoice,
        conv,
        onLiveStart: () => onLiveStart?.(),
    });

    export function submit() {
        const value = text.trim();
        devLog.uiCommand("chat-composer submit", {
            variant,
            hasText: value.length > 0,
            hasImage,
            liveActive,
            chatStreaming: chat.isStreaming,
        });

        // chat.send() itself consumes conv.pendingImage, so the guard must
        // allow an empty string through when an image is attached.
        if ((!value && !hasImage) || chat.isStreaming) return;

        if (liveActive && liveVoice.state === "listening") {
            liveVoice.sendText(value);
        } else {
            chat.send(value);
        }
        text = "";
        resetHeight();
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
        }
    }

    // One line at --fs-md (12px) / line-height 1.5 = 18px + 12px vertical
    // padding = 30px. Anything taller means the textarea has wrapped.
    const SINGLE_LINE_PX = 32;

    function autoResize() {
        if (!textarea) return;
        textarea.style.height = "auto";
        const h = Math.min(textarea.scrollHeight, 80);
        textarea.style.height = h + "px";
        isMultiline = h > SINGLE_LINE_PX;
    }

    function resetHeight() {
        if (textarea) textarea.style.height = "auto";
        isMultiline = false;
    }

    // Floating variant is deployed on demand (orb-tap) — focus it once mounted,
    // after the fly-in transition has had a moment to start.
    $effect(() => {
        if (!isFloating) return;
        const t = setTimeout(() => {
            textarea?.focus();
            resetHeight();
        }, 120);
        return () => clearTimeout(t);
    });
</script>

<div
    class="composer {className}"
    class:composer--panel={!isFloating}
    class:composer--floating={isFloating}
>
    {#if !isFloating && hasImage}
        <!-- Panel: attachment chip above the input row -->
        <div
            class="attachment-strip"
            transition:fly={{ y: -4, duration: reducedMotion ? 0 : 150 }}
        >
            <img
                src="data:{conv.pendingImage!.mimeType};base64,{conv.pendingImage!
                    .base64}"
                alt="Pending attachment"
                class="attachment-strip-img"
            />
            <span class="attachment-strip-label">Image attached</span>
            <button
                type="button"
                class="attachment-remove"
                onclick={() => conv.clearPendingImage()}
                aria-label="Remove image"
            >
                <X class="h-3 w-3" />
            </button>
        </div>
    {/if}

    <div class="composer-row" class:multiline={isMultiline}>
        {#if isFloating && hasImage}
            <!-- Floating: inline thumbnail inside the pill -->
            <div class="attachment-thumb" transition:fade={{ duration: 100 }}>
                <img
                    src="data:{conv.pendingImage!.mimeType};base64,{conv.pendingImage!
                        .base64}"
                    alt="Attached media"
                    class="attachment-thumb-img"
                />
                <button
                    type="button"
                    class="attachment-thumb-remove"
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
            placeholder={effectivePlaceholder}
            rows="1"
            aria-label={isFloating ? "Message the agent" : "Type a message"}
            class="composer-input"
        ></textarea>


    </div>
</div>

{#if media.webcamCaptureOpen}
    <WebcamCaptureModal
        onCapture={media.onWebcamCapture}
        onClose={media.closeWebcamCapture}
    />
{/if}

<style>
    .composer {
        display: flex;
        flex-direction: column;
        width: 100%;
        gap: 0.5rem;
        padding: 0.125rem 0.5rem 0.125rem 0.75rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        background: color-mix(in srgb, var(--color-surface) 80%, transparent);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        box-shadow: var(--shadow-float);
        transition:
            border-color 0.15s,
            box-shadow 0.15s,
            background-color 0.15s;
    }
    .composer:focus-within {
        border-color: var(--color-primary);
        box-shadow: 0 0 0 1px var(--color-primary), var(--shadow-float);
        background: color-mix(in srgb, var(--color-surface) 90%, transparent);
    }

    /* ── Panel variant ── percentage-based max-width ──
       Narrow (<420px)  : 100% — fill the panel
       Medium           : 80%
       Large (≥768px)   : 40% — compact input bar on wider panels  ── */
    .composer--panel {
        min-width: 5rem;
        max-width: 80%;
    }
    @container (max-width: 420px) {
        .composer--panel { max-width: 100%; }
    }
    @container (min-width: 768px) {
        .composer--panel { max-width: 40%; }
    }

    /* ── Floating variant ── flexible pill deployed by AgentBar. ── */
    .composer--floating {
        min-width: 0;
        flex: 1;
        max-width: 32rem;
        animation: composer-slide-in 0.15s ease-out;
    }
    @keyframes composer-slide-in {
        from {
            opacity: 0;
            transform: translateX(15px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }

    /* ── Input row ── single line: [textarea | actions] ── */
    .composer-row {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        width: 100%;
    }

    /* Multi-line: actions slide to top-right corner. The textarea width is
       UNCHANGED (still flex:1 sharing the row with actions) — this prevents
       the scrollHeight feedback loop where row↔column width changes caused
       the layout to oscillate at the wrap boundary. */
    .composer-row.multiline {
        align-items: flex-start;
    }

    .composer-input {
        flex: 1;
        min-width: 0;
        max-height: 80px;
        overflow-y: auto;
        overflow-wrap: break-word;
        overscroll-behavior: contain;
        background: transparent;
        border: none;
        outline: none;
        resize: none;
        font-size: var(--fs-md);
        line-height: 1.5;
        padding: 0.375rem 0;
        color: var(--color-foreground);
    }





    /* ── Attachment: panel chip (above input) ── */
    .attachment-strip {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.375rem;
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        margin-bottom: 0.5rem;
    }
    .attachment-strip-img {
        height: 2.5rem;
        width: 2.5rem;
        object-fit: cover;
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border);
        flex-shrink: 0;
    }
    .attachment-strip-label {
        flex: 1;
        font-size: var(--fs-xs);
        color: var(--color-muted-foreground);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* ── Attachment: floating inline thumbnail ── */
    .attachment-thumb {
        position: relative;
        flex-shrink: 0;
    }
    .attachment-thumb-img {
        height: 2.25rem;
        width: 2.25rem;
        object-fit: cover;
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
    }
    .attachment-thumb-remove {
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
        color: var(--color-destructive-foreground);
        border: none;
        font-size: 0.8rem;
        cursor: pointer;
        line-height: 1;
    }

    /* Shared remove button — token-driven (was Tailwind red in the panel). */
    .attachment-remove {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 1.25rem;
        height: 1.25rem;
        border-radius: var(--radius-full);
        background: var(--color-destructive);
        color: var(--color-destructive-foreground);
        border: none;
        cursor: pointer;
        flex-shrink: 0;
        transition:
            opacity 0.15s,
            transform 0.1s;
    }
    .attachment-remove:hover {
        opacity: 0.85;
        transform: scale(1.08);
    }



    @media (prefers-reduced-motion: reduce) {
        .composer--panel {
            transition-duration: 0.01ms;
        }
    }
</style>
