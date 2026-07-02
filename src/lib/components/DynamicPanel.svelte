<script lang="ts">
  // Unified parameterized panel. One component, many panel types.
  // Agent can write to panel.data -> form updates reactively.
  // User edits form -> panel.data updates -> agent reads reactively.
  // User submits -> resolve fires -> agent continues.

  import { Check, Plus, Copy, Trash2, MapPin, Heart, ShoppingBag, Truck, Edit3, ChevronRight, AlertCircle } from "@lucide/svelte";
  import type { DynamicPanel } from "$lib/stores/ui.svelte";
  import type { Address } from "$lib/stores/addresses.svelte";
  import { useAddresses } from "$lib/stores/addresses.svelte";
  import { useUI } from "$lib/stores/ui.svelte";
  import { useCart } from "$lib/stores/cart.svelte";
  import { formatMoney } from "$lib/money";
  import { getContract } from "$lib/panel-contracts";
  import { fly, fade } from "svelte/transition";
  const addresses = useAddresses();
  const ui = useUI();
  const cart = useCart();
  let { panel }: { panel: DynamicPanel } = $props();
  // Address-select: which mode (list vs adding new)
  let addressMode = $state<"list" | "form">("list");
  let editingAddressId = $state<string | null>(null);

  // Fields come from the panel contract (single source of truth) — no more
  // hardcoded checkoutFields/addressFields arrays drifting from the schema.
  // The agent discovers the same fields via the prompt inventory.
  const contract = $derived(getContract(panel.type));
  const fields = $derived(contract.fields ?? []);
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

  function submit() {
    ui.closeDynamicPanel(panel.id, panel.data);
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
  <header class="panel-header">
    <h3 class="panel-title">{panel.title}</h3>
  </header>

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

    {:else if panel.type === "checkout"}
      <!-- Cart summary -->
      {#if cart.items.length > 0}
        <div class="cart-summary">
          {#each cart.items as item (item.product.id)}
            <div class="cart-line">
              <span class="cart-line-name">{item.product.name}</span>
              <span class="cart-line-qty">x{item.quantity}</span>
              <span class="cart-line-price">{formatMoney((item.product.price ?? 0) * item.quantity, item.product.currency)}</span>
            </div>
          {/each}
          <div class="cart-total">
            <span>Total</span>
            <span>{formatMoney(cart.subtotal)}</span>
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
        <div class="panel-form-actions">
          <button type="submit" class="btn-primary"><ShoppingBag class="h-4 w-4" /> Create Order</button>
        </div>
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
          <div class="tracking-status-badge">
            <Truck class="h-5 w-5" />
            <span>{panel.data.statusDisplay ?? panel.data.status}</span>
          </div>
        {/if}
        {#if panel.data.orderNumber}
          <p class="tracking-order-num">Order: {panel.data.orderNumber}</p>
        {/if}
        {#if panel.data.amount}
          <p class="tracking-amount">Total: {formatMoney((panel.data.amount as any).value, (panel.data.amount as any).currency)}</p>
        {/if}
        {#if panel.data.orderDate}
          <p class="tracking-date">Order date: {panel.data.orderDate}</p>
        {/if}
        {#if panel.data.shippedDate}
          <p class="tracking-date">Shipped: {panel.data.shippedDate}</p>
        {/if}
        {#if panel.data.deliveryDate}
          <p class="tracking-date">Estimated delivery: {panel.data.deliveryDate}</p>
        {/if}
        {#if (panel.data.recipient as any)?.name || (panel.data.recipient as any)?.phone || (panel.data.recipient as any)?.address || (panel.data.recipient as any)?.city}
          <div class="tracking-recipient">
            <span class="tracking-section-label">Recipient</span>
            {#if (panel.data.recipient as any).name}<p class="tracking-recipient-name">{(panel.data.recipient as any).name}</p>{/if}
            {#if (panel.data.recipient as any).phone}<p class="tracking-recipient-phone">{(panel.data.recipient as any).phone}</p>{/if}
            {#if (panel.data.recipient as any).address || (panel.data.recipient as any).city}
              <p class="tracking-recipient-addr">{[(panel.data.recipient as any).address, (panel.data.recipient as any).city].filter(Boolean).join(", ")}</p>
            {/if}
          </div>
        {/if}
        {#if panel.data.greetingMessage}
          <div class="tracking-gift-note">
            <span class="tracking-section-label">Gift message</span>
            <p class="tracking-gift-msg">{panel.data.greetingMessage}</p>
          </div>
        {/if}
        {#if Array.isArray(panel.data.progress) && panel.data.progress.length > 0}
          <div class="tracking-timeline">
            {#each panel.data.progress as step, i (i)}
              <div class="tracking-step">
                <div class="tracking-step-dot {i === 0 ? 'active' : ''}"></div>
                <div class="tracking-step-info">
                  <span class="tracking-step-label">{step.step}</span>
                  {#if step.timestamp}<span class="tracking-step-time">{step.timestamp}</span>{/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
        {#if panel.data.comments}
          <div class="tracking-comments">
            <span class="tracking-section-label">Delivery comments</span>
            <p>{panel.data.comments}</p>
          </div>
        {/if}
        {#if panel.data.hasDeliveryPhoto || panel.data.hasDeliveryVideo}
          <div class="tracking-media">
            {#if panel.data.hasDeliveryPhoto}<span class="media-badge">Photo available</span>{/if}
            {#if panel.data.hasDeliveryVideo}<span class="media-badge">Video available</span>{/if}
          </div>
        {/if}
      </div>
      <div class="panel-form-actions">
        <button type="button" class="btn-primary" onclick={submit}>Done</button>
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
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem 1rem 0.75rem;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

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
  .btn-secondary {
    padding: 0.5rem 1rem; border: 1px solid var(--color-border); border-radius: var(--radius-lg);
    background: var(--color-muted); color: var(--color-foreground);
    font-size: var(--fs-md); font-weight: 500; cursor: pointer;
  }

  /* Cart summary in checkout */
  .cart-summary { border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 0.625rem; display: flex; flex-direction: column; gap: 0.25rem; }
  .cart-line { display: flex; align-items: baseline; gap: 0.5rem; font-size: var(--fs-sm); }
  .cart-line-name { flex: 1; color: var(--color-foreground); }
  .cart-line-qty { color: var(--color-muted-foreground); }
  .cart-line-price { font-weight: 600; color: var(--color-foreground); }
  .cart-total { display: flex; justify-content: space-between; padding-top: 0.375rem; border-top: 1px solid var(--color-border); font-size: var(--fs-md); font-weight: 700; color: var(--color-foreground); }

  /* Special panels */
  .wishlist-info {
    display: flex; flex-direction: column; align-items: center; gap: 0.5rem; text-align: center; padding: 1rem;
  }

  /* Tracking panel */
  .tracking-panel { display: flex; flex-direction: column; gap: 0.75rem; padding: 0.5rem 0; }
  .tracking-status-badge {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.625rem 1rem; border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
    color: var(--color-primary); font-size: var(--fs-lg); font-weight: 700;
  }
  .tracking-order-num { font-size: var(--fs-sm); color: var(--color-muted-foreground); }
  .tracking-date { font-size: var(--fs-md); font-weight: 600; color: var(--color-foreground); }
  .tracking-timeline { display: flex; flex-direction: column; gap: 0; padding-left: 0.5rem; }
  .tracking-step {
    display: flex; align-items: flex-start; gap: 0.625rem; padding: 0.375rem 0;
    position: relative;
  }
  .tracking-step:not(:last-child)::before {
    content: ""; position: absolute; left: 0.25rem; top: 1.25rem; bottom: -0.25rem;
    width: 2px; background: var(--color-border);
  }
  .tracking-step-dot {
    width: 0.625rem; height: 0.625rem; border-radius: var(--radius-full);
    border: 2px solid var(--color-border); background: var(--color-background);
    flex-shrink: 0; margin-top: 0.125rem; z-index: 1;
  }
  .tracking-step-dot.active { border-color: var(--color-primary); background: var(--color-primary); }
  .tracking-step-info { display: flex; flex-direction: column; gap: 0.125rem; }
  .tracking-step-label { font-size: var(--fs-md); font-weight: 500; color: var(--color-foreground); }
  .tracking-step-time { font-size: var(--fs-xs); color: var(--color-muted-foreground); }
  .tracking-media { display: flex; gap: 0.5rem; }
  .media-badge {
    font-size: var(--fs-xs); font-weight: 600; padding: 0.25rem 0.5rem;
    border-radius: var(--radius-sm); background: var(--color-muted); color: var(--color-muted-foreground);
  }
.tracking-amount { font-size: var(--fs-md); font-weight: 700; color: var(--color-foreground); }
.tracking-section-label { font-size: var(--fs-xs); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-muted-foreground); }
.tracking-recipient { display: flex; flex-direction: column; gap: 0.25rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0.5rem; }
.tracking-recipient-name { font-size: var(--fs-md); font-weight: 600; color: var(--color-foreground); }
.tracking-recipient-phone { font-size: var(--fs-sm); color: var(--color-muted-foreground); }
.tracking-recipient-addr { font-size: var(--fs-sm); color: var(--color-muted-foreground); }
.tracking-gift-note { border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0.5rem; background: color-mix(in srgb, var(--color-primary) 5%, transparent); display: flex; flex-direction: column; gap: 0.25rem; }
.tracking-gift-msg { font-size: var(--fs-sm); font-style: italic; color: var(--color-foreground); }
.tracking-comments { border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem; }
.tracking-comments p { font-size: var(--fs-sm); color: var(--color-foreground); margin: 0; }
</style>
