<script lang="ts">
  import { X, Plus, Trash2, MessageSquare } from "@lucide/svelte";
  import Drawer from "$lib/ui/Drawer.svelte";
  import Button from "$lib/ui/Button.svelte";
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
  <div class="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-4">
    <div class="flex items-center gap-2">
      <h3 class="text-sm font-bold text-[var(--color-foreground)]">Session History</h3>
      <span class="rounded-full bg-[var(--color-muted)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--color-muted-foreground)]">{history.sessions.length}</span>
    </div>
    {#if mode === "drawer"}<Button variant="ghost" size="icon-sm" onclick={() => (open = false)} aria-label="Close"><X class="h-4 w-4" /></Button>{/if}
  </div>

  <div class="flex-1 overflow-y-auto p-3">
    {#if history.sessions.length === 0}
      <div class="flex h-full flex-col items-center justify-center text-center">
        <MessageSquare class="mb-3 h-10 w-10 text-[var(--color-muted-foreground)]/30" />
        <p class="text-sm text-[var(--color-muted-foreground)]">No saved sessions yet</p>
        <p class="mt-1 text-xs text-[var(--color-muted-foreground)]/70">Conversations are saved automatically</p>
      </div>
    {:else}
      <div class="space-y-2">
        {#each history.sessions as s (s.id)}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div
            role="button"
            tabindex="0"
            onclick={() => { const msgs = history.loadSession(s.id); if (msgs) onLoad(msgs); if (mode === "drawer") open = false; }}
            onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const msgs = history.loadSession(s.id); if (msgs) onLoad(msgs); if (mode === "drawer") open = false; } }}
            class="flex w-full items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left transition hover:border-[var(--color-primary)]/40"
          >
            <div class="min-w-0 flex-1">
              <p class="line-clamp-1 text-xs font-medium text-[var(--color-foreground)]">{s.title}</p>
              <div class="mt-1 flex items-center gap-2">
                <span class="text-[10px] text-[var(--color-muted-foreground)]">{s.messages.length} msgs</span>
                <span class="text-[10px] text-[var(--color-muted-foreground)]">{timeAgo(s.updatedAt)}</span>
              </div>
            </div>
            <button onclick={(e) => { e.stopPropagation(); history.deleteSession(s.id); onDelete(s.id); }} type="button" class="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--color-muted-foreground)] transition hover:text-[var(--color-destructive)]" aria-label="Delete session">
              <Trash2 class="h-3.5 w-3.5" />
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="border-t border-[var(--color-border)] p-4">
    <Button variant="primary" class="w-full" onclick={() => { onNew(); if (mode === "drawer") open = false; }}>
      <Plus class="h-4 w-4" /> New conversation
    </Button>
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
