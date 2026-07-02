<script lang="ts">
  import { Package, Truck, ArrowLeft, RefreshCw, ExternalLink } from "@lucide/svelte";
  import BrailleSpinner from "$lib/ui/BrailleSpinner.svelte";
  import { useSession } from "$lib/stores/session.svelte";
  import { formatMoney } from "$lib/money";
  import { toasts } from "$lib/ui/toast";

  type ViewState = { type: "list" } | { type: "detail"; orderNumber: string };

  let view = $state<ViewState>({ type: "list" });
  let refreshing = $state(false);

  const session = useSession();
  const orders = $derived(session.orderRecords);

  const detailOrderNumber = $derived(view.type === "detail" ? view.orderNumber : null);
  const selectedOrder = $derived(
    detailOrderNumber ? orders.find((o) => o.orderNumber === detailOrderNumber) ?? null : null
  );

  function selectOrder(orderNumber: string) {
    view = { type: "detail", orderNumber };
  }

  function backToList() {
    view = { type: "list" };
  }

  async function handleRefresh() {
    if (!selectedOrder || refreshing) return;
    refreshing = true;
    try {
      const res = await fetch("/api/track-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_number: selectedOrder.orderNumber }),
      });
      const data = await res.json();
      if (!res.ok) {
        toasts.error(data.error ?? "Failed to refresh order");
        return;
      }
      session.upsertOrderRecord({
        orderNumber: data.orderNumber ?? selectedOrder.orderNumber,
        createdAt: selectedOrder.createdAt,
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
        lastCheckedAt: 0,
      });
      toasts.success("Order refreshed");
    } catch (err) {
      toasts.error("Network error refreshing order");
    } finally {
      refreshing = false;
    }
  }

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

  function statusLabel(status: string | undefined, statusDisplay: string | undefined): string {
    return statusDisplay ?? status ?? "Unknown";
  }

  function formatTimestamp(ts: string | undefined): string {
    if (!ts) return "";
    // If already a readable date/time, return as-is
    if (/[A-Za-z]{3}/.test(ts)) return ts;
    // Try to parse as ISO
    try {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
          " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      }
    } catch { /* ignore */ }
    return ts;
  }

  function formatDate(dateStr: string | undefined): string {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      }
    } catch { /* ignore */ }
    return dateStr;
  }
</script>

<div class="flex h-full min-h-0 flex-col">
  {#if view.type === "list"}
    <!-- List View -->
    <div class="border-b border-[var(--color-border)] px-4 py-4">
      <h3 class="text-sm font-bold text-[var(--color-foreground)]">Orders</h3>
    </div>

    {#if orders.length === 0}
      <div class="flex h-full flex-col items-center justify-center px-4 py-12 text-center">
        <Package class="mb-3 h-10 w-10 text-[var(--color-muted-foreground)]/30" />
        <p class="text-sm font-medium text-[var(--color-muted-foreground)]">No orders yet</p>
        <p class="mt-1 text-xs text-[var(--color-muted-foreground)]/70">Your orders will appear here after checkout.</p>
      </div>
    {:else}
      <div class="flex-1 overflow-y-auto p-3">
        <div class="space-y-2">
          {#each orders as order (order.orderNumber)}
            <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition hover:border-[var(--color-border)]/60">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-semibold text-[var(--color-foreground)]">{order.orderNumber}</span>
                    <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none {statusBadgeClass(order.status)}">
                      {statusLabel(order.status, order.statusDisplay)}
                    </span>
                  </div>
                  {#if order.amount}
                    <p class="mt-1 text-xs font-bold text-[var(--color-primary)]">{formatMoney(order.amount.value, order.amount.currency)}</p>
                  {/if}
                  {#if order.deliveryDate}
                    <p class="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]">Delivery: {formatDate(order.deliveryDate)}</p>
                  {/if}
                  {#if order.recipient?.name || order.recipient?.city}
                    <p class="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                      {order.recipient?.name}{#if order.recipient?.name && order.recipient?.city} &middot; {/if}{order.recipient?.city}
                    </p>
                  {/if}
                </div>
                <div class="flex shrink-0 flex-col gap-1.5">
                  <button
                    type="button"
                    onclick={() => selectOrder(order.orderNumber)}
                    class="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-foreground)] transition hover:bg-[var(--color-muted)]"
                  >
                    <Truck class="h-3 w-3" />
                    Track
                  </button>
                  {#if order.paymentUrl && order.status && !["delivered", "completed"].includes(order.status.toLowerCase())}
                    <a
                      href={order.paymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="flex items-center gap-1 rounded-lg border border-[var(--color-primary)]/30 px-2.5 py-1 text-[10px] font-medium text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/10"
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
      <div class="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
        <button
          type="button"
          onclick={backToList}
          class="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
          aria-label="Back to orders"
        >
          <ArrowLeft class="h-4 w-4" />
        </button>
        <h3 class="flex-1 truncate text-sm font-bold text-[var(--color-foreground)]">{selectedOrder.orderNumber}</h3>
        <button
          type="button"
          onclick={handleRefresh}
          disabled={refreshing}
          class="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-50"
          aria-label="Refresh order"
        >
          {#if refreshing}
            <BrailleSpinner size="sm" />
          {:else}
            <RefreshCw class="h-4 w-4" />
          {/if}
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-3">
        <div class="space-y-3">
          <!-- Status Badge -->
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold {statusBadgeClass(selectedOrder.status)}">
              {statusLabel(selectedOrder.status, selectedOrder.statusDisplay)}
            </span>
          </div>

          <!-- Amount -->
          {#if selectedOrder.amount || selectedOrder.paymentMethod}
            <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              {#if selectedOrder.amount}
                <p class="text-base font-bold text-[var(--color-foreground)]">
                  {formatMoney(selectedOrder.amount.value, selectedOrder.amount.currency)}
                </p>
              {/if}
              {#if selectedOrder.paymentMethod}
                <p class="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                  Payment: {selectedOrder.paymentMethod}
                </p>
              {/if}
            </div>
          {/if}

          <!-- Recipient Card -->
          {#if selectedOrder.recipient?.name || selectedOrder.recipient?.phone || selectedOrder.recipient?.address || selectedOrder.recipient?.city}
            <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <h4 class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Recipient</h4>
              {#if selectedOrder.recipient?.name}
                <p class="text-xs font-medium text-[var(--color-foreground)]">{selectedOrder.recipient.name}</p>
              {/if}
              {#if selectedOrder.recipient?.phone}
                <p class="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{selectedOrder.recipient.phone}</p>
              {/if}
              {#if selectedOrder.recipient?.address}
                <p class="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{selectedOrder.recipient.address}</p>
              {/if}
              {#if selectedOrder.recipient?.city}
                <p class="text-xs text-[var(--color-muted-foreground)]">{selectedOrder.recipient.city}</p>
              {/if}
            </div>
          {/if}

          <!-- Gift Message -->
          {#if selectedOrder.giftMessage}
            <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <h4 class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Gift Message</h4>
              <p class="text-xs italic text-[var(--color-foreground)]">&ldquo;{selectedOrder.giftMessage}&rdquo;</p>
            </div>
          {/if}

          <!-- Delivery Comments -->
          {#if selectedOrder.comments}
            <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <h4 class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Delivery Comments</h4>
              <p class="text-xs text-[var(--color-foreground)]">{selectedOrder.comments}</p>
            </div>
          {/if}

          <!-- Timeline -->
          {#if selectedOrder.tracking && selectedOrder.tracking.length > 0}
            <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <h4 class="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Tracking Timeline</h4>
              <div class="relative">
                {#each selectedOrder.tracking as step, i}
                  <div class="flex gap-3 {i < selectedOrder.tracking.length - 1 ? 'pb-4' : ''}">
                    <div class="flex flex-col items-center">
                      <div class="h-2.5 w-2.5 rounded-full {i === 0 ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}"></div>
                      {#if i < selectedOrder.tracking.length - 1}
                        <div class="mt-0.5 w-px flex-1 bg-[var(--color-border)]"></div>
                      {/if}
                    </div>
                    <div class="min-w-0 flex-1 pt-px">
                      <p class="text-xs font-medium text-[var(--color-foreground)]">{step.step}</p>
                      {#if step.timestamp}
                        <p class="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]">{formatTimestamp(step.timestamp)}</p>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Order Dates -->
          <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <h4 class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Dates</h4>
            {#if selectedOrder.orderDate}
              <div class="flex items-center justify-between py-1">
                <span class="text-xs text-[var(--color-muted-foreground)]">Ordered</span>
                <span class="text-xs font-medium text-[var(--color-foreground)]">{formatDate(selectedOrder.orderDate)}</span>
              </div>
            {/if}
            {#if selectedOrder.shippedDate}
              <div class="flex items-center justify-between border-t border-[var(--color-border)] py-1">
                <span class="text-xs text-[var(--color-muted-foreground)]">Shipped</span>
                <span class="text-xs font-medium text-[var(--color-foreground)]">{formatDate(selectedOrder.shippedDate)}</span>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>
