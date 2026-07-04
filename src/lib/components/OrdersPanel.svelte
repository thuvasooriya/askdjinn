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
    import { useUI } from "$lib/stores/ui.svelte";

    const ORDER_STATUS_TTL_MS = 5 * 60 * 1000;

    let refreshingIds = $state<Set<string>>(new Set());
    let autoRefreshAttempted = $state<Set<string>>(new Set());
    let refreshErrors = $state<Record<string, string>>({});

    const ui = useUI();
    const session = useSession();
    const orders = $derived(session.orderRecords);


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
                                            ui.open("order-tracking" as any, { kind: "dynamic", data: { ...order, progress: order.tracking } })}
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
</div>
