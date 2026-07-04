<script lang="ts">
    import { useMediaAttach } from "$lib/attach-media.svelte";
    import { useConversation } from "$lib/stores/conversation.svelte";
    import { useProfile } from "$lib/stores/profile.svelte";
    import { useLiveVoice } from "$lib/stores/live-voice.svelte";
    import { useChat } from "$lib/stores/chat.svelte";
    import { useUI } from "$lib/stores/ui.svelte";
    import { devLog } from "$lib/dev-log";
    import { ArrowUp, X } from "@lucide/svelte";
    import { scale } from "svelte/transition";
    import { browser } from "$app/environment";
    import WebcamCaptureModal from "./WebcamCaptureModal.svelte";
    import CameraMenu from "./CameraMenu.svelte";

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

    const reducedMotion = $derived(
        browser &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );

    const media = useMediaAttach({
        liveActive: () => liveActive,
        liveVoice,
        conv,
        onLiveStart: () => onLiveStart?.(),
    });
    function submit() {
        const value = text.trim();
        devLog.uiCommand("chat-input submit", {
            hasText: value.length > 0,
            liveActive,
            chatStreaming: chat.isStreaming,
        });

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

<div class="chat-input-container {className}">
    {#if conv.pendingImage}
        <div
            class="flex items-center gap-2 p-1.5 border border-[var(--color-border-subtle)] rounded-lg bg-[var(--color-surface)] mb-2 relative"
            transition:scale={{ duration: 150 }}
        >
            <img
                src="data:{conv.pendingImage.mimeType};base64,{conv.pendingImage
                    .base64}"
                alt="Pending attachment"
                class="h-10 w-10 object-cover rounded-md border border-[var(--color-border)]"
            />
            <span
                class="text-[10px] text-[var(--color-muted-foreground)] flex-1 truncate"
                >Image attached</span
            >
            <button
                type="button"
                class="remove-btn text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 p-1 rounded-full"
                onclick={() => conv.clearPendingImage()}
                aria-label="Remove image"
            >
                <X class="h-3.5 w-3.5" />
            </button>
        </div>
    {/if}

    <div class="flex items-end gap-2 w-full">
        <!-- Camera/Attachment options -->
        <CameraMenu
            {media}
            align="left"
            triggerClass="action-btn flex items-center justify-center text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors p-1.5"
        />

        <!-- Text area input -->
        <textarea
            bind:this={textarea}
            bind:value={text}
            onkeydown={handleKeydown}
            oninput={autoResize}
            placeholder="Type a message..."
            rows="1"
            class="chat-input"></textarea>

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
    <WebcamCaptureModal
        onCapture={media.onWebcamCapture}
        onClose={media.closeWebcamCapture}
    />
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
        transition:
            opacity 0.15s,
            transform 0.1s,
            background-color 0.15s;
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
</style>
