<script lang="ts">
  // Unified parameterized panel. One component, many panel types.
  // Agent can write to panel.data -> form updates reactively.
  // User edits form -> panel.data updates -> agent reads reactively.
  // User submits -> resolve fires -> agent continues.

  import { Check, CheckCircle2, Circle, Plus, Copy, Trash2, MapPin, Heart, ShoppingBag, Truck, Edit3, ChevronRight, AlertCircle } from "@lucide/svelte";
  import type { DynamicPanel } from "$lib/stores/ui.svelte";
  import type { Address } from "$lib/stores/addresses.svelte";
  import { useAddresses } from "$lib/stores/addresses.svelte";
  import { useUI } from "$lib/stores/ui.svelte";
  import { useCart } from "$lib/stores/cart.svelte";
  import { formatMoney } from "$lib/money";
  import { getContract } from "$lib/panel-contracts";
  import { fly, fade } from "svelte/transition";
  import { useSession } from "$lib/stores/session.svelte";
  import { toasts } from "$lib/ui/toast";
  import BrailleSpinner from "$lib/ui/BrailleSpinner.svelte";
  import { createOrder, createOrderRecord } from "$lib/order/create-order-client";
  import PanelHeader from "$lib/ui/PanelHeader.svelte";
import PanelActionButton from "$lib/ui/PanelActionButton.svelte";
import { Package } from "@lucide/svelte";

  const addresses = useAddresses();
  const ui = useUI();
  const cart = useCart();
  const session = useSession();
  let { panel }: { panel: DynamicPanel } = $props();
  // Address-select: which mode (list vs adding new)
  let addressMode = $state<"list" | "form">("list");
  let editingAddressId = $state<string | null>(null);

  // Fields come from the panel contract (single source of truth) — no more
  // hardcoded createOrderFields/addressFields arrays drifting from the schema.
  // The agent discovers the same fields via the prompt inventory.
  const contract = $derived(getContract(panel.type));
  const fields = $derived(contract.fields ?? []);
  let submitting = $state(false);
  const createOrderValidation = $derived(panel.type === "create-order" ? ui.verifyPanel(panel.id) : null);
  const canCreateOrder = $derived(panel.type === "create-order" && cart.items.length > 0 && createOrderValidation?.ok === true && !submitting);
  // Per-field validation errors surfaced to the user on edit.
  let fieldErrors = $state<Record<string, string>>({});

  function onFieldInput(key: string, value: unknown) {
    // Symmetric with agent fills: route user edits through validation too.
    const result = ui.fillPanelField(panel.id, key, value);
    if (!result.ok) fieldErrors = { ...fieldErrors, [key]: result.error };
    else { const { [key]: _drop, ...rest } = fieldErrors; fieldErrors = rest; }
  }

  /** Coerce a (possibly unknown) data value into a string for input/textarea. */
  function str(v: unknown): string {
    return v == null ? "" : String(v);
  }

  function trackingProgress(): Array<{ step?: string; timestamp?: string }> {
    return Array.isArray(panel.data.progress)
      ? [...(panel.data.progress as Array<{ step?: string; timestamp?: string }>)]
          .reverse()
      : [];
  }

  async function submit() {
    if (panel.type === "create-order") {
      const validation = ui.verifyPanel(panel.id);
      if (cart.items.length === 0) {
        toasts.error("Add at least one item before creating an order.");
        return;
      }
      if (!validation.ok) {
        toasts.error("Complete the required order details first.");
        return;
      }
      submitting = true;
      try {
        const payload = {
          cart: cart.items.map((i) => ({ product_id: i.product.id, quantity: i.quantity, icing_text: (i as { icingText?: string }).icingText })),
          recipient: { name: str(panel.data.recipientName), phone: str(panel.data.recipientPhone) },
          delivery: { address: str(panel.data.streetAddress), city: str(panel.data.deliveryCity), date: str(panel.data.deliveryDate) },
          sender: { name: str(panel.data.senderName) },
          gift_message: panel.data.giftMessage ? str(panel.data.giftMessage) : null,
        };
        const data = await createOrder(payload);
        ui.setOrderResult({ orderNumber: data.orderNumber, orderRef: data.orderRef, paymentUrl: data.paymentUrl, expiresAt: data.expiresAt });
        const cartSnapshot = cart.items.map((i) => ({
          productId: i.product.id, name: i.product.name, price: i.product.price ?? undefined,
          currency: i.product.currency, quantity: i.quantity, imageUrl: i.product.imageUrl,
        }));
        const record = createOrderRecord(data, payload, cartSnapshot);
        cart.clear();
        ui.closeDynamicPanel(panel.id, data);
        toasts.success("Order created successfully!");
      } catch (err) {
        toasts.error(err instanceof Error ? err.message : "Order failed");
      } finally {
        submitting = false;
      }
    } else {
      ui.closeDynamicPanel(panel.id, panel.data);
    }
  }

  function cancel() {
    ui.closeDynamicPanel(panel.id, null);
  }

  function closePanel(result: unknown) {
    ui.closeDynamicPanel(panel.id, result);
  }

  // Address-select handlers
  function selectAddress(addr: Address) {
    ui.closeDynamicPanel(panel.id, addr);
  }

  function startNewAddress() {
    editingAddressId = null;
    ui.replacePanelData(panel.id, {});
    addressMode = "form";
  }

  function startEditAddress(addr: Address) {
    editingAddressId = addr.id;
    ui.replacePanelData(panel.id, { ...addr });
    addressMode = "form";
  }

  function saveAddress() {
    const d = panel.data;
    if (!d.recipientName || !d.city) return;
    if (editingAddressId) {
      addresses.update(editingAddressId, d as Partial<Address>);
    } else {
      const id = addresses.add(d as Omit<Address, "id" | "createdAt">);
      editingAddressId = id;
    }
    addressMode = "list";
  }

  function cloneAddress(id: string) {
    addresses.clone(id);
  }

  function deleteAddress(id: string) {
    addresses.remove(id);
  }
</script>

<div class="panel glass" role="dialog" aria-label={panel.title}>
  {#if panel.type === "create-order"}
    <PanelHeader title={panel.title} icon={ShoppingBag}>
      {#snippet actions()}
        <PanelActionButton label="Create" icon={ShoppingBag} disabled={!canCreateOrder} onclick={submit} />
      {/snippet}
    </PanelHeader>
  {:else if panel.type === "order-tracking"}
    <PanelHeader title={panel.title} icon={Truck}>
      {#snippet actions()}
        <PanelActionButton label="Orders" icon={Package} onclick={() => ui.open("orders", { kind: "static" })} />
      {/snippet}
    </PanelHeader>
  {:else}
    <header class="panel-header">
      <h3 class="panel-title">{panel.title}</h3>
    </header>
  {/if}

  <div class="panel-body">
    {#if panel.status === "expired"}
      <!-- Reload-expired: the original promise can't resolve. Tell the user. -->
      <div class="expired-notice">
        <AlertCircle class="h-6 w-6" />
        <p>This panel expired after a page reload.</p>
        <p class="expired-hint">Ask the agent to open it again to continue.</p>
        <button type="button" class="btn-secondary" onclick={cancel}>Dismiss</button>
      </div>
    {:else if panel.type === "address-select"}
      {#if addressMode === "list"}
        <div class="addr-list">
          {#each addresses.addresses as addr (addr.id)}
            <div role="button" tabindex="0" class="addr-card" onclick={() => selectAddress(addr)} onkeydown={(e) => { if (e.key === "Enter") selectAddress(addr); }} in:fly={{ y: 10, duration: 200 }}>
              <div class="addr-card-info">
                <span class="addr-label">{addr.label}</span>
                <span class="addr-name">{addr.recipientName}</span>
                <span class="addr-detail">{addr.streetAddress}, {addr.city}</span>
                {#if addr.isDefault}<span class="addr-badge">Default</span>{/if}
              </div>
              <div class="addr-card-actions">
                <button type="button" onclick={(e) => { e.stopPropagation(); startEditAddress(addr); }} aria-label="Edit"><Edit3 class="h-3.5 w-3.5" /></button>
                <button type="button" onclick={(e) => { e.stopPropagation(); cloneAddress(addr.id); }} aria-label="Clone"><Copy class="h-3.5 w-3.5" /></button>
                <button type="button" onclick={(e) => { e.stopPropagation(); deleteAddress(addr.id); }} aria-label="Delete"><Trash2 class="h-3.5 w-3.5" /></button>
              </div>
              <ChevronRight class="h-4 w-4 text-[var(--color-muted-foreground)]" />
            </div>
          {:else}
            <div class="addr-empty">
              <MapPin class="h-6 w-6" />
              <p>No saved addresses yet.</p>
            </div>
          {/each}
        </div>
        <button type="button" class="panel-add-btn" onclick={startNewAddress}>
          <Plus class="h-4 w-4" /> Add New Address
        </button>
      {:else}
        <!-- Address form (add/edit) -->
        <form onsubmit={(e) => { e.preventDefault(); saveAddress(); }} class="panel-form">
          {#each fields as field (field.key)}
            <label class="field">
              <span class="field-label">{field.label}{#if field.required}<span class="field-required">*</span>{/if}</span>
              {#if field.type === "textarea"}
                <textarea value={str(panel.data[field.key])} oninput={(e) => onFieldInput(field.key, (e.target as HTMLTextAreaElement).value)} placeholder={field.placeholder ?? ""} rows={2} class="field-input field-textarea"></textarea>
              {:else}
                <input type={field.type} value={str(panel.data[field.key])} oninput={(e) => onFieldInput(field.key, (e.target as HTMLInputElement).value)} placeholder={field.placeholder ?? ""} class="field-input" />
              {/if}
              {#if field.hint}<span class="field-hint">{field.hint}</span>{/if}
              {#if fieldErrors[field.key]}<span class="field-error">{fieldErrors[field.key]}</span>{/if}
            </label>
          {/each}
          <div class="panel-form-actions">
            <button type="button" class="btn-secondary" onclick={() => addressMode = "list"}>Back to list</button>
            <button type="submit" class="btn-primary"><Check class="h-4 w-4" /> Save Address</button>
          </div>
        </form>
      {/if}

    {:else if panel.type === "address-form"}
      <form onsubmit={(e) => { e.preventDefault(); submit(); }} class="panel-form">
        {#each fields as field (field.key)}
          <label class="field">
            <span class="field-label">{field.label}{#if field.required}<span class="field-required">*</span>{/if}</span>
            {#if field.type === "textarea"}
              <textarea value={str(panel.data[field.key])} oninput={(e) => onFieldInput(field.key, (e.target as HTMLTextAreaElement).value)} placeholder={field.placeholder ?? ""} rows={2} class="field-input field-textarea"></textarea>
            {:else}
              <input type={field.type} value={str(panel.data[field.key])} oninput={(e) => onFieldInput(field.key, (e.target as HTMLInputElement).value)} placeholder={field.placeholder ?? ""} class="field-input" />
            {/if}
            {#if field.hint}<span class="field-hint">{field.hint}</span>{/if}
            {#if fieldErrors[field.key]}<span class="field-error">{fieldErrors[field.key]}</span>{/if}
          </label>
        {/each}
        <div class="panel-form-actions">
          <button type="submit" class="btn-primary"><Check class="h-4 w-4" /> Confirm</button>
        </div>
      </form>

    {:else if panel.type === "create-order"}
      <!-- Cart summary -->
        {#if cart.items.length > 0 && !ui.isVisible("cart")}
        <div class="cart-table">
          <div class="cart-table-header">
            <span class="cart-table-th cart-table-th--item">Item</span>
            <span class="cart-table-th cart-table-th--qty">Qty</span>
            <span class="cart-table-th cart-table-th--price">Price</span>
          </div>
          <div class="cart-table-body">
            {#each cart.items as item (item.product.id)}
              <div class="cart-table-row">
                <span class="cart-table-cell cart-table-cell--name">{item.product.name}</span>
                <span class="cart-table-cell cart-table-cell--qty">x{item.quantity}</span>
                <span class="cart-table-cell cart-table-cell--price">{formatMoney((item.product.price ?? 0) * item.quantity, item.product.currency)}</span>
              </div>
            {/each}
          </div>
          <div class="cart-table-footer">
            <span class="cart-table-cell cart-table-cell--name">Total</span>
            <span class="cart-table-cell cart-table-cell--qty"></span>
            <span class="cart-table-cell cart-table-cell--price cart-table-total-value">{formatMoney(cart.subtotal)}</span>
          </div>
        </div>
      {/if}
      <form onsubmit={(e) => { e.preventDefault(); submit(); }} class="panel-form">
        {#each fields as field (field.key)}
          <label class="field">
            <span class="field-label">{field.label}{#if field.required}<span class="field-required">*</span>{/if}</span>
            {#if field.type === "textarea"}
              <textarea value={str(panel.data[field.key])} oninput={(e) => onFieldInput(field.key, (e.target as HTMLTextAreaElement).value)} placeholder={field.placeholder ?? ""} rows={2} class="field-input field-textarea"></textarea>
            {:else}
              <input type={field.type} value={str(panel.data[field.key])} oninput={(e) => onFieldInput(field.key, (e.target as HTMLInputElement).value)} placeholder={field.placeholder ?? ""} class="field-input" />
            {/if}
            {#if field.hint}<span class="field-hint">{field.hint}</span>{/if}
            {#if fieldErrors[field.key]}<span class="field-error">{fieldErrors[field.key]}</span>{/if}
          </label>
        {/each}
      </form>

    {:else if panel.type === "wishlist"}
      <div class="wishlist-info">
        <Heart class="h-5 w-5" />
        <p>Items you're tracking for price drops and availability.</p>
      </div>
      <!-- Wishlist rendering will be added when wishlist store is wired -->
      <div class="panel-form-actions">
        <button type="button" class="btn-primary" onclick={submit}>Done</button>
      </div>

    {:else if panel.type === "order-tracking"}
      <div class="tracking-panel">
        {#if panel.data.statusDisplay || panel.data.status}
          <div class="tracking-card">
            <div class="tracking-card-header">
              <Truck class="tracking-card-icon" />
              <span class="tracking-card-title">{panel.data.statusDisplay ?? panel.data.status}</span>
              {#if panel.data.comments}
                <span class="tracking-comment-badge">{panel.data.comments}</span>
              {/if}
            </div>
            <div class="tracking-details-grid">
              {#if panel.data.orderNumber}
                <span class="tracking-dt">Order</span>
                <span class="tracking-dd">{panel.data.orderNumber}</span>
              {/if}
              {#if panel.data.orderDate}
                <span class="tracking-dt">Order date</span>
                <span class="tracking-dd">{panel.data.orderDate}</span>
              {/if}
              {#if panel.data.shippedDate}
                <span class="tracking-dt">Shipped</span>
                <span class="tracking-dd">{panel.data.shippedDate}</span>
              {/if}
              {#if panel.data.deliveryDate}
                <span class="tracking-dt">Delivery</span>
                <span class="tracking-dd">{panel.data.deliveryDate}</span>
              {/if}
              {#if panel.data.amount}
                <span class="tracking-dt">Total</span>
                <span class="tracking-dd">{(panel.data.amount as any).currency} {(panel.data.amount as any).value}</span>
              {/if}
            </div>
          </div>
        {/if}

        {#if (panel.data.recipient as any)?.name || (panel.data.recipient as any)?.phone || (panel.data.recipient as any)?.address || (panel.data.recipient as any)?.city}
          <div class="tracking-card">
            <div class="tracking-card-header">
              <span class="tracking-card-title">Recipient</span>
            </div>
            <div class="tracking-recipient-body">
              {#if (panel.data.recipient as any).name}
                <p class="tracking-recipient-name">{(panel.data.recipient as any).name}</p>
              {/if}
              {#if (panel.data.recipient as any).phone}
                <p class="tracking-recipient-phone">{(panel.data.recipient as any).phone}</p>
              {/if}
              {#if (panel.data.recipient as any).address || (panel.data.recipient as any).city}
                {@const addr = [(panel.data.recipient as any).address, (panel.data.recipient as any).city].filter(Boolean).join(", ")}
                <p class="tracking-recipient-addr">{addr}</p>
              {/if}
            </div>
          </div>
        {/if}

        {#if panel.data.greetingMessage}
          <div class="tracking-card">
            <div class="tracking-card-header">
              <span class="tracking-card-title">Gift message</span>
            </div>
            <div class="tracking-recipient-body">
              <p class="tracking-gift-msg">{panel.data.greetingMessage}</p>
            </div>
          </div>
        {/if}

        {#if Array.isArray(panel.data.progress) && panel.data.progress.length > 0}
          <div class="tracking-timeline">
            {#each trackingProgress() as step, i (i)}
              <div class="tracking-step">
                {#if i === 0}
                  <CheckCircle2 class="tracking-step-icon tracking-step-icon--active" />
                {:else if step.timestamp}
                  <CheckCircle2 class="tracking-step-icon tracking-step-icon--done" />
                {:else}
                  <Circle class="tracking-step-icon" />
                {/if}
                <div class="tracking-step-info">
                  <span class="tracking-step-label">{step.step}</span>
                  {#if step.timestamp}<span class="tracking-step-time">{step.timestamp}</span>{/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}

        {#if panel.data.hasDeliveryPhoto || panel.data.hasDeliveryVideo}
          <div class="tracking-media">
            {#if panel.data.hasDeliveryPhoto}<span class="media-badge">Photo available</span>{/if}
            {#if panel.data.hasDeliveryVideo}<span class="media-badge">Video available</span>{/if}
          </div>
        {/if}
      </div>

    {:else if fields.length > 0}
      <!-- Generic form fallback for any contract-declared fillable panel -->
      <form onsubmit={(e) => { e.preventDefault(); submit(); }} class="panel-form">
        {#each fields as field (field.key)}
          <label class="field">
            <span class="field-label">{field.label}{#if field.required}<span class="field-required">*</span>{/if}</span>
            {#if field.type === "textarea"}
              <textarea value={str(panel.data[field.key])} oninput={(e) => onFieldInput(field.key, (e.target as HTMLTextAreaElement).value)} placeholder={field.placeholder ?? ""} rows={2} class="field-input field-textarea"></textarea>
            {:else}
              <input type={field.type} value={str(panel.data[field.key])} oninput={(e) => onFieldInput(field.key, (e.target as HTMLInputElement).value)} placeholder={field.placeholder ?? ""} class="field-input" />
            {/if}
            {#if field.hint}<span class="field-hint">{field.hint}</span>{/if}
            {#if fieldErrors[field.key]}<span class="field-error">{fieldErrors[field.key]}</span>{/if}
          </label>
        {/each}
        <button type="submit" class="btn-primary">Submit</button>
      </form>
    {/if}
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border-radius: var(--radius-xl);
    border: 1px solid var(--color-border);
  }

  .panel-header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--panel-header-h);
    padding: 0 1rem;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }


  .panel-title {
    font-family: var(--font-display);
    font-size: var(--fs-xl);
    line-height: 1;
    font-weight: 700;
    color: var(--color-foreground);
  }

  /* Cart table (create-order summary) */
  .cart-table {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .cart-table-header {
    display: grid;
    grid-template-columns: 1fr 2.5rem 5rem;
  }
  .cart-table-body {
    overflow-y: auto;
    max-height: 12rem;
    overscroll-behavior: contain;
  }
  .cart-table-row {
    display: grid;
    grid-template-columns: 1fr 2.5rem 5rem;
  }
  .cart-table-footer {
    display: grid;
    grid-template-columns: 1fr 2.5rem 5rem;
    border-top: 1px solid var(--color-border);
  }
  .cart-table-cell,
  .cart-table-th {
    padding: 0.375rem 0.5rem;
    font-size: var(--fs-xs);
  }
  .cart-table-header .cart-table-th {
    background: color-mix(in srgb, var(--color-muted) 40%, transparent);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-muted-foreground);
  }
  .cart-table-th--item,
  .cart-table-cell--name { text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cart-table-th--qty,
  .cart-table-cell--qty { text-align: center; color: var(--color-muted-foreground); }
  .cart-table-th--price,
  .cart-table-cell--price { text-align: right; font-weight: 600; white-space: nowrap; }
  .cart-table-footer .cart-table-cell {
    font-weight: 700;
    font-size: var(--fs-sm);
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
  }
  .cart-table-total-value { color: var(--color-primary); }

  .panel-body { flex: 1; overflow-y: auto; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.75rem; }

  /* Address list */
  .addr-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .addr-card {
    display: flex; align-items: center; gap: 0.5rem; text-align: left;
    padding: 0.75rem; border-radius: var(--radius-lg); border: 1px solid var(--color-border);
    background: var(--color-background); cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .addr-card:hover { border-color: var(--color-primary); }
  .addr-card-info { flex: 1; display: flex; flex-direction: column; gap: 0.125rem; }
  .addr-label { font-size: var(--fs-md); font-weight: 700; color: var(--color-foreground); }
  .addr-name { font-size: var(--fs-sm); color: var(--color-muted-foreground); }
  .addr-detail { font-size: var(--fs-sm); color: var(--color-muted-foreground); }
  .addr-badge { font-size: 0.5625rem; font-weight: 600; color: var(--color-primary); margin-top: 0.125rem; }
  .addr-card-actions { display: flex; gap: 0.25rem; }
  .addr-card-actions button {
    display: flex; align-items: center; justify-content: center;
    width: 1.5rem; height: 1.5rem; border: none; border-radius: var(--radius-sm);
    background: var(--color-muted); color: var(--color-muted-foreground); cursor: pointer;
  }
  .addr-card-actions button:hover { color: var(--color-foreground); }

  .addr-empty {
    display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
    padding: 2rem; color: var(--color-muted-foreground); opacity: 0.5; font-size: var(--fs-md);
  }

  .panel-add-btn {
    display: flex; align-items: center; justify-content: center; gap: 0.375rem;
    padding: 0.625rem; border: 1px dashed var(--color-border); border-radius: var(--radius-lg);
    background: transparent; color: var(--color-muted-foreground); font-size: var(--fs-md);
    cursor: pointer; transition: border-color 0.15s, color 0.15s;
  }
  .panel-add-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }

  /* Forms */
  .panel-form { display: flex; flex-direction: column; gap: 0.75rem; }
  .field { display: flex; flex-direction: column; gap: 0.25rem; }
  .field-label { font-size: var(--fs-sm); font-weight: 600; color: var(--color-muted-foreground); }
  .field-required { color: var(--color-destructive); margin-left: 0.125rem; }
  .field-hint { font-size: var(--fs-xs); color: var(--color-muted-foreground); }
  .field-error { font-size: var(--fs-xs); color: var(--color-destructive); }

  .expired-notice {
    display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
    text-align: center; padding: 2rem; color: var(--color-muted-foreground);
  }
  .expired-notice p { font-size: var(--fs-md); }
  .expired-hint { font-size: var(--fs-sm) !important; opacity: 0.7; }
  .field-input {
    padding: 0.5rem 0.625rem; border: 1px solid var(--color-border); border-radius: var(--radius-md);
    background: var(--color-background); color: var(--color-foreground); font-size: var(--fs-lg);
    outline: none; transition: border-color 0.15s;
  }
  .field-input:focus { border-color: var(--color-primary); }
  .field-textarea { resize: vertical; min-height: 2.5rem; }

  .panel-form-actions { display: flex; gap: 0.5rem; justify-content: flex-end; padding-top: 0.5rem; }

  .btn-primary {
    display: flex; align-items: center; gap: 0.375rem;
    padding: 0.5rem 1rem; border: none; border-radius: var(--radius-lg);
    background: var(--color-primary); color: var(--color-primary-foreground);
    font-size: var(--fs-md); font-weight: 600; cursor: pointer;
    transition: opacity 0.15s;
  }
  .btn-primary:hover { opacity: 0.9; }
  .btn-primary:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
  /* ── Tracking Panel ── */
  .tracking-panel {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.5rem 0;
  }

  .tracking-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .tracking-card-header {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    background: color-mix(in srgb, var(--color-muted) 25%, transparent);
    border-bottom: 1px solid var(--color-border);
  }

  :global(.tracking-card-icon) {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    color: var(--color-primary);
  }

  .tracking-card-title {
    font-size: var(--fs-sm);
    font-weight: 700;
    color: var(--color-foreground);
    text-transform: capitalize;
  }

  .tracking-comment-badge {
    font-size: var(--fs-xs);
    color: var(--color-muted-foreground);
    background: color-mix(in srgb, var(--color-muted) 40%, transparent);
    padding: 0.125rem 0.375rem;
    border-radius: var(--radius-sm);
    margin-left: auto;
  }

  .tracking-details-grid {
    display: grid;
    grid-template-columns: minmax(max-content, 5rem) 1fr;
    gap: 0;
  }

  .tracking-dt {
    padding: 0.4375rem 0.625rem;
    font-size: var(--fs-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-muted-foreground);
    border-bottom: 1px solid var(--color-border);
    border-right: 1px solid var(--color-border);
    background: color-mix(in srgb, var(--color-muted) 15%, transparent);
    white-space: nowrap;
  }

  .tracking-dd {
    padding: 0.4375rem 0.625rem;
    font-size: var(--fs-sm);
    color: var(--color-foreground);
    border-bottom: 1px solid var(--color-border);
  }

  .tracking-dt:nth-last-child(2),
  .tracking-dd:last-child {
    border-bottom: none;
  }

  .tracking-recipient-body {
    padding: 0.5rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .tracking-recipient-name {
    font-size: var(--fs-md);
    font-weight: 600;
    color: var(--color-foreground);
    margin: 0;
  }

  .tracking-recipient-phone {
    font-size: var(--fs-sm);
    color: var(--color-muted-foreground);
    margin: 0;
  }

  .tracking-recipient-addr {
    font-size: var(--fs-sm);
    color: var(--color-muted-foreground);
    margin: 0;
  }

  .tracking-gift-msg {
    font-size: var(--fs-sm);
    font-style: italic;
    color: var(--color-foreground);
    margin: 0;
  }

  .tracking-timeline {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding-left: 0.5rem;
  }

  .tracking-step {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    padding: 0.375rem 0;
    position: relative;
  }

  .tracking-step:not(:last-child)::before {
    content: "";
    position: absolute;
    left: 0.4375rem;
    top: 1.25rem;
    bottom: -0.25rem;
    width: 2px;
    background: var(--color-border);
  }

  .tracking-step :global(.tracking-step-icon) {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    margin-top: 0.0625rem;
    color: var(--color-border);
    background: var(--color-surface);
    border-radius: var(--radius-full);
    z-index: 1;
  }

  .tracking-step :global(.tracking-step-icon--active) {
    color: var(--color-primary);
    animation: tracking-pulse 1.4s ease-in-out infinite;
  }

  .tracking-step :global(.tracking-step-icon--done) {
    color: var(--color-success);
  }

  @keyframes tracking-pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.12); opacity: 0.75; }
  }

  .tracking-step-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .tracking-step-label {
    font-size: var(--fs-md);
    font-weight: 500;
    color: var(--color-foreground);
  }

  .tracking-step-time {
    font-size: var(--fs-xs);
    color: var(--color-muted-foreground);
  }

  .tracking-media {
    display: flex;
    gap: 0.5rem;
  }

  .media-badge {
    font-size: var(--fs-xs);
    font-weight: 600;
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-sm);
    background: var(--color-muted);
    color: var(--color-muted-foreground);
  }
</style>
