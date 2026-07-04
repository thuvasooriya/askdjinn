<script lang="ts">
    // Dock: bottom-right FAB cluster. Two tiers:
    //  1. Salient chips — panels that "jumped out" (needs-input, has-update,
    //     badge>0, pinned). Direct panel access.
    //  2. One persistent MENU button — its fan-out contains the full options
    //     menu directly (New Conversation, Lists, Session History, Settings,
    //     Re-run Onboarding, Clear Data), with any minimized/overflow panels
    //     appended at the top when they exist. No intermediate dialog.

    import {
        ShoppingBag,
        Heart,
        History,
        Send,
        Truck,
        Eye,
        MapPin,
        Layers,
        MessageSquare,
        MoreVertical,
        X,
        Plus,
        RotateCcw,
        Trash2,
        Home,
        Package,
        Brain,
    } from "@lucide/svelte";
    import { type Component } from "svelte";
    import { fly, fade } from "svelte/transition";
    import { browser } from "$app/environment";
    import ConfirmDialog from "$lib/ui/ConfirmDialog.svelte";
    import HandleZone, { type HandleAction } from "$lib/ui/HandleZone.svelte";

    import type { Panel } from "$lib/stores/panel-registry";
    import { useUI } from "$lib/stores/ui.svelte";
    import { useCart } from "$lib/stores/cart.svelte";

    let {
        onNewConversation,
        onRerunOnboarding,
        onClearCache,
        onCartClick,
        isHome = false,
    }: {
        onNewConversation: () => void;
        onRerunOnboarding: () => void;
        onClearCache: () => void;
        onCartClick?: (el: HTMLElement) => void;
        isHome?: boolean;
    } = $props();

    const ui = useUI();
    const cart = useCart();

    const ICONS: Record<string, Component> = {
        products: Layers,
        conversation: MessageSquare,
        cart: ShoppingBag,
        "product-detail": Eye,
        lists: Heart,
        sessions: History,
        checkout: Send,
        "address-select": MapPin,
        "address-form": MapPin,
        "delivery-info": Truck,
        "order-tracking": Truck,
        wishlist: Heart,
        orders: Package,
        "address-book": MapPin,
        memories: Brain,
    };
    function iconFor(panel: Panel): Component {
        return ICONS[panel.type] ?? Layers;
    }

    // Minimized/overflow panels — only panels evicted due to splits or manually minimized.
    const minimizedPanels = $derived(
        ui.placement.minimized.filter((p) => p.type !== "conversation"),
    );
    function badgeFor(panel: Panel): number | string | undefined {
        if (panel.type === "cart")
            return cart.count > 0 ? cart.count : undefined;
        return panel.badge;
    }
    const minimizedActions = $derived<HandleAction[]>(
        minimizedPanels.map((panel) => ({
            id: panel.id,
            icon: iconFor(panel),
            label: panel.title,
            onClick: (e: MouseEvent) => activate(panel, e),
            variant:
                ui.activePanelId === panel.id ? ("active" as const) : undefined,
            urgent: panel.status === "needs-input",
            badge: badgeFor(panel),
        })),
    );

    const reducedMotion = $derived(
        browser &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    let expanded = $state(false);
    function toggle(e?: MouseEvent) {
        e?.stopPropagation();
        expanded = !expanded;
    }
    function collapse() {
        expanded = false;
    }

    function activate(panel: Panel, e: MouseEvent) {
        if (panel.minimized) ui.restore(panel.id);
        else ui.focus(panel.id);
        if (panel.type === "cart")
            onCartClick?.(e.currentTarget as HTMLElement);
        collapse();
    }

    // Outside-click / Esc to collapse the fan-out.
    let dockEl: HTMLElement | undefined = $state();
    function onWindowClick(e: MouseEvent) {
        if (expanded && dockEl && !dockEl.contains(e.target as Node))
            collapse();
    }
    function onKeydown(e: KeyboardEvent) {
        if (e.key === "Escape" && expanded) collapse();
    }

    let confirmClearOpen = $state(false);
    function requestClearCache() {
        confirmClearOpen = true;
        collapse();
    }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onKeydown} />

{#if minimizedPanels.length > 0}
    <HandleZone
        anchor="right-middle"
        orientation="vertical"
        label="Minimized panels"
        autoCollapseMs={4000}
        actions={minimizedActions}
    />
{/if}

{#if ui.isSplit || !ui.agentInputOpen}
    <div
        class="options-menu-container"
        bind:this={dockEl}
        transition:fade={{ duration: 150 }}
    >
        <!-- Home Button (hidden when already on home screen) -->
        {#if !isHome}
            <button
                type="button"
                class="glass-btn"
                onclick={() => {
                    ui.goHome();
                    collapse();
                }}
                aria-label="Home"
                title="Home"
            >
                <Home class="h-4 w-4" />
            </button>
        {/if}

        <!-- Options Menu Button (fixed in the bottom-right corner) -->
        <button
            type="button"
            class="glass-btn {expanded ? 'glass-btn--active' : ''}"
            onclick={toggle}
            aria-label="Options Menu"
            aria-haspopup="true"
            aria-expanded={expanded}
            title="Options Menu"
        >
            {#if expanded}<X class="h-4 w-4" />{:else}<MoreVertical
                    class="h-4 w-4"
                />{/if}
        </button>

        {#if expanded}
            <div
                class="dropdown-menu dropdown-menu--right dropdown-menu--menu"
                role="menu"
                aria-label="Options"
                transition:fly={{ y: 8, duration: reducedMotion ? 0 : 150 }}
            >
                <!-- Options menu (direct — no separate settings dialog) -->
                {#if ui.canRestoreLastLayout}
                    <button
                        type="button"
                        class="dropdown-item"
                        role="menuitem"
                        onclick={() => {
                            ui.restoreLastLayout();
                            collapse();
                        }}
                    >
                        <RotateCcw class="h-4 w-4" />
                        <span class="flex-1">Restore Layout</span>
                    </button>
                    <div class="dropdown-sep"></div>
                {/if}
                <button
                    type="button"
                    class="dropdown-item"
                    class:dropdown-item--active={ui.isOpen("wishlist")}
                    role="menuitemcheckbox"
                    aria-checked={ui.isOpen("wishlist")}
                    onclick={() => {
                        ui.togglePanel("wishlist" as never);
                        collapse();
                    }}
                >
                    <Heart class="h-4 w-4" />
                    <span class="flex-1">Wishlist</span>
                </button>
                <button
                    type="button"
                    class="dropdown-item"
                    class:dropdown-item--active={ui.isOpen("sessions")}
                    role="menuitemcheckbox"
                    aria-checked={ui.isOpen("sessions")}
                    onclick={() => {
                        ui.togglePanel("sessions" as never);
                        collapse();
                    }}
                >
                    <History class="h-4 w-4" />
                    <span class="flex-1">Session History</span>
                </button>
                <button
                    type="button"
                    class="dropdown-item"
                    class:dropdown-item--active={ui.isOpen("orders")}
                    role="menuitemcheckbox"
                    aria-checked={ui.isOpen("orders")}
                    onclick={() => {
                        ui.togglePanel("orders" as never);
                        collapse();
                    }}
                >
                    <Package class="h-4 w-4" />
                    <span class="flex-1">Orders</span>
                </button>
                <button
                    type="button"
                    class="dropdown-item"
                    class:dropdown-item--active={ui.isOpen("address-book")}
                    role="menuitemcheckbox"
                    aria-checked={ui.isOpen("address-book")}
                    onclick={() => {
                        ui.togglePanel("address-book" as never);
                        collapse();
                    }}
                >
                    <MapPin class="h-4 w-4" />
                    <span class="flex-1">Address Book</span>
                </button>
                <button
                    type="button"
                    class="dropdown-item"
                    class:dropdown-item--active={ui.isOpen("memories")}
                    role="menuitemcheckbox"
                    aria-checked={ui.isOpen("memories")}
                    onclick={() => {
                        ui.togglePanel("memories" as never);
                        collapse();
                    }}
                >
                    <Brain class="h-4 w-4" />
                    <span class="flex-1">Memories</span>
                </button>
                <div class="dropdown-sep"></div>
                <button
                    type="button"
                    class="dropdown-item"
                    role="menuitem"
                    onclick={() => {
                        onNewConversation();
                        collapse();
                    }}
                >
                    <Plus class="h-4 w-4" />
                    <span class="flex-1">New Conversation</span>
                </button>
                <button
                    type="button"
                    class="dropdown-item"
                    role="menuitem"
                    onclick={() => {
                        onRerunOnboarding();
                        collapse();
                    }}
                >
                    <RotateCcw class="h-4 w-4" />
                    <span class="flex-1">Re-run Onboarding</span>
                </button>
                <button
                    type="button"
                    class="dropdown-item dropdown-item--danger"
                    role="menuitem"
                    onclick={requestClearCache}
                >
                    <Trash2 class="h-4 w-4" />
                    <span class="flex-1">Clear All Data</span>
                </button>
            </div>
        {/if}
    </div>
{/if}

<ConfirmDialog
    bind:open={confirmClearOpen}
    title="Clear all data?"
    description="This permanently erases your conversation, cart, wishlist, saved addresses, memories, session history, and preferences on this device. This can't be undone."
    confirmLabel="Clear everything"
    variant="destructive"
    onConfirm={onClearCache}
/>

<style>
    .options-menu-container {
        position: fixed;
        bottom: 0.75rem;
        right: 0.75rem;
        z-index: 58;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 0.5rem;
    }
</style>
