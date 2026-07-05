<script lang="ts">
  import { Copy, ExternalLink, ReceiptText } from "@lucide/svelte";
  import { formatMoney } from "$lib/money";
  import type { CreatedOrder } from "$lib/order/create-order-client";
  import { toasts } from "$lib/ui/toast";

  let { order, compact = false }: { order: CreatedOrder; compact?: boolean } = $props();

  const reference = $derived(order.orderRef ?? order.orderNumber);
  const summary = $derived(order.summary);

  function expiryLabel(value?: string) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  async function copyPaymentLink() {
    const value = order.paymentUrl ?? reference;
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toasts.success(order.paymentUrl ? "Payment link copied" : "Reference copied");
  }
</script>

<div class:compact class="order-card">
  <div class="order-card-header">
    <div class="order-card-icon">
      <ReceiptText class="h-4 w-4" />
    </div>
    <div class="order-card-title">
      <span>Order created</span>
      {#if reference}<small>Reference {reference}</small>{/if}
    </div>
  </div>

  {#if summary && !compact}
    <div class="order-card-totals">
      {#if summary.itemsTotal != null}
        <div><span>Items</span><strong>{formatMoney(summary.itemsTotal, summary.currency ?? "LKR")}</strong></div>
      {/if}
      {#if summary.deliveryFee != null}
        <div><span>Delivery</span><strong>{formatMoney(summary.deliveryFee, summary.currency ?? "LKR")}</strong></div>
      {/if}
      {#if summary.addonsTotal != null && summary.addonsTotal > 0}
        <div><span>Add-ons</span><strong>{formatMoney(summary.addonsTotal, summary.currency ?? "LKR")}</strong></div>
      {/if}
      {#if summary.grandTotal != null}
        <div class="total"><span>Total</span><strong>{formatMoney(summary.grandTotal, summary.currency ?? "LKR")}</strong></div>
      {/if}
    </div>
  {/if}

  {#if order.expiresAt}
    <p class="order-card-expiry">Payment link expires {expiryLabel(order.expiresAt)}</p>
  {/if}

  <div class="order-card-actions">
    {#if order.paymentUrl}
      <a href={order.paymentUrl} target="_blank" rel="noreferrer" class="order-card-pay">
        Pay now <ExternalLink class="h-3.5 w-3.5" />
      </a>
    {/if}
    <button type="button" class="order-card-copy" onclick={copyPaymentLink} aria-label="Copy payment link or reference">
      <Copy class="h-3.5 w-3.5" />
    </button>
  </div>
</div>

<style>
  .order-card {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    width: 100%;
    margin: 0.375rem 0;
    padding: 0.75rem;
    border: 1px solid color-mix(in srgb, var(--color-primary) 32%, var(--color-border));
    border-radius: var(--radius-lg);
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 10%, transparent), transparent 62%),
      color-mix(in srgb, var(--color-surface) 88%, transparent);
    box-shadow: var(--shadow-card);
  }
  .order-card.compact {
    gap: 0.5rem;
    padding: 0.625rem;
  }
  .order-card-header {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    min-width: 0;
  }
  .order-card-icon {
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--radius-full);
    color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 14%, transparent);
    flex: 0 0 auto;
  }
  .order-card-title {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }
  .order-card-title span {
    font-size: var(--fs-sm);
    font-weight: 800;
    color: var(--color-foreground);
  }
  .order-card-title small {
    font-family: var(--font-mono);
    font-size: 0.625rem;
    color: var(--color-muted-foreground);
    overflow-wrap: anywhere;
  }
  .order-card-totals {
    display: grid;
    gap: 0.25rem;
    font-size: var(--fs-xs);
    color: var(--color-muted-foreground);
  }
  .order-card-totals div {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .order-card-totals strong {
    color: var(--color-foreground);
  }
  .order-card-totals .total {
    margin-top: 0.25rem;
    padding-top: 0.375rem;
    border-top: 1px solid var(--color-border-subtle);
    font-size: var(--fs-sm);
  }
  .order-card-expiry {
    margin: 0;
    font-size: 0.6875rem;
    color: var(--color-muted-foreground);
  }
  .order-card-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .order-card-pay,
  .order-card-copy {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2rem;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-subtle);
    font-size: var(--fs-xs);
    font-weight: 800;
    transition: transform 0.12s ease, border-color 0.12s ease, background-color 0.12s ease;
  }
  .order-card-pay {
    gap: 0.375rem;
    padding: 0 0.75rem;
    color: var(--color-primary-foreground);
    background: var(--color-primary);
    text-decoration: none;
  }
  .order-card-copy {
    width: 2rem;
    color: var(--color-foreground);
    background: color-mix(in srgb, var(--color-surface) 82%, transparent);
    cursor: pointer;
  }
  .order-card-pay:hover,
  .order-card-copy:hover {
    transform: translateY(-1px);
  }
  .order-card-pay:active,
  .order-card-copy:active {
    transform: scale(0.97);
  }
</style>
