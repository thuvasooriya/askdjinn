<script lang="ts">
    import { useAddresses, type Address } from "$lib/stores/addresses.svelte";
    import {
        MapPin,
        Plus,
        Star,
        MoreVertical,
        Pencil,
        Copy,
        Trash2,
        X,
        Check,
    } from "@lucide/svelte";
    import Button from "$lib/ui/Button.svelte";
    import Input from "$lib/ui/Input.svelte";
    import Textarea from "$lib/ui/Textarea.svelte";
    import PanelHeader from "$lib/ui/PanelHeader.svelte";
    import PanelActionButton from "$lib/ui/PanelActionButton.svelte";
    import PanelEmptyState from "$lib/ui/PanelEmptyState.svelte";
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
        if (!formRecipientName.trim())
            errs.recipientName = "Recipient name is required";
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
    <PanelHeader title="Address Book" icon={MapPin}>
        {#snippet actions()}
            {#if !formOpen}
                <PanelActionButton
                    label="Add address"
                    icon={Plus}
                    tone="primary"
                    onclick={openAdd}
                />
            {/if}
        {/snippet}
    </PanelHeader>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-3">
        {#if formOpen}
            <!-- Inline form -->
            <div class="space-y-3" transition:fade>
                <div class="panel-card p-4">
                    <h3
                        class="mb-3 text-xs font-semibold text-[var(--color-foreground)]"
                    >
                        {editingId ? "Edit Address" : "New Address"}
                    </h3>
                    <div class="space-y-3">
                        <!-- Label -->
                        <div>
                            <label
                                for="addr-label"
                                class="mb-1 block text-xs font-medium text-[var(--color-foreground)]"
                                >Label</label
                            >
                            <Input
                                id="addr-label"
                                type="text"
                                bind:value={formLabel}
                                placeholder="e.g. Home, Office"
                                class={errors.label
                                    ? "border-[var(--color-destructive)]"
                                    : ""}
                            />
                            {#if errors.label}<p
                                    class="mt-1 text-[10px] text-[var(--color-destructive)]"
                                >
                                    {errors.label}
                                </p>{/if}
                        </div>

                        <!-- Recipient Name -->
                        <div>
                            <label
                                for="addr-recipient"
                                class="mb-1 block text-xs font-medium text-[var(--color-foreground)]"
                                >Recipient Name</label
                            >
                            <Input
                                id="addr-recipient"
                                type="text"
                                bind:value={formRecipientName}
                                placeholder="Full name"
                                class={errors.recipientName
                                    ? "border-[var(--color-destructive)]"
                                    : ""}
                            />
                            {#if errors.recipientName}<p
                                    class="mt-1 text-[10px] text-[var(--color-destructive)]"
                                >
                                    {errors.recipientName}
                                </p>{/if}
                        </div>

                        <!-- Phone -->
                        <div>
                            <label
                                for="addr-phone"
                                class="mb-1 block text-xs font-medium text-[var(--color-foreground)]"
                                >Phone</label
                            >
                            <Input
                                id="addr-phone"
                                type="tel"
                                bind:value={formRecipientPhone}
                                placeholder="Phone number"
                            />
                        </div>

                        <!-- Street Address -->
                        <div>
                            <label
                                for="addr-street"
                                class="mb-1 block text-xs font-medium text-[var(--color-foreground)]"
                                >Street Address</label
                            >
                            <Textarea
                                id="addr-street"
                                bind:value={formStreetAddress}
                                placeholder="Street address"
                                rows={2}
                            />
                        </div>

                        <!-- City -->
                        <div>
                            <label
                                for="addr-city"
                                class="mb-1 block text-xs font-medium text-[var(--color-foreground)]"
                                >City</label
                            >
                            <Input
                                id="addr-city"
                                type="text"
                                bind:value={formCity}
                                placeholder="City"
                                class={errors.city
                                    ? "border-[var(--color-destructive)]"
                                    : ""}
                            />
                            {#if errors.city}<p
                                    class="mt-1 text-[10px] text-[var(--color-destructive)]"
                                >
                                    {errors.city}
                                </p>{/if}
                        </div>

                        <!-- Notes -->
                        <div>
                            <label
                                for="addr-notes"
                                class="mb-1 block text-xs font-medium text-[var(--color-foreground)]"
                                >Notes <span
                                    class="text-[var(--color-muted-foreground)]"
                                    >(optional)</span
                                ></label
                            >
                            <Textarea
                                id="addr-notes"
                                bind:value={formNotes}
                                placeholder="Delivery instructions, landmarks, etc."
                                rows={2}
                            />
                        </div>

                        <!-- Default checkbox -->
                        <label class="flex cursor-pointer items-center gap-2">
                            <input
                                type="checkbox"
                                bind:checked={formIsDefault}
                                class="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] accent-[var(--color-primary)]"
                            />
                            <span class="text-xs text-[var(--color-foreground)]"
                                >Set as default address</span
                            >
                        </label>
                    </div>

                    <!-- Form actions -->
                    <div class="mt-4 flex gap-2">
                        <Button
                            variant="primary"
                            size="sm"
                            onclick={handleSave}
                            class="flex-1"
                        >
                            <Check class="h-3.5 w-3.5" />
                            Save
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            onclick={handleCancel}
                            class="flex-1"
                        >
                            <X class="h-3.5 w-3.5" />
                            Cancel
                        </Button>
                    </div>
                </div>
            </div>
        {:else if addr.addresses.length === 0}
            <!-- Empty state -->
            <PanelEmptyState
                icon={MapPin}
                title="No saved addresses"
                description="Add one to speed up creating orders."
            />
        {:else}
            <!-- Address list -->
            <div class="space-y-2" transition:fade>
                {#each addr.addresses as a (a.id)}
                    {#if confirmDeleteId === a.id}
                        <!-- Delete confirmation -->
                        <div
                            class="panel-card flex flex-col items-center gap-3 border-[var(--color-destructive)]/30 p-4 text-center"
                        >
                            <div
                                class="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-destructive)]/10"
                            >
                                <Trash2
                                    class="h-4 w-4 text-[var(--color-destructive)]"
                                />
                            </div>
                            <div>
                                <p
                                    class="text-xs font-medium text-[var(--color-foreground)]"
                                >
                                    Delete this address?
                                </p>
                                <p
                                    class="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]"
                                >
                                    "{a.label}" will be permanently removed.
                                </p>
                            </div>
                            <div class="flex gap-2">
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onclick={() => confirmDelete(a.id)}
                                >
                                    <Check class="h-3 w-3" />
                                    Yes, Delete
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onclick={cancelDelete}
                                >
                                    <X class="h-3 w-3" />
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    {:else}
                        <!-- Address card -->
                        <div
                            class="panel-card relative transition hover:border-[var(--color-muted-foreground)]/20"
                        >
                            <div class="flex items-start justify-between gap-2">
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-1.5">
                                        <h4
                                            class="truncate text-xs font-bold text-[var(--color-foreground)]"
                                        >
                                            {a.label}
                                        </h4>
                                        {#if a.isDefault}
                                            <Star
                                                class="h-3 w-3 shrink-0 fill-[var(--color-warning)] text-[var(--color-warning)]"
                                            />
                                        {/if}
                                    </div>
                                    <p
                                        class="mt-1 text-xs text-[var(--color-foreground)]"
                                    >
                                        {a.recipientName}
                                    </p>
                                    {#if a.recipientPhone}
                                        <p
                                            class="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]"
                                        >
                                            {a.recipientPhone}
                                        </p>
                                    {/if}
                                    <p
                                        class="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]"
                                    >
                                        {a.streetAddress}{a.streetAddress &&
                                        a.city
                                            ? ", "
                                            : ""}{a.city}
                                    </p>
                                    {#if a.notes}
                                        <p
                                            class="mt-1 text-[10px] italic text-[var(--color-muted-foreground)]/70"
                                        >
                                            {a.notes}
                                        </p>
                                    {/if}
                                </div>
                                <div class="relative shrink-0" data-dropdown>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        onclick={() => toggleMenu(a.id)}
                                        aria-label="Address actions"
                                    >
                                        <MoreVertical class="h-3.5 w-3.5" />
                                    </Button>

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
                                                <Pencil
                                                    class="h-3.5 w-3.5 text-[var(--color-muted-foreground)]"
                                                />
                                                Edit
                                            </button>
                                            {#if !a.isDefault}
                                                <button
                                                    type="button"
                                                    onclick={() =>
                                                        handleSetDefault(a.id)}
                                                    class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-foreground)] transition hover:bg-[var(--color-muted)]"
                                                >
                                                    <Star
                                                        class="h-3.5 w-3.5 text-[var(--color-muted-foreground)]"
                                                    />
                                                    Set as default
                                                </button>
                                            {/if}
                                            <button
                                                type="button"
                                                onclick={() =>
                                                    handleClone(a.id)}
                                                class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-foreground)] transition hover:bg-[var(--color-muted)]"
                                            >
                                                <Copy
                                                    class="h-3.5 w-3.5 text-[var(--color-muted-foreground)]"
                                                />
                                                Clone
                                            </button>
                                            <div
                                                class="mx-2 my-1 border-t border-[var(--color-border)]"
                                            ></div>
                                            <button
                                                type="button"
                                                onclick={() =>
                                                    handleDeleteClick(a.id)}
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
