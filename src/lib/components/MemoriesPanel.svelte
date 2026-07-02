<script lang="ts">
  import { useProfile, type SavedFact } from "$lib/stores/profile.svelte";
  import { Brain, Plus, Trash2, Pencil, X, Check } from "@lucide/svelte";

  const profile = useProfile();

  let showAddForm = $state(false);
  let editingId = $state<string | null>(null);
  let deletingId = $state<string | null>(null);

  let formCategory = $state<SavedFact["category"]>("preference");
  let formText = $state("");

  const grouped = $derived.by(() => {
    const map: Record<string, SavedFact[]> = {};
    for (const f of profile.savedFacts) {
      (map[f.category] ??= []).push(f);
    }
    return map;
  });

  const categoryLabels: Record<string, string> = {
    preference: "Preferences",
    address: "Addresses",
    size: "Sizes",
    allergy: "Allergies",
    date: "Important Dates",
    other: "Other",
  };

  const categoryOrder: SavedFact["category"][] = [
    "preference",
    "address",
    "size",
    "allergy",
    "date",
    "other",
  ];

  const categoryOptions: { value: SavedFact["category"]; label: string }[] = [
    { value: "preference", label: "Preference" },
    { value: "address", label: "Address" },
    { value: "size", label: "Size" },
    { value: "allergy", label: "Allergy" },
    { value: "date", label: "Date" },
    { value: "other", label: "Other" },
  ];

  function startAdd() {
    formCategory = "preference";
    formText = "";
    showAddForm = true;
    editingId = null;
  }

  function startEdit(fact: SavedFact) {
    formCategory = fact.category;
    formText = fact.text;
    editingId = fact.id;
    showAddForm = false;
  }

  function cancelForm() {
    showAddForm = false;
    editingId = null;
    formText = "";
    formCategory = "preference";
  }

  function saveFact() {
    const text = formText.trim();
    if (!text) return;
    if (editingId) {
      profile.removeFact(editingId);
    }
    profile.addFact(text, formCategory);
    cancelForm();
  }

  function handleDelete(id: string) {
    profile.removeFact(id);
    if (deletingId === id) deletingId = null;
    if (editingId === id) editingId = null;
  }
</script>

<section class="flex h-full min-h-0 flex-col" aria-label="Memories">
  <!-- Header -->
  <div class="border-b border-[var(--color-border)] px-4 py-4">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-sm font-bold text-[var(--color-foreground)]">Memories</h3>
        <p class="mt-0.5 text-[10px] leading-tight text-[var(--color-muted-foreground)]">What I know about you</p>
      </div>
      <button
        type="button"
        onclick={startAdd}
        class="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-foreground)] transition hover:bg-[var(--color-muted)]"
        aria-label="Add memory"
      >
        <Plus class="h-3.5 w-3.5" />
        Add memory
      </button>
    </div>
  </div>

  <!-- Add form -->
  {#if showAddForm}
    <div class="border-b border-[var(--color-border)] px-4 py-3">
      <div class="glass rounded-xl p-3">
        <div class="space-y-2.5">
          <select
            bind:value={formCategory}
            class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
          >
            {#each categoryOptions as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
          <textarea
            bind:value={formText}
            placeholder="What should I remember?"
            rows="2"
            class="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] outline-none transition focus:border-[var(--color-primary)]"
          ></textarea>
          <div class="flex items-center gap-2">
            <button
              type="button"
              onclick={saveFact}
              disabled={!formText.trim()}
              class="flex items-center gap-1 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check class="h-3 w-3" />
              Save
            </button>
            <button
              type="button"
              onclick={cancelForm}
              class="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)]"
            >
              <X class="h-3 w-3" />
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Content -->
  {#if profile.savedFacts.length === 0}
    <div class="flex flex-1 items-center justify-center px-4">
      <div class="text-center">
        <Brain class="mx-auto h-10 w-10 text-[var(--color-muted-foreground)]/30" />
        <p class="mt-3 text-sm font-medium text-[var(--color-muted-foreground)]">No memories yet</p>
        <p class="mt-1 max-w-56 text-xs text-[var(--color-muted-foreground)]/60">
          Tell me about yourself and I'll remember it for next time.
        </p>
      </div>
    </div>
  {:else}
    <div class="flex-1 overflow-y-auto p-3">
      {#each categoryOrder as cat}
        {@const facts = grouped[cat]}
        {#if facts?.length}
          <div class="mb-4">
            <h4 class="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted-foreground)]">
              {categoryLabels[cat]}
            </h4>
            <div class="space-y-1.5">
              {#each facts as fact (fact.id)}
                {#if editingId === fact.id}
                  <!-- Edit form inline -->
                  <div class="glass rounded-xl p-3">
                    <div class="space-y-2.5">
                      <select
                        bind:value={formCategory}
                        class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
                      >
                        {#each categoryOptions as opt}
                          <option value={opt.value}>{opt.label}</option>
                        {/each}
                      </select>
                      <textarea
                        bind:value={formText}
                        placeholder="What should I remember?"
                        rows="2"
                        class="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] outline-none transition focus:border-[var(--color-primary)]"
                      ></textarea>
                      <div class="flex items-center gap-2">
                        <button
                          type="button"
                          onclick={saveFact}
                          disabled={!formText.trim()}
                          class="flex items-center gap-1 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Check class="h-3 w-3" />
                          Save
                        </button>
                        <button
                          type="button"
                          onclick={cancelForm}
                          class="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)]"
                        >
                          <X class="h-3 w-3" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                {:else}
                  <!-- Fact card -->
                  <div class="glass rounded-xl p-3">
                    <div class="flex items-start gap-2">
                      <p class="flex-1 text-xs leading-relaxed text-[var(--color-foreground)]">
                        {fact.text}
                      </p>
                      <div class="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onclick={() => startEdit(fact)}
                          class="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)]"
                          aria-label="Edit fact"
                        >
                          <Pencil class="h-3 w-3" />
                        </button>
                        {#if deletingId === fact.id}
                          <button
                            type="button"
                            onclick={() => handleDelete(fact.id)}
                            class="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-destructive)] transition hover:bg-[var(--color-destructive)]/10"
                            aria-label="Confirm delete"
                          >
                            <Check class="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onclick={() => (deletingId = null)}
                            class="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)]"
                            aria-label="Cancel delete"
                          >
                            <X class="h-3 w-3" />
                          </button>
                        {:else}
                          <button
                            type="button"
                            onclick={() => (deletingId = fact.id)}
                            class="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-muted-foreground)] transition hover:text-[var(--color-destructive)]"
                            aria-label="Delete fact"
                          >
                            <Trash2 class="h-3 w-3" />
                          </button>
                        {/if}
                      </div>
                    </div>
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</section>
