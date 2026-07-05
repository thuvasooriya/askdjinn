<script lang="ts">
    import {
        Package,
        Truck,
        RefreshCw,
        ExternalLink,
        AlertCircle,
        CheckCircle2,
        Circle,
        Clock,
        CreditCard,
    } from "@lucide/svelte";
    import BrailleSpinner from "$lib/ui/BrailleSpinner.svelte";
    import { useSession, type CompletedOrderRecord, type CreatedOrderRecord } from "$lib/stores/session.svelte";
    import { useCart } from "$lib/stores/cart.svelte";
    import type { Product } from "$lib/shopping-engine";
    import { formatMoney } from "$lib/money";
    import { toasts } from "$lib/ui/toast";
    import PanelHeader from "$lib/ui/PanelHeader.svelte";
    import Button, { buttonVariants } from "$lib/ui/Button.svelte";
    import { useUI } from "$lib/stores/ui.svelte";
    import PanelEmptyState from "$lib/ui/PanelEmptyState.svelte";

    const ORDER_STATUS_TTL_MS = 5 * 60 * 1000;

    let refreshingIds = $state<Set<string>>(new Set());
    let autoRefreshAttempted = $state<Set<string>>(new Set());
    let refreshErrors = $state<Record<string, string>>({});

    const ui = useUI();
    const cart = useCart();
    const session = useSession();
    const orders = $derived(session.orderRecords);
    const createdOrders = $derived(session.createdOrders);
    const completedOrders = $derived(session.completedOrders);

    function isTerminalStatus(status: string | undefined): boolean {
        return ["delivered", "completed", "cancelled", "canceled", "failed"].includes(
            status?.toLowerCase() ?? "",
        );
    }

    function hasTrackingCache(order: CompletedOrderRecord): boolean {
        return Boolean(
            order.status ||
                order.statusDisplay ||
                order.tracking?.length ||
                order.amount ||
                order.recipient ||
                order.deliveryDate ||
                order.orderDate ||
                order.shippedDate ||
                order.comments,
        );
    }

    function isCreatedExpired(order: CreatedOrderRecord): boolean {
        if (order.status === "payment_expired") return true;
        if (!order.expiresAt) return false;
        const expiry = new Date(order.expiresAt).getTime();
        return Number.isFinite(expiry) && Date.now() > expiry;
    }


    function hasRetryData(order: CreatedOrderRecord): boolean {
        return Boolean(order.payload && order.cartSnapshot?.length);
    }

    function createRetryPanelData(order: CreatedOrderRecord): Record<string, unknown> | null {
        const payload = order.payload;
        if (!payload) return null;
        return {
            recipientName: payload.recipient.name,
            recipientPhone: payload.recipient.phone,
            streetAddress: payload.delivery.address,
            deliveryCity: payload.delivery.city,
            deliveryDate: payload.delivery.date,
            senderName: payload.sender.name,
            giftMessage: payload.gift_message ?? "",
            retryFromOrderRef: order.orderRef,
        };
    }

    function restoreCartSnapshot(order: CreatedOrderRecord): boolean {
        if (!order.cartSnapshot?.length) return false;
        cart.clear();
        for (const item of order.cartSnapshot) {
            const quantity = Number.isFinite(item.quantity) ? Math.max(1, Math.floor(item.quantity)) : 1;
            const product: Product = {
                id: item.productId,
                name: item.name,
                price: item.price,
                currency: item.currency ?? "LKR",
                imageUrl: item.imageUrl,
            };
            ui.registerProduct(product);
            cart.addItem(product, quantity);
        }
        return true;
    }

    function editAndRetryCreatedOrder(order: CreatedOrderRecord) {
        const data = createRetryPanelData(order);
        if (!data || !restoreCartSnapshot(order)) {
            toasts.error("Saved order details are unavailable for this order");
            return;
        }
        ui.open("create-order", { kind: "dynamic", title: `Retry ${order.orderRef}`, data });
        toasts.success("Order restored. Review details before creating a new payment link.");
    }

    function openPaymentLink(url?: string) {
        if (!url) return;
        window.open(url, "_blank", "noopener,noreferrer");
    }
    function isRefreshing(orderNumber: string): boolean {
        return refreshingIds.has(orderNumber);
    }

    function refreshError(orderNumber: string): string | undefined {
        return refreshErrors[orderNumber];
    }

    function shouldAutoRefresh(order: CompletedOrderRecord): boolean {
        if (!order.orderNumber || refreshingIds.has(order.orderNumber)) return false;
        if (autoRefreshAttempted.has(order.orderNumber)) return false;

        const missingCache = !hasTrackingCache(order);
        const stale =
            !order.lastCheckedAt ||
            Date.now() - order.lastCheckedAt >= ORDER_STATUS_TTL_MS;

        return missingCache || (!isTerminalStatus(order.status) && stale);
    }

    function setRefreshing(orderNumber: string, refreshing: boolean) {
        const next = new Set(refreshingIds);
        if (refreshing) next.add(orderNumber);
        else next.delete(orderNumber);
        refreshingIds = next;
    }

    function markAutoRefreshAttempted(orderNumber: string) {
        autoRefreshAttempted = new Set([...autoRefreshAttempted, orderNumber]);
    }

    function setRefreshError(orderNumber: string, error?: string) {
        const next = { ...refreshErrors };
        if (error) next[orderNumber] = error;
        else delete next[orderNumber];
        refreshErrors = next;
    }

    async function refreshOrder(
        order: CompletedOrderRecord,
        opts: { force?: boolean; toast?: boolean; automatic?: boolean } = {},
    ) {
        if (!order.orderNumber) return;
        if (refreshingIds.has(order.orderNumber) && !opts.force) return;

        if (opts.automatic) markAutoRefreshAttempted(order.orderNumber);
        setRefreshing(order.orderNumber, true);
        setRefreshError(order.orderNumber);
        try {
            const res = await fetch("/api/track-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    order_number: order.orderNumber,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                const message = data.error ?? "Failed to refresh order";
                setRefreshError(order.orderNumber, message);
                if (opts.toast) toasts.error(message);
                return;
            }
            const orderNumber = data.orderNumber ?? order.orderNumber;
            session.upsertOrderRecord({
                kind: "completed",
                id: orderNumber,
                orderNumber,
                createdAt: order.createdAt,
                status: data.status,
                statusDisplay: data.statusDisplay,
                tracking: data.progress,
                amount: data.amount,
                recipient: data.recipient,
                deliveryDate: data.deliveryDate,
                paymentMethod: data.paymentMethod,
                comments: data.comments,
                giftMessage: data.greetingMessage,
                orderDate: data.orderDate,
                shippedDate: data.shippedDate,
                lastCheckedAt: Date.now(),
            });
            if (opts.toast) toasts.success("Order refreshed");
        } catch {
            setRefreshError(order.orderNumber, "Network error refreshing order");
            if (opts.toast) toasts.error("Network error refreshing order");
        } finally {
            setRefreshing(order.orderNumber, false);
        }
    }

    async function refreshStaleOrders() {
        const staleOrders = completedOrders.filter(shouldAutoRefresh);
        await Promise.all(
            staleOrders.map((order) =>
                refreshOrder(order, { automatic: true }),
            ),
        );
    }

    $effect(() => {
        void refreshStaleOrders();
    });

    function statusBadgeClass(status: string | undefined): string {
        switch (status?.toLowerCase()) {
            case "delivered":
            case "completed":
                return "bg-[var(--color-success)]/15 text-[var(--color-success)] border border-[var(--color-success)]/25";
            case "pending":
            case "processing":
            case "shipped":
                return "bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/25";
            case "cancelled":
            case "failed":
                return "bg-[var(--color-muted)] text-[var(--color-muted-foreground)] border border-[var(--color-border)]";
            default:
                return "bg-[var(--color-muted)] text-[var(--color-muted-foreground)] border border-[var(--color-border)]";
        }
    }

    function createdBadgeClass(order: CreatedOrderRecord): string {
        return isCreatedExpired(order)
            ? "bg-[var(--color-muted)] text-[var(--color-muted-foreground)] border border-[var(--color-border)]"
            : "bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/25";
    }

    function statusLabel(status: string | undefined, statusDisplay: string | undefined): string {
        return statusDisplay ?? status ?? "Unknown";
    }

    function completedStatusLabel(order: CompletedOrderRecord): string {
        if (hasTrackingCache(order)) return statusLabel(order.status, order.statusDisplay);
        if (isRefreshing(order.orderNumber)) return "Fetching";
        if (refreshError(order.orderNumber)) return "Needs refresh";
        return "Not checked";
    }

    function createdStatusLabel(order: CreatedOrderRecord): string {
        return isCreatedExpired(order) ? "Payment expired" : order.statusDisplay;
    }

    function trackingSteps(order: CompletedOrderRecord) {
        return [...(order.tracking ?? [])].reverse();
    }

    function formatTimestamp(ts: string | undefined): string {
        if (!ts) return "";
        if (/[A-Za-z]{3}/.test(ts)) return ts;
        try {
            const d = new Date(ts);
            if (!isNaN(d.getTime())) {
                return (
                    d.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                    }) +
                    " " +
                    d.toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                    })
                );
            }
        } catch {
            /* ignore */
        }
        return ts;
    }

    function formatDate(dateStr: string | undefined): string {
        if (!dateStr) return "";
        try {
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) {
                return d.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                });
            }
        } catch {
            /* ignore */
        }
        return dateStr;
    }
</script>

<div class="flex h-full min-h-0 flex-col">
    <PanelHeader title="Orders" icon={Package} />

    {#if orders.length === 0}
        <PanelEmptyState icon={Package} title="No orders yet" description="Created orders and tracked orders will appear here." />
    {:else}
        <div class="flex-1 overflow-y-auto p-3">
            <div class="space-y-3">
                {#if createdOrders.length > 0}
                    <section class="space-y-2" aria-label="Created orders">
                        <p class="px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">Created orders</p>
                        {#each createdOrders as order (order.id)}
                            <div class="panel-card border-[var(--color-primary)]/20 transition hover:border-[var(--color-border)]/60">
                                <div class="flex items-start justify-between gap-2">
                                    <div class="min-w-0 flex-1">
                                        <div class="flex flex-wrap items-center gap-2">
                                            <CreditCard class="h-3.5 w-3.5 text-[var(--color-primary)]" />
                                            <span class="font-mono text-sm font-semibold text-[var(--color-foreground)]">{order.orderRef}</span>
                                            <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none {createdBadgeClass(order)}">
                                                {createdStatusLabel(order)}
                                            </span>
                                        </div>
                                        {#if order.summary?.grandTotal != null}
                                            <p class="mt-1 text-xs font-bold text-[var(--color-primary)]">
                                                {formatMoney(order.summary.grandTotal, order.summary.currency ?? "LKR")}
                                            </p>
                                        {/if}
                                        {#if order.expiresAt}
                                            <p class="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--color-muted-foreground)]">
                                                <Clock class="h-3 w-3" />
                                                {isCreatedExpired(order) ? "Expired" : "Payment expires"} {formatTimestamp(order.expiresAt)}
                                            </p>
                                        {/if}
                                        <p class="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
                                            This is a click-to-pay order. Tracking starts only after payment creates a completed order number.
                                        </p>
                                    </div>
                                    {#if (order.paymentUrl && !isCreatedExpired(order)) || hasRetryData(order)}
                                        <div class="flex shrink-0 flex-col items-end gap-1.5">
                                            {#if order.paymentUrl && !isCreatedExpired(order)}
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    class="h-auto gap-1 px-2.5 py-1 text-[10px] border-[var(--color-primary)]/30 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
                                                    onclick={() => openPaymentLink(order.paymentUrl)}
                                                >
                                                    <ExternalLink class="h-3 w-3" />
                                                    Pay
                                                </Button>
                                            {/if}
                                            {#if hasRetryData(order)}
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    class="h-auto gap-1 px-2.5 py-1 text-[10px]"
                                                    onclick={() => editAndRetryCreatedOrder(order)}
                                                >
                                                    <RefreshCw class="h-3 w-3" />
                                                    Edit & retry
                                                </Button>
                                            {/if}
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </section>
                {/if}

                {#if completedOrders.length > 0}
                    <section class="space-y-2" aria-label="Completed orders">
                        <p class="px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">Completed orders</p>
                        {#each completedOrders as order (order.id)}
                            <div class="panel-card transition hover:border-[var(--color-border)]/60">
                                <div class="flex items-start justify-between gap-2">
                                    <div class="min-w-0 flex-1">
                                        <div class="flex flex-wrap items-center gap-2">
                                            <span class="font-mono text-sm font-semibold text-[var(--color-foreground)]">{order.orderNumber}</span>
                                            <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none {statusBadgeClass(order.status)}">
                                                {#if isRefreshing(order.orderNumber)}
                                                    <BrailleSpinner size="sm" />
                                                {:else}
                                                    {completedStatusLabel(order)}
                                                {/if}
                                            </span>
                                        </div>
                                        {#if !hasTrackingCache(order)}
                                            <p class="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--color-muted-foreground)]">
                                                {#if refreshError(order.orderNumber)}
                                                    <AlertCircle class="h-3 w-3 text-[var(--color-destructive)]" />
                                                    {refreshError(order.orderNumber)}
                                                {:else if isRefreshing(order.orderNumber)}
                                                    Fetching the latest tracking details...
                                                {:else}
                                                    Tracking details have not been checked yet.
                                                {/if}
                                            </p>
                                        {/if}
                                        {#if order.amount}
                                            <p class="mt-1 text-xs font-bold text-[var(--color-primary)]">
                                                {formatMoney(order.amount.value, order.amount.currency)}
                                            </p>
                                        {/if}
                                        {#if order.deliveryDate}
                                            <p class="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                                                Delivery: {formatDate(order.deliveryDate)}
                                            </p>
                                        {/if}
                                        {#if order.recipient?.name || order.recipient?.city}
                                            <p class="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                                                {order.recipient?.name}{#if order.recipient?.name && order.recipient?.city} &middot; {/if}{order.recipient?.city}
                                            </p>
                                        {/if}
                                        {#if trackingSteps(order).length > 0}
                                            <div class="mt-2 space-y-1">
                                                {#each trackingSteps(order).slice(0, 1) as step, i (i)}
                                                    <div class="flex items-center gap-1.5 text-[10px] text-[var(--color-muted-foreground)]">
                                                        {#if i === 0}
                                                            <CheckCircle2 class="h-3 w-3 text-[var(--color-success)]" />
                                                        {:else}
                                                            <Circle class="h-3 w-3" />
                                                        {/if}
                                                        <span class="truncate">{step.step}</span>
                                                    </div>
                                                {/each}
                                            </div>
                                        {/if}
                                    </div>
                                    <div class="flex shrink-0 flex-col gap-1.5">
                                        <Button
                                            type="button"
                                            onclick={() => ui.open("order-tracking" as any, { kind: "dynamic", data: { ...order, progress: order.tracking } })}
                                            variant="outline"
                                            size="sm"
                                            class="h-auto gap-1 px-2.5 py-1 text-[10px]"
                                        >
                                            <Truck class="h-3 w-3" />
                                            View
                                        </Button>
                                        <Button
                                            type="button"
                                            onclick={() => refreshOrder(order, { force: true, toast: true })}
                                            variant="outline"
                                            size="sm"
                                            class="h-auto gap-1 px-2.5 py-1 text-[10px]"
                                            disabled={isRefreshing(order.orderNumber)}
                                        >
                                            {#if isRefreshing(order.orderNumber)}
                                                <BrailleSpinner size="sm" />
                                            {:else}
                                                <RefreshCw class="h-3 w-3" />
                                            {/if}
                                            Refresh
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </section>
                {/if}
            </div>
        </div>
    {/if}
</div>
