<script lang="ts">
    import { formatMoney } from "$lib/money";
    import type { CartItem } from "$lib/shopping-engine";
    import { ShoppingBag, Plus, Minus, Trash2 } from "@lucide/svelte";
    import Button from "$lib/ui/Button.svelte";
    import { useCart } from "$lib/stores/cart.svelte";
    const cart = useCart();

    let {
        items = [] as CartItem[],
        subtotal = 0,
        onRemove,
        onQuantity,
        onCheckout,
    }: {
        items?: CartItem[];
        subtotal?: number;
        onRemove?: (id: string) => void;
        onQuantity?: (id: string, qty: number) => void;
        onCheckout?: () => void;
    } = $props();

    let imgErrors = $state<Record<string, boolean>>({});
</script>

{#if items.length === 0}
    <div
        class="flex h-full flex-col items-center justify-center px-4 py-12 text-center"
    >
        <ShoppingBag
            class="mb-3 h-10 w-10 text-[var(--color-muted-foreground)]/30"
        />
        <p class="text-sm text-[var(--color-muted-foreground)]">
            Cart is empty
        </p>
    </div>
{:else}
    <div class="flex flex-col">
        <div class="flex-1 divide-y divide-[var(--color-border)]">
            {#each items as item (item.product.id)}
                <div class="flex items-start gap-3 p-3">
                    {#if item.product.imageUrl && !imgErrors[item.product.id]}
                        <img
                            src={item.product.imageUrl}
                            alt={item.product.name}
                            class="h-14 w-14 rounded-lg object-cover"
                            loading="lazy"
                            onerror={() => (imgErrors[item.product.id] = true)}
                        />
                    {:else}
                        <div
                            class="flex h-14 w-14 items-center justify-center rounded-lg bg-[var(--color-muted)]"
                        >
                            <ShoppingBag
                                class="h-5 w-5 text-[var(--color-muted-foreground)]/40"
                            />
                        </div>
                    {/if}
                    <div class="min-w-0 flex-1">
                        <h4
                            class="line-clamp-2 text-xs font-medium leading-tight text-[var(--color-foreground)]"
                        >
                            {item.product.name}
                        </h4>
                        {#if item.product.price == null}
                            <p
                                class="mt-0.5 text-xs font-semibold text-[var(--color-muted-foreground)]"
                            >
                                Price on request
                            </p>
                        {:else}
                            <p
                                class="mt-0.5 text-sm font-bold text-[var(--color-foreground)]"
                            >
                                {formatMoney(
                                    item.product.price,
                                    item.product.currency,
                                )}
                            </p>
                        {/if}
                        <div class="mt-1.5 flex items-center gap-1.5">
                            <Button
                                onclick={() =>
                                    onQuantity?.(
                                        item.product.id,
                                        item.quantity - 1,
                                    )}
                                type="button"
                                variant="outline"
                                size="icon-xs"><Minus class="h-3 w-3" /></Button
                            >
                            <span
                                class="min-w-6 text-center text-xs font-medium text-[var(--color-foreground)]"
                                >{item.quantity}</span
                            >
                            <Button
                                onclick={() =>
                                    onQuantity?.(
                                        item.product.id,
                                        item.quantity + 1,
                                    )}
                                type="button"
                                variant="outline"
                                size="icon-xs"><Plus class="h-3 w-3" /></Button
                            >
                            <Button
                                onclick={() => onRemove?.(item.product.id)}
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                class="ml-auto hover:text-[var(--color-destructive)]"
                                ><Trash2 class="h-3 w-3" /></Button
                            >
                        </div>
                    </div>
                </div>
            {/each}
        </div>
        <div class="border-t border-[var(--color-border)] p-3 safe-bottom">
            <div class="mb-2 flex items-center justify-between text-sm">
                <span class="text-[var(--color-muted-foreground)]"
                    >Subtotal</span
                >
                <span class="font-bold text-[var(--color-foreground)]"
                    >{formatMoney(subtotal, "LKR")}</span
                >
            </div>
            {#if cart.deliveryEstimate}
                <div class="mb-1 flex items-center justify-between text-xs">
                    <span class="text-[var(--color-muted-foreground)]"
                        >Delivery to {cart.deliveryEstimate.city}</span
                    >
                    <span class="font-medium text-[var(--color-foreground)]"
                        >{formatMoney(
                            cart.deliveryEstimate.rate,
                            cart.deliveryEstimate.currency,
                        )}</span
                    >
                </div>
                <div
                    class="mb-2 flex items-center justify-between border-t border-[var(--color-border)] pt-1.5 text-sm"
                >
                    <span class="font-semibold text-[var(--color-foreground)]"
                        >Total</span
                    >
                    <span class="font-bold text-[var(--color-primary)]"
                        >{formatMoney(cart.grandTotal, "LKR")}</span
                    >
                </div>
            {:else}
                <div class="mb-2 flex items-center justify-between text-xs">
                    <span class="text-[var(--color-muted-foreground)]"
                        >Delivery fee: check delivery</span
                    >
                </div>
            {/if}
            <Button
                variant="primary"
                size="lg"
                class="w-full"
                onclick={() => onCheckout?.()}
            >
                Create order
            </Button>
        </div>
    </div>
{/if}
