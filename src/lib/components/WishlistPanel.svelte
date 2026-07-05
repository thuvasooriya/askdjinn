<script lang="ts">
    import { proxiedSrc } from "$lib/image";
    import {
        Heart,
        Eye,
        Trash2,
        Download,
        Upload,
        Sparkles,
        TrendingDown,
        Package,
        Check,
    } from "@lucide/svelte";
    import { useLists } from "$lib/stores/lists.svelte";
    import type { WatchEntry, ListsData } from "$lib/stores/lists.svelte";
    import { useUI } from "$lib/stores/ui.svelte";
    import { toasts } from "$lib/ui/toast";
    import { formatMoney } from "$lib/money";
    import { fade, fly } from "svelte/transition";
    import type { Product } from "$lib/shopping-engine";
    import { untrack } from "svelte";
    import PanelHeader from "$lib/ui/PanelHeader.svelte";
    import PanelActionButton from "$lib/ui/PanelActionButton.svelte";
    import PanelEmptyState from "$lib/ui/PanelEmptyState.svelte";
    import Button from "$lib/ui/Button.svelte";

    const lists = useLists();
    const ui = useUI();
    let imgErrors = $state<Set<string>>(new Set());

    // Unified wishlist item structure
    interface WishlistItem {
        product: Product;
        liked: boolean;
        watch: WatchEntry | null;
        addedAt: number;
    }

    // Pure derived state: merges lists.liked + lists.watch by product ID
    const wishlistItems = $derived.by(() => {
        const map = new Map<string, WishlistItem>();

        // Add liked items
        for (const entry of lists.liked) {
            map.set(entry.product.id, {
                product: entry.product,
                liked: true,
                watch: null,
                addedAt: entry.addedAt,
            });
        }

        // Merge or add watched items
        for (const entry of lists.watch) {
            const existing = map.get(entry.product.id);
            if (existing) {
                existing.watch = entry;
                existing.addedAt = Math.min(existing.addedAt, entry.addedAt);
            } else {
                map.set(entry.product.id, {
                    product: entry.product,
                    liked: false,
                    watch: entry,
                    addedAt: entry.addedAt,
                });
            }
        }

        return Array.from(map.values()).sort((a, b) => b.addedAt - a.addedAt);
    });

    function toggleWatch(product: Product) {
        if (lists.isWatching(product.id)) {
            lists.removeFromWatch(product.id);
            toasts.success("Stopped tracking price alerts");
        } else {
            lists.addToWatch(product);
            toasts.success("Tracking price & stock alerts");
        }
    }

    function removeProduct(productId: string) {
        lists.unlike(productId);
        lists.removeFromWatch(productId);
        toasts.success("Item removed from wishlist");
    }

    function handleExport() {
        const json = lists.exportJSON();
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `djinn-wishlist-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function handleImport() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json";
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            if (file.size > 1024 * 1024) {
                toasts.error("File too large (max 1MB)");
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                const ok = lists.importJSON(reader.result as string);
                if (ok) toasts.success("Wishlist imported");
                else toasts.error("Invalid file format");
            };
            reader.onerror = () => toasts.error("Failed to read file");
            reader.readAsText(file);
        };
        input.click();
    }

    const reducedMotion = $derived(
        typeof window !== "undefined" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
</script>

<section class="flex h-full min-h-0 flex-col" aria-label="My Wishlist">
    <!-- Header -->
    <PanelHeader
        title="Wishlist"
        icon={Heart}
        count={wishlistItems.length}
    >
        {#snippet actions()}
            <PanelActionButton
                label="Import"
                icon={Upload}
                onclick={handleImport}
                type="button"
                title="Import wishlist"
                aria-label="Import wishlist"
            />
            <PanelActionButton
                label="Export"
                icon={Download}
                onclick={handleExport}
                type="button"
                title="Export wishlist"
                aria-label="Export wishlist"
            />
        {/snippet}
    </PanelHeader>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-3">
        {#if wishlistItems.length === 0}
            <div
                class="h-full"
                transition:fade={{ duration: 150 }}
            >
                <PanelEmptyState
                    icon={Heart}
                    title="Your wishlist is empty"
                    description="Like products or ask me to track prices to see them here."
                />
            </div>
        {:else}
            <div class="space-y-2.5">
                {#each wishlistItems as item (item.product.id)}
                    {@const isLiked = item.liked}
                    {@const isWatched = item.watch !== null}
                    <div
                        class="panel-card flex flex-col gap-2 shadow-sm hover:border-[var(--color-primary)]/30 transition-all duration-150"
                        transition:fade={{ duration: reducedMotion ? 0 : 150 }}
                    >
                        <!-- Product Essentials Info Row -->
                        <div class="flex gap-3">
                            <div
                                class="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--color-muted)] border border-[var(--color-border)]"
                            >
                                {#if item.product.imageUrl && !imgErrors.has(item.product.id)}
                                    <img
                                        src={proxiedSrc(item.product.imageUrl)}
                                        alt={item.product.name}
                                        class="h-full w-full object-cover"
                                        loading="lazy"
                                        onerror={() => {
                                            const s = new Set(imgErrors);
                                            s.add(item.product.id);
                                            imgErrors = s;
                                        }}
                                    />
                                {:else}
                                    <div
                                        class="flex h-full w-full items-center justify-center text-[var(--color-muted-foreground)]/40"
                                    >
                                        <Heart class="h-4 w-4" />
                                    </div>
                                {/if}
                            </div>
                            <div
                                class="min-w-0 flex-1 flex flex-col justify-center"
                            >
                                <button
                                    type="button"
                                    onclick={() =>
                                        ui.openProductDetail(item.product.id)}
                                    class="line-clamp-2 text-xs font-semibold text-[var(--color-foreground)] text-left hover:text-[var(--color-primary)] transition-colors cursor-pointer"
                                >
                                    {item.product.name}
                                </button>
                                <div class="mt-1 flex items-center gap-2">
                                    <span
                                        class="text-xs font-bold text-[var(--color-primary)]"
                                    >
                                        {formatMoney(
                                            item.product.price,
                                            item.product.currency,
                                        )}
                                    </span>
                                    {#if item.watch && item.product.price !== undefined && item.product.price < item.watch.priceWhenAdded}
                                        <span
                                            class="flex items-center gap-0.5 text-[9px] font-semibold text-[var(--color-success)] bg-[var(--color-success)]/10 px-1 py-0.25 rounded"
                                        >
                                            <TrendingDown class="h-2.5 w-2.5" />
                                            {Math.round(
                                                (1 -
                                                    item.product.price /
                                                        item.watch
                                                            .priceWhenAdded) *
                                                    100,
                                            )}% off
                                        </span>
                                    {/if}
                                    {#if item.product.inStock === false}
                                        <span
                                            class="rounded bg-[var(--color-destructive)]/10 px-1 py-0.25 text-[8px] font-bold text-[var(--color-destructive)] uppercase"
                                            >Out of stock</span
                                        >
                                    {/if}
                                </div>
                            </div>
                        </div>

                        <!-- Price History Sparkline Graph -->
                        {#if item.watch}
                            {@const prices = [
                                item.watch.priceWhenAdded,
                                ...item.watch.previousPrices.map(
                                    (p) => p.price,
                                ),
                                item.product.price,
                            ].filter((p) => p !== undefined) as number[]}
                            {#if prices.length >= 2}
                                {@const min = Math.min(...prices)}
                                {@const max = Math.max(...prices)}
                                {@const delta = max - min || 1}
                                {@const width = 280}
                                {@const height = 24}
                                {@const points = prices
                                    .map(
                                        (p, i) =>
                                            `${(i / (prices.length - 1)) * width},${height - ((p - min) / delta) * height}`,
                                    )
                                    .join(" ")}
                                {@const lastX = width}
                                {@const lastY =
                                    height -
                                    ((prices[prices.length - 1] - min) /
                                        delta) *
                                        height}

                                <div
                                    class="mt-1.5 pt-1.5 border-t border-[var(--color-border)]/50 flex flex-col gap-1"
                                >
                                    <div
                                        class="flex items-center justify-between text-[8px] text-[var(--color-muted-foreground)] uppercase tracking-wider font-semibold"
                                    >
                                        <span>Price history</span>
                                        {#if item.watch.targetPrice}
                                            <span
                                                class="text-[var(--color-primary)]"
                                                >Target: {formatMoney(
                                                    item.watch.targetPrice,
                                                    item.product.currency,
                                                )}</span
                                            >
                                        {/if}
                                    </div>
                                    <div
                                        class="w-full flex justify-center py-1"
                                    >
                                        <svg
                                            width="100%"
                                            {height}
                                            viewBox="0 0 {width} {height}"
                                            class="overflow-visible"
                                        >
                                            <!-- Reference target price line -->
                                            {#if item.watch.targetPrice}
                                                {@const targetY =
                                                    height -
                                                    ((item.watch.targetPrice -
                                                        min) /
                                                        delta) *
                                                        height}
                                                {#if targetY >= 0 && targetY <= height}
                                                    <line
                                                        x1="0"
                                                        y1={targetY}
                                                        x2={width}
                                                        y2={targetY}
                                                        stroke="var(--color-border)"
                                                        stroke-dasharray="2 2"
                                                        stroke-width="1"
                                                    />
                                                {/if}
                                            {/if}
                                            <!-- Sparkline path -->
                                            <polyline
                                                fill="none"
                                                stroke="var(--color-primary)"
                                                stroke-width="1.5"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                {points}
                                            />
                                            <!-- Glow dot at current price point -->
                                            <circle
                                                cx={lastX}
                                                cy={lastY}
                                                r="2"
                                                fill="var(--color-primary)"
                                            />
                                            <circle
                                                cx={lastX}
                                                cy={lastY}
                                                r="4"
                                                fill="var(--color-primary)"
                                                opacity="0.4"
                                                class="animate-pulse"
                                            />
                                        </svg>
                                    </div>
                                </div>
                            {/if}
                        {/if}

                        <!-- Bottom Symmetrical Action Toolbar -->
                        <div
                            class="mt-1 pt-1.5 border-t border-[var(--color-border)]/50 flex items-center justify-between"
                        >
                            <div class="flex items-center gap-2">
                                <!-- Heart Liked Toggle -->
                                <Button
                                    onclick={() =>
                                        lists.toggleLike(item.product)}
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    class={isLiked
                                        ? "bg-[var(--color-primary)]/8 border border-[var(--color-primary)]"
                                        : ""}
                                    title={isLiked
                                        ? "Unlike product"
                                        : "Like product"}
                                    aria-label="Toggle Like"
                                >
                                    <Heart
                                        class="h-3.5 w-3.5 {isLiked
                                            ? 'fill-destructive text-destructive'
                                            : ''}"
                                    />
                                </Button>

                                <!-- Eye Watch Toggle -->
                                <Button
                                    onclick={() => toggleWatch(item.product)}
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    class={isWatched
                                        ? "bg-[var(--color-primary)]/8 border border-[var(--color-primary)]"
                                        : ""}
                                    title={isWatched
                                        ? "Stop tracking price/stock alerts"
                                        : "Track price/stock alerts"}
                                    aria-label="Toggle Watch"
                                >
                                    <Eye
                                        class="h-3.5 w-3.5 {isWatched
                                            ? 'text-[var(--color-primary)]'
                                            : ''}"
                                    />
                                </Button>
                            </div>

                            <!-- Delete completely button -->
                            <Button
                                onclick={() => removeProduct(item.product.id)}
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                class="hover:text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/8"
                                title="Remove from wishlist completely"
                                aria-label="Delete"
                            >
                                <Trash2 class="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </div>
</section>
