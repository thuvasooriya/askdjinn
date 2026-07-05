<script lang="ts">
  import { Copy, ExternalLink, ReceiptText, ChevronDown } from "@lucide/svelte";
  import { formatMoney } from "$lib/money";
  import type { CreatedOrder } from "$lib/order/create-order-client";
  import { toasts } from "$lib/ui/toast";

  let {
    order,
    compact = false,
  }: {
    order: CreatedOrder;
    compact?: boolean;
  } = $props();

  const reference = $derived(order.orderRef ?? order.orderNumber);
  const summary = $derived(order.summary);

  let showDetails = $state(true);
  $effect(() => { showDetails = !compact; });

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
      <ReceiptText class="card-icon" />
    </div>
    <div class="order-card-title">
      <span>Order created</span>
      {#if reference}
        <small>#{reference}</small>
      {/if}
    </div>
  </div>

  <!-- Primary action: pay now -->
  {#if order.paymentUrl}
    <a
      href={order.paymentUrl}
      target="_blank"
      rel="noreferrer"
      class="order-card-pay"
    >
      Pay now
      <ExternalLink class="btn-icon" />
    </a>
  {/if}

  <!-- Expiry info -->
  {#if order.expiresAt}
    <p class="order-card-expiry">Link expires {expiryLabel(order.expiresAt)}</p>
  {/if}

  <!-- Summary toggle (collapsible on compact) -->
  {#if summary}
    <div class="order-card-summary-wrap">
      {#if compact}
        <button
          type="button"
          class="order-card-toggle"
          onclick={() => showDetails = !showDetails}
        >
          {showDetails ? "Hide" : "Show"} details
          <ChevronDown class={showDetails ? "toggle-icon toggle-icon--open" : "toggle-icon"} />
        </button>
      {/if}
      {#if showDetails}
        <div class="order-card-totals">
          {#if summary.itemsTotal != null}
            <div>
              <span>Items</span>
              <strong>{formatMoney(summary.itemsTotal, summary.currency ?? "LKR")}</strong>
            </div>
          {/if}
          {#if summary.deliveryFee != null}
            <div>
              <span>Delivery</span>
              <strong>{formatMoney(summary.deliveryFee, summary.currency ?? "LKR")}</strong>
            </div>
          {/if}
          {#if summary.addonsTotal != null && summary.addonsTotal > 0}
            <div>
              <span>Add-ons</span>
              <strong>{formatMoney(summary.addonsTotal, summary.currency ?? "LKR")}</strong>
            </div>
          {/if}
          {#if summary.grandTotal != null}
            <div class="total">
              <span>Total</span>
              <strong>{formatMoney(summary.grandTotal, summary.currency ?? "LKR")}</strong>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Copy reference -->
  <div class="order-card-footer">
    <button type="button" class="order-card-copy" onclick={copyPaymentLink} aria-label="Copy payment link or reference">
      <Copy class="btn-icon-sm" />
      {reference}
    </button>
  </div>
</div>

<style>
  .order-card {
    display: inline-flex;
    flex-direction: column;
    gap: 0.5rem;
    width: fit-content;
    min-width: 12rem;
    max-width: 24rem;
    margin: 0.25rem 0;
    padding: 0.625rem 0.75rem;
    border: 1px solid color-mix(in srgb, var(--color-primary) 30%, var(--color-border));
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--color-primary) 6%, var(--color-surface));
    box-shadow: var(--shadow-card);
  }
  .order-card.compact {
    gap: 0.375rem;
    padding: 0.5rem 0.625rem;
    min-width: 10rem;
    max-width: 20rem;
  }

  .order-card-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .order-card-icon {
    display: grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: var(--radius-full);
    color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 14%, transparent);
    flex: 0 0 auto;
  }
  .order-card-icon :global(.card-icon) {
    width: 0.75rem;
    height: 0.75rem;
  }
  .order-card-title {
    display: flex;
    align-items: center;
    gap: 0.375rem;
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

  .order-card-pay {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    width: 100%;
    min-height: 2.25rem;
    border-radius: var(--radius-md);
    border: none;
    font-size: var(--fs-sm);
    font-weight: 800;
    color: var(--color-primary-foreground);
    background: var(--color-primary);
    text-decoration: none;
    transition: transform 0.12s ease, opacity 0.12s ease;
  }
  .order-card-pay:hover {
    transform: translateY(-1px);
    opacity: 0.92;
  }
  .order-card-pay:active {
    transform: scale(0.97);
  }
  .order-card-pay :global(.btn-icon) {
    width: 0.875rem;
    height: 0.875rem;
  }

  .order-card-expiry {
    margin: 0;
    font-size: 0.625rem;
    color: var(--color-muted-foreground);
  }

  .order-card-summary-wrap {
    display: contents;
  }
  .order-card-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.625rem;
    font-weight: 600;
    color: var(--color-muted-foreground);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: color 0.15s;
  }
  .order-card-toggle:hover {
    color: var(--color-foreground);
  }
  .order-card-toggle :global(.toggle-icon) {
    width: 0.625rem;
    height: 0.625rem;
    transition: transform 0.15s;
  }
  .order-card-toggle :global(.toggle-icon--open) {
    transform: rotate(180deg);
  }

  .order-card-totals {
    display: grid;
    gap: 0.125rem;
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
    margin-top: 0.125rem;
    padding-top: 0.25rem;
    border-top: 1px solid var(--color-border-subtle);
    font-size: var(--fs-sm);
  }

  .order-card-footer {
    display: flex;
    align-items: center;
  }
  .order-card-copy {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.625rem;
    font-weight: 600;
    color: var(--color-muted-foreground);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    font-family: var(--font-mono);
    transition: color 0.15s;
  }
  .order-card-copy:hover {
    color: var(--color-foreground);
  }
  .order-card-copy :global(.btn-icon-sm) {
    width: 0.625rem;
    height: 0.625rem;
  }
</style>
