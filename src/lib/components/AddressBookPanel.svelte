<script lang="ts">
  import { useAddresses, type Address } from "$lib/stores/addresses.svelte";
  import { MapPin, Plus, Star, MoreVertical, Pencil, Copy, Trash2, X, Check } from "@lucide/svelte";
  import Button from "$lib/ui/Button.svelte";
  import { fade } from "svelte/transition";

  const addr = useAddresses();

  // Form state
  let formOpen = $state(false);
  let editingId = $state<string | null>(null);
  let formLabel = $state("");
  let formRecipientName = $state("");
  let formRecipientPhone = $state("");
  let formStreetAddress = $state("");
  let formCity = $state("");
  let formNotes = $state("");
  let formIsDefault = $state(false);
  let errors = $state<Record<string, string>>({});

  // Menu state
  let menuOpenId = $state<string | null>(null);
  let confirmDeleteId = $state<string | null>(null);

  function resetForm() {
    formLabel = "";
    formRecipientName = "";
    formRecipientPhone = "";
    formStreetAddress = "";
    formCity = "";
    formNotes = "";
    formIsDefault = false;
    errors = {};
    editingId = null;
  }

  function openAdd() {
    resetForm();
    formOpen = true;
    menuOpenId = null;
  }

  function openEdit(a: Address) {
    formLabel = a.label;
    formRecipientName = a.recipientName;
    formRecipientPhone = a.recipientPhone;
    formStreetAddress = a.streetAddress;
    formCity = a.city;
    formNotes = a.notes ?? "";
    formIsDefault = a.isDefault ?? false;
    errors = {};
    editingId = a.id;
    formOpen = true;
    menuOpenId = null;
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!formLabel.trim()) errs.label = "Label is required";
    if (!formRecipientName.trim()) errs.recipientName = "Recipient name is required";
    if (!formCity.trim()) errs.city = "City is required";
    errors = errs;
    return Object.keys(errs).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    const data = {
      label: formLabel.trim(),
      recipientName: formRecipientName.trim(),
      recipientPhone: formRecipientPhone.trim(),
      streetAddress: formStreetAddress.trim(),
      city: formCity.trim(),
      notes: formNotes.trim() || undefined,
      isDefault: formIsDefault,
    };
    if (editingId) {
      addr.update(editingId, data);
    } else {
      addr.add(data);
    }
    formOpen = false;
    resetForm();
  }

  function handleCancel() {
    formOpen = false;
    resetForm();
  }

  function toggleMenu(id: string) {
    menuOpenId = menuOpenId === id ? null : id;
    confirmDeleteId = null;
  }

  function closeMenu() {
    menuOpenId = null;
    confirmDeleteId = null;
  }

  function handleSetDefault(id: string) {
    addr.setDefault(id);
    closeMenu();
  }

  function handleClone(id: string) {
    addr.clone(id);
    closeMenu();
  }

  function handleDeleteClick(id: string) {
    confirmDeleteId = id;
  }

  function confirmDelete(id: string) {
    addr.remove(id);
    closeMenu();
  }

  function cancelDelete() {
    confirmDeleteId = null;
  }

  // Close menu on outside click
  $effect(() => {
    if (menuOpenId) {
      const handler = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest("[data-dropdown]")) {
          closeMenu();
        }
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  });
</script>

<section class="flex h-full min-h-0 flex-col" aria-label="Address Book">
  <!-- Header -->
  <div class="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
    <h2 class="text-sm font-bold text-[var(--color-foreground)]">Address Book</h2>
    {#if !formOpen}
      <Button variant="primary" size="sm" onclick={openAdd}>
        <Plus class="h-3.5 w-3.5" />
        Add address
      </Button>
    {/if}
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto p-3">
    {#if formOpen}
      <!-- Inline form -->
      <div class="space-y-3" transition:fade>
        <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 class="mb-3 text-xs font-semibold text-[var(--color-foreground)]">{editingId ? "Edit Address" : "New Address"}</h3>
          <div class="space-y-3">
            <!-- Label -->
            <div>
              <label for="addr-label" class="mb-1 block text-xs font-medium text-[var(--color-foreground)]">Label</label>
              <input
                id="addr-label"
                type="text"
                bind:value={formLabel}
                placeholder="e.g. Home, Office"
                class="w-full rounded-lg border bg-[var(--color-muted)] px-3 py-2 text-xs text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]/50 focus:border-[var(--color-primary)] focus:outline-none {errors.label ? 'border-[var(--color-destructive)]' : 'border-[var(--color-border)]'}"
              />
              {#if errors.label}<p class="mt-1 text-[10px] text-[var(--color-destructive)]">{errors.label}</p>{/if}
            </div>

            <!-- Recipient Name -->
            <div>
              <label for="addr-recipient" class="mb-1 block text-xs font-medium text-[var(--color-foreground)]">Recipient Name</label>
              <input
                id="addr-recipient"
                type="text"
                bind:value={formRecipientName}
                placeholder="Full name"
                class="w-full rounded-lg border bg-[var(--color-muted)] px-3 py-2 text-xs text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]/50 focus:border-[var(--color-primary)] focus:outline-none {errors.recipientName ? 'border-[var(--color-destructive)]' : 'border-[var(--color-border)]'}"
              />
              {#if errors.recipientName}<p class="mt-1 text-[10px] text-[var(--color-destructive)]">{errors.recipientName}</p>{/if}
            </div>

            <!-- Phone -->
            <div>
              <label for="addr-phone" class="mb-1 block text-xs font-medium text-[var(--color-foreground)]">Phone</label>
              <input
                id="addr-phone"
                type="tel"
                bind:value={formRecipientPhone}
                placeholder="Phone number"
                class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-xs text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]/50 focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>

            <!-- Street Address -->
            <div>
              <label for="addr-street" class="mb-1 block text-xs font-medium text-[var(--color-foreground)]">Street Address</label>
              <textarea
                id="addr-street"
                bind:value={formStreetAddress}
                placeholder="Street address"
                rows="2"
                class="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-xs text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]/50 focus:border-[var(--color-primary)] focus:outline-none"
              ></textarea>
            </div>

            <!-- City -->
            <div>
              <label for="addr-city" class="mb-1 block text-xs font-medium text-[var(--color-foreground)]">City</label>
              <input
                id="addr-city"
                type="text"
                bind:value={formCity}
                placeholder="City"
                class="w-full rounded-lg border bg-[var(--color-muted)] px-3 py-2 text-xs text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]/50 focus:border-[var(--color-primary)] focus:outline-none {errors.city ? 'border-[var(--color-destructive)]' : 'border-[var(--color-border)]'}"
              />
              {#if errors.city}<p class="mt-1 text-[10px] text-[var(--color-destructive)]">{errors.city}</p>{/if}
            </div>

            <!-- Notes -->
            <div>
              <label for="addr-notes" class="mb-1 block text-xs font-medium text-[var(--color-foreground)]">Notes <span class="text-[var(--color-muted-foreground)]">(optional)</span></label>
              <textarea
                id="addr-notes"
                bind:value={formNotes}
                placeholder="Delivery instructions, landmarks, etc."
                rows="2"
                class="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-xs text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]/50 focus:border-[var(--color-primary)] focus:outline-none"
              ></textarea>
            </div>

            <!-- Default checkbox -->
            <label class="flex cursor-pointer items-center gap-2">
              <input type="checkbox" bind:checked={formIsDefault} class="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] accent-[var(--color-primary)]" />
              <span class="text-xs text-[var(--color-foreground)]">Set as default address</span>
            </label>
          </div>

          <!-- Form actions -->
          <div class="mt-4 flex gap-2">
            <Button variant="primary" size="sm" onclick={handleSave} class="flex-1">
              <Check class="h-3.5 w-3.5" />
              Save
            </Button>
            <Button variant="secondary" size="sm" onclick={handleCancel} class="flex-1">
              <X class="h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        </div>
      </div>

    {:else if addr.addresses.length === 0}
      <!-- Empty state -->
      <div class="flex h-full flex-col items-center justify-center px-4 text-center">
        <MapPin class="mb-3 h-10 w-10 text-[var(--color-muted-foreground)]/30" />
        <p class="text-sm font-medium text-[var(--color-foreground)]">No saved addresses</p>
        <p class="mt-1 text-xs text-[var(--color-muted-foreground)]/70">Add one to speed up checkout.</p>
      </div>

    {:else}
      <!-- Address list -->
      <div class="space-y-2" transition:fade>
        {#each addr.addresses as a (a.id)}
          {#if confirmDeleteId === a.id}
            <!-- Delete confirmation -->
            <div class="flex flex-col items-center gap-3 rounded-xl border border-[var(--color-destructive)]/30 bg-[var(--color-surface)] p-4 text-center">
              <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-destructive)]/10">
                <Trash2 class="h-4 w-4 text-[var(--color-destructive)]" />
              </div>
              <div>
                <p class="text-xs font-medium text-[var(--color-foreground)]">Delete this address?</p>
                <p class="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]">"{a.label}" will be permanently removed.</p>
              </div>
              <div class="flex gap-2">
                <button
                  type="button"
                  onclick={() => confirmDelete(a.id)}
                  class="flex items-center gap-1 rounded-lg bg-[var(--color-destructive)] px-3 py-1.5 text-xs font-medium text-[var(--color-destructive-foreground)] transition hover:opacity-90"
                >
                  <Check class="h-3 w-3" />
                  Yes, Delete
                </button>
                <button
                  type="button"
                  onclick={cancelDelete}
                  class="flex items-center gap-1 rounded-lg bg-[var(--color-muted)] px-3 py-1.5 text-xs font-medium text-[var(--color-foreground)] transition hover:bg-[var(--color-surface-elevated)]"
                >
                  <X class="h-3 w-3" />
                  Cancel
                </button>
              </div>
            </div>
          {:else}
            <!-- Address card -->
            <div class="relative rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition hover:border-[var(--color-muted-foreground)]/20">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <h4 class="truncate text-xs font-bold text-[var(--color-foreground)]">{a.label}</h4>
                    {#if a.isDefault}
                      <Star class="h-3 w-3 shrink-0 fill-[var(--color-warning)] text-[var(--color-warning)]" />
                    {/if}
                  </div>
                  <p class="mt-1 text-xs text-[var(--color-foreground)]">{a.recipientName}</p>
                  {#if a.recipientPhone}
                    <p class="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">{a.recipientPhone}</p>
                  {/if}
                  <p class="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">
                    {a.streetAddress}{a.streetAddress && a.city ? ", " : ""}{a.city}
                  </p>
                  {#if a.notes}
                    <p class="mt-1 text-[10px] italic text-[var(--color-muted-foreground)]/70">{a.notes}</p>
                  {/if}
                </div>
                <div class="relative shrink-0" data-dropdown>
                  <button
                    type="button"
                    onclick={() => toggleMenu(a.id)}
                    class="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted-foreground)] transition hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                    aria-label="Address actions"
                  >
                    <MoreVertical class="h-3.5 w-3.5" />
                  </button>

                  {#if menuOpenId === a.id}
                    <div
                      class="absolute right-0 top-8 z-20 w-40 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg"
                      data-dropdown
                      transition:fade={{ duration: 120 }}
                    >
                      <button
                        type="button"
                        onclick={() => openEdit(a)}
                        class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-foreground)] transition hover:bg-[var(--color-muted)]"
                      >
                        <Pencil class="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
                        Edit
                      </button>
                      {#if !a.isDefault}
                        <button
                          type="button"
                          onclick={() => handleSetDefault(a.id)}
                          class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-foreground)] transition hover:bg-[var(--color-muted)]"
                        >
                          <Star class="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
                          Set as default
                        </button>
                      {/if}
                      <button
                        type="button"
                        onclick={() => handleClone(a.id)}
                        class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-foreground)] transition hover:bg-[var(--color-muted)]"
                      >
                        <Copy class="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
                        Clone
                      </button>
                      <div class="mx-2 my-1 border-t border-[var(--color-border)]"></div>
                      <button
                        type="button"
                        onclick={() => handleDeleteClick(a.id)}
                        class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-destructive)] transition hover:bg-[var(--color-destructive)]/10"
                      >
                        <Trash2 class="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
</section>
