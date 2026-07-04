<script lang="ts">
    import {
        CheckCircle2,
        ExternalLink,
        Loader2,
        MapPin,
        Copy,
        Package,
    } from "@lucide/svelte";
    import type {
        CartItem,
        DeliveryCheck,
        OrderResult,
    } from "$lib/shopping-engine";
    import { formatMoney } from "$lib/money";
    import { todayISO } from "$lib/dates";
    import { toasts } from "$lib/ui/toast";
    import Dialog from "$lib/ui/Dialog.svelte";
    import Button from "$lib/ui/Button.svelte";
    import Input from "$lib/ui/Input.svelte";
    import Select from "$lib/ui/Select.svelte";
    import Textarea from "$lib/ui/Textarea.svelte";
    import { useUI } from "$lib/stores/ui.svelte";

    let {
        open = $bindable(false),
        items = [] as CartItem[],
        subtotal = 0,
        onClose,
        onCreated,
    }: {
        open?: boolean;
        items?: CartItem[];
        subtotal?: number;
        onClose: () => void;
        onCreated?: (order: OrderResult) => void;
    } = $props();

    let form = $state({
        recipientName: "",
        recipientPhone: "",
        address: "",
        city: "",
        date: "",
        locationType: "house" as "house" | "apartment" | "office" | "other",
        senderName: "",
        giftMessage: "",
    });
    let confirming = $state(false);
    let pending = $state(false);
    let order = $state<OrderResult | null>(null);
    let error = $state("");
    let delivery = $state<DeliveryCheck | null>(null);
    let checkingDelivery = $state(false);
    const ui = useUI();

    const minDate = $derived(todayISO());
    const ready = $derived(
        Boolean(
            form.recipientName &&
            form.recipientPhone &&
            form.address &&
            form.city &&
            form.date &&
            form.senderName &&
            items.length,
        ),
    );
    const deliveryTotal = $derived(subtotal + (delivery?.rate ?? 0));

    $effect(() => {
        if (open) {
            confirming = false;
            pending = false;
            error = "";
        } else {
            order = null;
            delivery = null;
        }
    });

    let deliveryTimeout: ReturnType<typeof setTimeout> | undefined;
    // Abort in-flight delivery checks on re-run (city/date change) and on unmount
    // so a stale response can never overwrite a newer one.
    let deliveryController: AbortController | null = null;

    $effect(() => {
        if (!form.city || !form.date) {
            delivery = null;
            return;
        }
        clearTimeout(deliveryTimeout);
        deliveryTimeout = setTimeout(async () => {
            deliveryController?.abort();
            deliveryController = new AbortController();
            checkingDelivery = true;
            try {
                const res = await fetch("/api/check-delivery", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        city: form.city,
                        delivery_date: form.date,
                    }),
                    signal: deliveryController.signal,
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? "Failed");
                delivery = data;
            } catch (err) {
                if (!(err instanceof DOMException && err.name === "AbortError"))
                    delivery = null;
            } finally {
                checkingDelivery = false;
            }
        }, 400);
    });

    $effect(() => {
        return () => {
            deliveryController?.abort();
            clearTimeout(deliveryTimeout);
        };
    });

    async function createOrder() {
        if (!ready || pending) return;
        if (!confirming) {
            confirming = true;
            return;
        }
        pending = true;
        error = "";
        try {
            const res = await fetch("/api/create-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    cart: items.map((i) => ({
                        product_id: i.product.id,
                        quantity: i.quantity,
                    })),
                    recipient: {
                        name: form.recipientName,
                        phone: form.recipientPhone,
                    },
                    delivery: {
                        address: form.address,
                        city: form.city,
                        date: form.date,
                        location_type: form.locationType,
                    },
                    sender: { name: form.senderName, anonymous: false },
                    gift_message: form.giftMessage || null,
                    currency: "LKR",
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                const msg = await toasts.fromFetchError(
                    res,
                    "Order creation failed",
                );
                throw new Error(msg);
            }
            order = data;
            onCreated?.(data);
            toasts.success("Order created successfully");
        } catch (err) {
            error = toasts.fromError(err, "Order creation failed");
        } finally {
            pending = false;
        }
    }

    async function copyPaymentLink() {
        const url = order?.paymentUrl;
        if (!url) return;
        try {
            await navigator.clipboard.writeText(url);
            toasts.success("Payment link copied");
        } catch {
            toasts.error("Could not copy payment link");
        }
    }

    function viewOrders() {
        ui.openPanel("orders");
        open = false;
    }
</script>

<Dialog
    bind:open
    onOpenChange={(v) => {
        if (!v) onClose();
    }}
>
    <!-- Header -->
    <div
        class="flex h-[var(--panel-header-h)] shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4 py-0"
    >
        <h3 class="font-display text-base font-bold leading-none text-[var(--color-foreground)]">
            {order ? "Order Ready" : "Create Order"}
        </h3>
    </div>

    <!-- Body -->
    <div class="flex-1 overflow-y-auto p-4">
        {#if order}
            <div
                class="rounded-2xl border border-[var(--color-success)]/20 bg-[var(--color-success)]/5 p-6 text-center"
            >
                <div
                    class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-success)]/10 shadow-glow"
                >
                    <CheckCircle2 class="h-7 w-7 text-[var(--color-success)]" />
                </div>
                <h4 class="text-lg font-bold text-[var(--color-foreground)]">
                    Payment link ready
                </h4>
                {#if order.orderNumber}<p
                        class="mt-1 text-xs text-[var(--color-muted-foreground)]"
                    >
                        Order: {order.orderNumber}
                    </p>{/if}
                <p class="mt-2 text-xs text-[var(--color-muted-foreground)]">
                    Your order is created. Payment happens on Kapruka in the
                    next step.
                </p>
                <div
                    class="mt-5 flex flex-wrap items-center justify-center gap-2"
                >
                    {#if order.paymentUrl}
                        <a
                            href={order.paymentUrl}
                            target="_blank"
                            rel="noreferrer"
                            class="inline-flex"
                        >
                            <Button variant="primary" size="lg"
                                >Open payment page <ExternalLink
                                    class="h-4 w-4"
                                /></Button
                            >
                        </a>
                        <Button
                            variant="secondary"
                            size="lg"
                            onclick={copyPaymentLink}
                            >Copy link <Copy class="h-4 w-4" /></Button
                        >
                    {/if}
                    <Button variant="secondary" size="lg" onclick={viewOrders}
                        >View in Orders <Package class="h-4 w-4" /></Button
                    >
                </div>
                <p class="mt-4 text-xs text-[var(--color-muted-foreground)]">
                    Payment link valid for 60 minutes.
                </p>
            </div>
        {:else}
            <div class="space-y-3">
                <div class="grid grid-cols-2 gap-2">
                    <Input
                        bind:value={form.recipientName}
                        placeholder="Recipient name"
                    />
                    <Input
                        bind:value={form.recipientPhone}
                        placeholder="Phone (+94...)"
                    />
                </div>
                <Input
                    bind:value={form.address}
                    placeholder="Delivery address"
                    class="w-full"
                />
                <div class="grid grid-cols-2 gap-2">
                    <Input bind:value={form.city} placeholder="City" />
                    <Input type="date" min={minDate} bind:value={form.date} />
                </div>
                <Select bind:value={form.locationType}>
                    <option value="house">House</option>
                    <option value="apartment">Apartment</option>
                    <option value="office">Office</option>
                    <option value="other">Other</option>
                </Select>
                <Input
                    bind:value={form.senderName}
                    placeholder="Your name (sender)"
                    class="w-full"
                />
                <Textarea
                    bind:value={form.giftMessage}
                    placeholder="Gift message (optional)"
                    maxlength={300}
                    rows={2}
                    class="w-full"
                />

                {#if checkingDelivery}
                    <div
                        class="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]"
                    >
                        <Loader2 class="h-3.5 w-3.5 animate-spin" /> Checking delivery...
                    </div>
                {:else if delivery}
                    <div
                        class="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/50 px-3 py-2 text-xs"
                    >
                        <MapPin
                            class="h-3.5 w-3.5 {delivery.available === false
                                ? 'text-[var(--color-destructive)]'
                                : 'text-[var(--color-success)]'}"
                        />
                        <span class="text-[var(--color-foreground)]"
                            >{delivery.available === false
                                ? "Delivery may not be available"
                                : "Delivery available"} to {delivery.city ??
                                form.city}{#if delivery.rate}
                                ({formatMoney(
                                    delivery.rate,
                                    delivery.currency ?? "LKR",
                                )}){/if}</span
                        >
                    </div>
                {/if}

                {#if confirming}
                    <div
                        class="rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-3 text-xs text-[var(--color-foreground)]"
                    >
                        <strong class="text-[var(--color-primary)]"
                            >Confirm:</strong
                        >
                        {items.length} item(s) for {form.recipientName} at {form.address},
                        {form.city}. Subtotal: {formatMoney(subtotal, "LKR")}.
                    </div>
                {/if}
                {#if error}
                    <div
                        class="rounded-xl border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/5 p-3 text-xs text-[var(--color-destructive)]"
                    >
                        {error}
                    </div>
                {/if}
            </div>
        {/if}
    </div>

    <!-- Footer -->
    {#if !order}
        <div class="border-t border-[var(--color-border)] p-4 space-y-2">
            <div class="flex items-center justify-between text-sm">
                <span class="text-[var(--color-muted-foreground)]"
                    >Subtotal ({items.length} items)</span
                >
                <span class="font-bold text-[var(--color-foreground)]"
                    >{formatMoney(subtotal, "LKR")}</span
                >
            </div>
            {#if delivery?.rate != null}
                <div class="flex items-center justify-between text-sm">
                    <span class="text-[var(--color-muted-foreground)]"
                        >Delivery to {delivery.city ?? form.city}</span
                    >
                    <span class="font-medium text-[var(--color-foreground)]"
                        >{formatMoney(
                            delivery.rate,
                            delivery.currency ?? "LKR",
                        )}</span
                    >
                </div>
                <div
                    class="flex items-center justify-between border-t border-[var(--color-border)] pt-2 text-sm"
                >
                    <span class="font-semibold text-[var(--color-foreground)]"
                        >Total</span
                    >
                    <span class="font-bold text-[var(--color-primary)]"
                        >{formatMoney(deliveryTotal, "LKR")}</span
                    >
                </div>
            {/if}
            <Button
                variant="primary"
                size="lg"
                class="w-full"
                onclick={createOrder}
                disabled={!ready || pending}
            >
                {#if pending}<Loader2 class="h-4 w-4 animate-spin" />{/if}
                {confirming
                    ? "Confirm and create order"
                    : "Review order details"}
            </Button>
        </div>
    {/if}
</Dialog>
