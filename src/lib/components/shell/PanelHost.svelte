<script lang="ts">
    // PanelHost: renders a single panel inside its layout slot. Measures the
    // slot via ResizeObserver, computes an aspect tier, and passes it to panels
    // that adapt (e.g. ProductDetailContent). Wraps each panel type in
    // consistent tile chrome.
    //
    // Panel-type-specific rendering delegates to the existing components:
    //  - products  → ProductThreadsTile
    //  - conversation → ConversationTile
    //  - dynamic   → DynamicPanel (agent-driven)
    //  - static    → PanelContent (cart / product-detail / lists / sessions)
    //
    // The cart "fly-to-cart" target and onCheckout are plumbed via callbacks so
    // AppShell keeps ownership of cross-panel interactions.

    import type { Panel } from "$lib/stores/panel-registry";
    import type { Product } from "$lib/shopping-engine";
    import ProductThreadsTile from "$lib/components/ProductThreadsTile.svelte";
    import ConversationTile from "$lib/components/ConversationTile.svelte";
    import DynamicPanel from "$lib/components/DynamicPanel.svelte";
    import PanelContent from "./PanelContent.svelte";
    import HandleZone, { type HandleAction } from "$lib/ui/HandleZone.svelte";
    import { X, ChevronDown } from "@lucide/svelte";
    import { useUI } from "$lib/stores/ui.svelte";

    let {
        panel,
        onClose,
        onAddProduct,
        onClickProduct,
        onCheckout,
        liveActive = false,
    }: {
        panel: Panel;
        onClose: () => void;
        onAddProduct?: (product: Product, sourceEl: HTMLElement | null) => void;
        onClickProduct?: (product: Product) => void;
        onCheckout?: () => void;
        liveActive?: boolean;
    } = $props();

    let hostEl: HTMLElement | undefined = $state();
    let aspect = $state<"compact" | "portrait" | "landscape" | "square">(
        "portrait",
    );

    // Provide no-op defaults so the always-required child props typecheck even
    // when the host caller didn't supply a callback for this panel type.
    const noop = () => {};
    const noopProduct2 = (_p: Product, _e: HTMLElement | null = null) => {};
    const noopProduct1 = (_p: Product) => {};
    // For ProductThreadsTile (which passes product + source element).
    const addProduct2 = (p: Product, e: HTMLElement | null) =>
        (onAddProduct ?? noopProduct2)(p, e);
    // For PanelContent (which passes only the product — no fly-to-cart element).
    const addProduct1 = (p: Product) => (onAddProduct ?? noopProduct2)(p, null);
    const clickProduct = (p: Product) => (onClickProduct ?? noop)(p);
    const checkout = () => (onCheckout ?? noop)();
    const ui = useUI();
    // Panels that render their own header with actions — the handle still
    // appears on ALL panels; this just flags panels with custom header chrome.
    const hasOwnHeader = $derived(
        [
            "conversation",
            "checkout",
            "address-select",
            "address-form",
            "wishlist",
            "delivery-info",
            "order-tracking",
            "lists",
            "sessions",
            "orders",
            "address-book",
            "memories",
        ].includes(panel.type),
    );

    // The conversation panel can only be minimized (which drops it back to the
    // floating AgentBar bubble) — closing it outright doesn't make sense since
    // it's the primary chat surface, and "minimize" already fully hides it.
    const isConversation = $derived(panel.type === "conversation");
    const handleActions = $derived<HandleAction[]>(
        isConversation
            ? [
                  {
                      id: "minimize",
                      icon: ChevronDown,
                      label: "Minimize to bubble",
                      onClick: () => ui.minimize(panel.id),
                  },
              ]
            : [
                  {
                      id: "minimize",
                      icon: ChevronDown,
                      label: "Minimize",
                      onClick: () => ui.minimize(panel.id),
                  },
                  {
                      id: "close",
                      icon: X,
                      label: "Close",
                      onClick: () => ui.close(panel.id),
                      variant: "danger" as const,
                  },
              ],
    );

    // Measure the slot → aspect tier. Re-runs on resize. The aspect is what
    // adaptive panels (ProductDetailContent) use to pick a layout variant.
    $effect(() => {
        if (!hostEl || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver((entries) => {
            const cr = entries[0]?.contentRect;
            if (!cr) return;
            const ratio = cr.width / Math.max(cr.height, 1);
            if (cr.width < 280 || cr.height < 240) aspect = "compact";
            else if (ratio > 1.3) aspect = "landscape";
            else if (ratio < 0.8) aspect = "portrait";
            else aspect = "square";
        });
        ro.observe(hostEl);
        return () => ro.disconnect();
    });
</script>

<div
    class="tile-host"
    bind:this={hostEl}
    role="region"
    aria-label={panel.title}
>
    <HandleZone
        anchor="top-center"
        actions={handleActions}
        label={panel.title}
    />
    <div class="host-body">
        {#if panel.type === "products"}
            <ProductThreadsTile onClickProduct={clickProduct} />
        {:else if panel.type === "conversation"}
            <ConversationTile {liveActive} />
        {:else if panel.kind === "dynamic"}
            <DynamicPanel {panel} />
        {:else}
            <PanelContent
                id={panel.id === "product-detail" ? "product-detail" : panel.id}
                onCheckout={checkout}
                onAddProduct={addProduct1}
                {aspect}
            />
        {/if}
    </div>
</div>

<style>
    .tile-host {
        position: relative;
        display: flex;
        flex-direction: column;
        min-height: 0;
        width: 100%;
        height: 100%;
        min-width: 0;
        overflow: hidden;
        border-radius: var(--radius-xl);
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        animation: panel-enter 0.2s ease-out;
    }

    @keyframes panel-enter {
        from {
            opacity: 0;
            transform: scale(0.97);
        }
        to {
            opacity: 1;
            transform: scale(1);
        }
    }
    .host-body {
        flex: 1;
        min-height: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    @media (prefers-reduced-motion: reduce) {
        .tile-host {
            animation: none;
        }
    }
</style>
