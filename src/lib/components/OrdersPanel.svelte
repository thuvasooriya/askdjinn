<script lang="ts">
    import {
        Package,
        Truck,
        ArrowLeft,
        RefreshCw,
        ExternalLink,
        AlertCircle,
        CheckCircle2,
        Circle,
    } from "@lucide/svelte";
    import BrailleSpinner from "$lib/ui/BrailleSpinner.svelte";
    import { useSession } from "$lib/stores/session.svelte";
    import { formatMoney } from "$lib/money";
    import { toasts } from "$lib/ui/toast";
    import PanelHeader from "$lib/ui/PanelHeader.svelte";
    import Button, { buttonVariants } from "$lib/ui/Button.svelte";

    type ViewState = { type: "list" } | { type: "detail"; orderNumber: string };

    const ORDER_STATUS_TTL_MS = 5 * 60 * 1000;

    let view = $state<ViewState>({ type: "list" });
    let refreshingIds = $state<Set<string>>(new Set());
    let autoRefreshAttempted = $state<Set<string>>(new Set());
    let refreshErrors = $state<Record<string, string>>({});

    const session = useSession();
    const orders = $derived(session.orderRecords);

    const detailOrderNumber = $derived(
        view.type === "detail" ? view.orderNumber : null,
    );
    const selectedOrder = $derived(
        detailOrderNumber
            ? (orders.find((o) => o.orderNumber === detailOrderNumber) ?? null)
            : null,
    );

    function selectOrder(orderNumber: string) {
        view = { type: "detail", orderNumber };
    }

    function backToList() {
        view = { type: "list" };
    }

    function isTerminalStatus(status: string | undefined): boolean {
        return ["delivered", "completed", "cancelled", "canceled", "expired", "failed"].includes(
            status?.toLowerCase() ?? "",
        );
    }

    function hasTrackingCache(order: (typeof orders)[number]): boolean {
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

    function isRefreshing(orderNumber: string): boolean {
        return refreshingIds.has(orderNumber);
    }

    function refreshError(orderNumber: string): string | undefined {
        return refreshErrors[orderNumber];
    }

    function shouldAutoRefresh(order: (typeof orders)[number]): boolean {
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
        order: (typeof orders)[number],
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
                if (opts.toast) {
                    toasts.error(message);
                }
                return;
            }
            session.upsertOrderRecord({
                orderNumber: data.orderNumber ?? order.orderNumber,
                paymentUrl: order.paymentUrl,
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
        } catch (err) {
            setRefreshError(order.orderNumber, "Network error refreshing order");
            if (opts.toast) toasts.error("Network error refreshing order");
        } finally {
            setRefreshing(order.orderNumber, false);
        }
    }

    async function refreshStaleOrders() {
        const staleOrders = orders.filter(shouldAutoRefresh);
        await Promise.all(
            staleOrders.map((order) =>
                refreshOrder(order, { automatic: true }),
            ),
        );
    }

    async function handleRefresh() {
        if (!selectedOrder) return;
        await refreshOrder(selectedOrder, { force: true, toast: true });
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
            case "expired":
            case "cancelled":
            case "failed":
                return "bg-[var(--color-muted)] text-[var(--color-muted-foreground)] border border-[var(--color-border)]";
            default:
                return "bg-[var(--color-muted)] text-[var(--color-muted-foreground)] border border-[var(--color-border)]";
        }
    }

    function statusLabel(
        status: string | undefined,
        statusDisplay: string | undefined,
    ): string {
        return statusDisplay ?? status ?? "Unknown";
    }

    function listStatusLabel(order: (typeof orders)[number]): string {
        if (hasTrackingCache(order)) {
            return statusLabel(order.status, order.statusDisplay);
        }
        if (isRefreshing(order.orderNumber)) return "Fetching";
        if (refreshError(order.orderNumber)) return "Needs refresh";
        return "Queued";
    }

    function trackingSteps(order: (typeof orders)[number]) {
        return [...(order.tracking ?? [])].reverse();
    }

    function formatTimestamp(ts: string | undefined): string {
        if (!ts) return "";
        // If already a readable date/time, return as-is
        if (/[A-Za-z]{3}/.test(ts)) return ts;
        // Try to parse as ISO
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
    {#if view.type === "list"}
        <!-- List View -->
        <PanelHeader title="Orders" />

        {#if orders.length === 0}
            <div
                class="flex h-full flex-col items-center justify-center px-4 py-12 text-center"
            >
                <Package
                    class="mb-3 h-10 w-10 text-[var(--color-muted-foreground)]/30"
                />
                <p
                    class="text-sm font-medium text-[var(--color-muted-foreground)]"
                >
                    No orders yet
                </p>
                <p class="mt-1 text-xs text-[var(--color-muted-foreground)]/70">
                    Your orders will appear here after checkout.
                </p>
            </div>
        {:else}
            <div class="flex-1 overflow-y-auto p-3">
                <div class="space-y-2">
                    {#each orders as order (order.orderNumber)}
                        <div
                            class="panel-card transition hover:border-[var(--color-border)]/60"
                        >
                            <div class="flex items-start justify-between gap-2">
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-2">
                                        <span
                                            class="text-sm font-semibold text-[var(--color-foreground)]"
                                            >{order.orderNumber}</span
                                        >
                                        <span
                                            class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none {statusBadgeClass(
                                                order.status,
                                            )}"
                                        >
                                            {#if isRefreshing(order.orderNumber)}
                                                <BrailleSpinner size="sm" />
                                            {:else}
                                                {listStatusLabel(order)}
                                            {/if}
                                        </span>
                                    </div>
                                    {#if !hasTrackingCache(order)}
                                        <p
                                            class="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--color-muted-foreground)]"
                                        >
                                            {#if refreshError(order.orderNumber)}
                                                <AlertCircle
                                                    class="h-3 w-3 text-[var(--color-destructive)]"
                                                />
                                                {refreshError(order.orderNumber)}
                                            {:else if isRefreshing(order.orderNumber)}
                                                Fetching the latest tracking details...
                                            {:else}
                                                Tracking details are not cached yet.
                                            {/if}
                                        </p>
                                    {/if}
                                    {#if hasTrackingCache(order) && order.amount}
                                        <p
                                            class="mt-1 text-xs font-bold text-[var(--color-primary)]"
                                        >
                                            {formatMoney(
                                                order.amount.value,
                                                order.amount.currency,
                                            )}
                                        </p>
                                    {/if}
                                    {#if hasTrackingCache(order) && order.deliveryDate}
                                        <p
                                            class="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]"
                                        >
                                            Delivery: {formatDate(
                                                order.deliveryDate,
                                            )}
                                        </p>
                                    {/if}
                                    {#if hasTrackingCache(order) && (order.recipient?.name || order.recipient?.city)}
                                        <p
                                            class="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]"
                                        >
                                            {order.recipient
                                                ?.name}{#if order.recipient?.name && order.recipient?.city}
                                                &middot;
                                            {/if}{order.recipient?.city}
                                        </p>
                                    {/if}
                                </div>
                                <div class="flex shrink-0 flex-col gap-1.5">
                                    <Button
                                        type="button"
                                        onclick={() =>
                                            selectOrder(order.orderNumber)}
                                        variant="outline"
                                        size="sm"
                                        class="h-auto gap-1 px-2.5 py-1 text-[10px]"
                                    >
                                        {#if isRefreshing(order.orderNumber)}
                                            <BrailleSpinner size="sm" />
                                            Loading
                                        {:else}
                                            <Truck class="h-3 w-3" />
                                            Track
                                        {/if}
                                    </Button>
                                    {#if order.paymentUrl && order.status && !["delivered", "completed"].includes(order.status.toLowerCase())}
                                        <a
                                            href={order.paymentUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            class={buttonVariants({
                                                variant: "outline",
                                                size: "sm",
                                            }) +
                                                " h-auto gap-1 px-2.5 py-1 text-[10px] border-[var(--color-primary)]/30 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"}
                                        >
                                            <ExternalLink class="h-3 w-3" />
                                            Pay
                                        </a>
                                    {/if}
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    {:else}
        <!-- Detail View -->
        {#if selectedOrder}
            <div
                class="flex h-[var(--panel-header-h)] shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4 py-0"
            >
                <Button
                    type="button"
                    onclick={backToList}
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Back to orders"
                >
                    <ArrowLeft class="h-4 w-4" />
                </Button>
                <h3
                    class="font-display flex-1 truncate text-base font-bold leading-none text-[var(--color-foreground)]"
                >
                    {selectedOrder.orderNumber}
                </h3>
                <Button
                    type="button"
                    onclick={handleRefresh}
                    disabled={selectedOrder
                        ? refreshingIds.has(selectedOrder.orderNumber)
                        : false}
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Refresh order"
                >
                    {#if selectedOrder && refreshingIds.has(selectedOrder.orderNumber)}
                        <BrailleSpinner size="sm" />
                    {:else}
                        <RefreshCw class="h-4 w-4" />
                    {/if}
                </Button>
            </div>

            <div class="flex-1 overflow-y-auto p-3">
                <div class="space-y-3">
                    {#if !hasTrackingCache(selectedOrder)}
                        <div
                            class="panel-card flex items-start gap-3 border-[var(--color-primary)]/25 bg-[var(--color-primary)]/5"
                        >
                            {#if isRefreshing(selectedOrder.orderNumber)}
                                <BrailleSpinner size="sm" />
                            {:else}
                                <AlertCircle
                                    class="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]"
                                />
                            {/if}
                            <div class="min-w-0">
                                <p
                                    class="text-xs font-semibold text-[var(--color-foreground)]"
                                >
                                    {#if isRefreshing(selectedOrder.orderNumber)}
                                        Fetching latest order details
                                    {:else if refreshError(selectedOrder.orderNumber)}
                                        Tracking details unavailable
                                    {:else}
                                        Tracking details not cached yet
                                    {/if}
                                </p>
                                <p
                                    class="mt-1 text-[10px] leading-relaxed text-[var(--color-muted-foreground)]"
                                >
                                    {refreshError(selectedOrder.orderNumber) ??
                                        "This order will refresh automatically when possible. You can also use the refresh button above."}
                                </p>
                            </div>
                        </div>
                    {/if}

                    <!-- Status Badge -->
                    {#if hasTrackingCache(selectedOrder)}
                        <div class="flex items-center gap-2">
                            <span
                                class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold {statusBadgeClass(
                                    selectedOrder.status,
                                )}"
                            >
                                {statusLabel(
                                    selectedOrder.status,
                                    selectedOrder.statusDisplay,
                                )}
                            </span>
                        </div>
                    {/if}

                    <!-- Amount -->
                    {#if selectedOrder.amount || selectedOrder.paymentMethod}
                        <div class="panel-card">
                            {#if selectedOrder.amount}
                                <p
                                    class="text-base font-bold text-[var(--color-foreground)]"
                                >
                                    {formatMoney(
                                        selectedOrder.amount.value,
                                        selectedOrder.amount.currency,
                                    )}
                                </p>
                            {/if}
                            {#if selectedOrder.paymentMethod}
                                <p
                                    class="mt-0.5 text-xs text-[var(--color-muted-foreground)]"
                                >
                                    Payment: {selectedOrder.paymentMethod}
                                </p>
                            {/if}
                        </div>
                    {/if}

                    <!-- Recipient Card -->
                    {#if selectedOrder.recipient?.name || selectedOrder.recipient?.phone || selectedOrder.recipient?.address || selectedOrder.recipient?.city}
                        <div class="panel-card">
                            <h4
                                class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]"
                            >
                                Recipient
                            </h4>
                            {#if selectedOrder.recipient?.name}
                                <p
                                    class="text-xs font-medium text-[var(--color-foreground)]"
                                >
                                    {selectedOrder.recipient.name}
                                </p>
                            {/if}
                            {#if selectedOrder.recipient?.phone}
                                <p
                                    class="mt-0.5 text-xs text-[var(--color-muted-foreground)]"
                                >
                                    {selectedOrder.recipient.phone}
                                </p>
                            {/if}
                            {#if selectedOrder.recipient?.address}
                                <p
                                    class="mt-0.5 text-xs text-[var(--color-muted-foreground)]"
                                >
                                    {selectedOrder.recipient.address}
                                </p>
                            {/if}
                            {#if selectedOrder.recipient?.city}
                                <p
                                    class="text-xs text-[var(--color-muted-foreground)]"
                                >
                                    {selectedOrder.recipient.city}
                                </p>
                            {/if}
                        </div>
                    {/if}

                    <!-- Gift Message -->
                    {#if selectedOrder.giftMessage}
                        <div class="panel-card">
                            <h4
                                class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]"
                            >
                                Gift Message
                            </h4>
                            <p
                                class="text-xs italic text-[var(--color-foreground)]"
                            >
                                &ldquo;{selectedOrder.giftMessage}&rdquo;
                            </p>
                        </div>
                    {/if}

                    <!-- Delivery Comments -->
                    {#if selectedOrder.comments}
                        <div class="panel-card">
                            <h4
                                class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]"
                            >
                                Delivery Comments
                            </h4>
                            <p class="text-xs text-[var(--color-foreground)]">
                                {selectedOrder.comments}
                            </p>
                        </div>
                    {/if}

                    <!-- Timeline -->
                    {#if selectedOrder.tracking && selectedOrder.tracking.length > 0}
                        <div class="panel-card">
                            <h4
                                class="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]"
                            >
                                Tracking Timeline
                            </h4>
                            <div class="relative">
                                {#each trackingSteps(selectedOrder) as step, i}
                                    <div
                                        class="flex gap-3 {i <
                                        selectedOrder.tracking.length - 1
                                            ? 'pb-4'
                                            : ''}"
                                    >
                                        <div class="flex flex-col items-center">
                                            {#if i === 0}
                                                <CheckCircle2
                                                    class="h-4 w-4 animate-pulse text-[var(--color-primary)]"
                                                />
                                            {:else if step.timestamp}
                                                <CheckCircle2
                                                    class="h-4 w-4 text-[var(--color-success)]"
                                                />
                                            {:else}
                                                <Circle
                                                    class="h-4 w-4 text-[var(--color-border)]"
                                                />
                                            {/if}
                                            {#if i < selectedOrder.tracking.length - 1}
                                                <div
                                                    class="mt-0.5 w-px flex-1 bg-[var(--color-border)]"
                                                ></div>
                                            {/if}
                                        </div>
                                        <div class="min-w-0 flex-1 pt-px">
                                            <p
                                                class="text-xs font-medium text-[var(--color-foreground)]"
                                            >
                                                {step.step}
                                            </p>
                                            {#if step.timestamp}
                                                <p
                                                    class="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]"
                                                >
                                                    {formatTimestamp(
                                                        step.timestamp,
                                                    )}
                                                </p>
                                            {/if}
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}

                    <!-- Order Dates -->
                    {#if hasTrackingCache(selectedOrder)}
                    <div class="panel-card">
                        <h4
                            class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]"
                        >
                            Dates
                        </h4>
                        {#if selectedOrder.orderDate}
                            <div class="flex items-center justify-between py-1">
                                <span
                                    class="text-xs text-[var(--color-muted-foreground)]"
                                    >Ordered</span
                                >
                                <span
                                    class="text-xs font-medium text-[var(--color-foreground)]"
                                    >{formatDate(selectedOrder.orderDate)}</span
                                >
                            </div>
                        {/if}
                        {#if selectedOrder.shippedDate}
                            <div
                                class="flex items-center justify-between border-t border-[var(--color-border)] py-1"
                            >
                                <span
                                    class="text-xs text-[var(--color-muted-foreground)]"
                                    >Shipped</span
                                >
                                <span
                                    class="text-xs font-medium text-[var(--color-foreground)]"
                                    >{formatDate(
                                        selectedOrder.shippedDate,
                                    )}</span
                                >
                            </div>
                        {/if}
                    </div>
                    {/if}
                </div>
            </div>
        {/if}
    {/if}
</div>
