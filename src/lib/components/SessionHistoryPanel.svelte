<script lang="ts">
    import { X, Plus, Trash2, MessageSquare, History } from "@lucide/svelte";
    import Drawer from "$lib/ui/Drawer.svelte";
    import Button from "$lib/ui/Button.svelte";
    import PanelHeader from "$lib/ui/PanelHeader.svelte";
    import PanelActionButton from "$lib/ui/PanelActionButton.svelte";
    import PanelEmptyState from "$lib/ui/PanelEmptyState.svelte";
    import { useSessionHistory } from "$lib/stores/session-history.svelte";
    import type { ConversationMessage } from "$lib/types";

    let {
        open = $bindable(false),
        mode = "drawer",
        onLoad,
        onDelete,
        onNew,
    }: {
        open?: boolean;
        mode?: "drawer" | "inline";
        onLoad: (messages: ConversationMessage[]) => void;
        onDelete: (id: string) => void;
        onNew: () => void;
    } = $props();

    const history = useSessionHistory();

    function timeAgo(ts: number): string {
        const diff = Date.now() - ts;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return "just now";
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }
</script>

{#snippet content()}
    <PanelHeader
        title="Session History"
        icon={History}
        count={history.sessions.length}
        onClose={mode === "drawer" ? () => (open = false) : undefined}
    >
        {#snippet actions()}
            <PanelActionButton
                label="New session"
                icon={Plus}
                tone="primary"
                onclick={() => {
                    onNew();
                    if (mode === "drawer") open = false;
                }}
                aria-label="New session"
            />
        {/snippet}
    </PanelHeader>

    <div class="flex-1 overflow-y-auto p-3">
        {#if history.sessions.length === 0}
            <PanelEmptyState
                icon={MessageSquare}
                title="No saved sessions yet"
                description="Conversations are saved automatically."
            />
        {:else}
            <div class="space-y-2">
                {#each history.sessions as s (s.id)}
                    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                    <div
                        role="button"
                        tabindex="0"
                        onclick={() => {
                            const msgs = history.loadSession(s.id);
                            if (msgs) onLoad(msgs);
                            if (mode === "drawer") open = false;
                        }}
                        onkeydown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                const msgs = history.loadSession(s.id);
                                if (msgs) onLoad(msgs);
                                if (mode === "drawer") open = false;
                            }
                        }}
                        class="flex w-full items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left transition hover:border-[var(--color-primary)]/40"
                    >
                        <div class="min-w-0 flex-1">
                            <p
                                class="line-clamp-1 text-xs font-medium text-[var(--color-foreground)]"
                            >
                                {s.title}
                            </p>
                            <div class="mt-1 flex items-center gap-2">
                                <span
                                    class="text-[10px] text-[var(--color-muted-foreground)]"
                                    >{s.messages.length} msgs</span
                                >
                                <span
                                    class="text-[10px] text-[var(--color-muted-foreground)]"
                                    >{timeAgo(s.updatedAt)}</span
                                >
                            </div>
                        </div>
                        <Button
                            onclick={(e) => {
                                e.stopPropagation();
                                history.deleteSession(s.id);
                                onDelete(s.id);
                            }}
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            class="shrink-0 hover:text-[var(--color-destructive)]"
                            aria-label="Delete session"
                        >
                            <Trash2 class="h-3.5 w-3.5" />
                        </Button>
                    </div>
                {/each}
            </div>
        {/if}
    </div>

{/snippet}

{#if mode === "drawer"}
    <Drawer bind:open side="right">
        {@render content()}
    </Drawer>
{:else}
    <section class="flex h-full min-h-0 flex-col" aria-label="Session History">
        {@render content()}
    </section>
{/if}
