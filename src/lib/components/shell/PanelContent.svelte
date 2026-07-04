<script lang="ts">
  import { useCart } from "$lib/stores/cart.svelte";
  import { useUI } from "$lib/stores/ui.svelte";
  import { useConversation } from "$lib/stores/conversation.svelte";
  import { sessionMessagesToTurns } from "$lib/session-map";
  import CartPanelContent from "../CartPanelContent.svelte";
  import ProductDetailContent from "../ProductDetailContent.svelte";
  import WishlistPanel from "../WishlistPanel.svelte";
  import SessionHistoryPanel from "../SessionHistoryPanel.svelte";
  import OrdersPanel from "../OrdersPanel.svelte";
  import AddressBookPanel from "../AddressBookPanel.svelte";
  import MemoriesPanel from "../MemoriesPanel.svelte";
  import type { Product } from "$lib/shopping-engine";

  let {
    id,
    onCheckout,
    onAddProduct,
    aspect = "portrait" as "compact" | "portrait" | "landscape" | "square",
  }: {
    id: string;
    onCheckout: () => void;
    onAddProduct: (product: Product) => void;
    aspect?: "compact" | "portrait" | "landscape" | "square";
  } = $props();

  const cart = useCart();
  const ui = useUI();
  const conv = useConversation();
  let requestedDetailIds = $state<Set<string>>(new Set());


  const detailProduct = $derived(
    ui.productDetailId
      ? ui.productRegistry.get(ui.productDetailId) ?? null
      : null,
  );

  $effect(() => {
    const product = detailProduct;
    if (!product || hasRichDetail(product) || requestedDetailIds.has(product.id)) return;
    requestedDetailIds = new Set(requestedDetailIds).add(product.id);
    void loadProductDetails(product);
  });

  // Registry-miss recovery: if the panel targets a product that isn't in the
  // registry (reload, cache evicted by the 120-item cap, …), fetch it by id
  // rather than rendering the dead "unavailable" shell.
  $effect(() => {
    const id = ui.productDetailId;
    if (!id || ui.productRegistry.get(id) || requestedDetailIds.has(id)) return;
    requestedDetailIds = new Set(requestedDetailIds).add(id);
    void loadProductById(id);
  });

  function hasRichDetail(product: Product) {
    const hasImageSet = Boolean(product.images?.length || product.variants?.some((variant) => variant.imageUrl));
    const hasDetailText = Boolean(product.description || product.summary || product.attributes || product.variants?.length);
    return hasImageSet && hasDetailText;
  }

  async function loadProductDetails(product: Product) {
    try {
      const res = await fetch(`/api/product/${encodeURIComponent(product.id)}`);
      const data = await res.json();
      if (!res.ok || !data.product) return;
      const detailed = data.product as Product;
      ui.registerProduct({
        ...product,
        ...detailed,
        id: product.id,
        imageUrl: detailed.imageUrl ?? product.imageUrl,
        images: [...new Set([...(product.images ?? []), ...(detailed.images ?? [])])],
      });
    } catch {
      // Detail enrichment is opportunistic; the cached search result remains usable.
    }
  }

  async function loadProductById(id: string) {
    try {
      const res = await fetch(`/api/product/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok || !data.product) return;
      ui.registerProduct(data.product as Product);
    } catch {
      // Non-fatal — the panel falls back to the unavailable state below.
    }
  }

  function handleGalleryOpen(images: string[], index: number) {
    const productId = ui.productDetailId;
    ui.openGallery(images, index, productId);
  }

  function newConversation() {
    conv.clearAll();
    ui.resetView();
  }
</script>

{#if id === "cart"}
  <CartPanelContent
    items={cart.items}
    subtotal={cart.subtotal}
    onRemove={cart.removeItem}
    onQuantity={cart.updateQuantity}
    onCheckout={onCheckout}
  />
  {:else if id === "product-detail"}
    {#if detailProduct}
      <ProductDetailContent product={detailProduct} onAdd={onAddProduct} onGalleryOpen={handleGalleryOpen} {aspect} />
    {:else}
      <div class="flex h-full min-w-0 flex-col items-center justify-center gap-3 p-6 text-center">
        {#if ui.productDetailId && requestedDetailIds.has(ui.productDetailId)}
          <p class="text-sm font-semibold text-[var(--color-foreground)]">Product details are unavailable</p>
          <p class="max-w-sm text-xs text-[var(--color-muted-foreground)]">This product could not be loaded. Try searching for it again.</p>
          <button type="button" class="rounded-full bg-[var(--color-primary)] px-4 py-2 text-xs font-bold text-[var(--color-primary-foreground)] transition hover:scale-[1.02]" onclick={() => ui.closeProductDetail()}>
            Close details
          </button>
        {:else}
          <div class="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]"></div>
          <p class="text-xs text-[var(--color-muted-foreground)]">Loading product…</p>
        {/if}
      </div>
    {/if}
{:else if id === "wishlist"}
  <WishlistPanel />
{:else if id === "sessions"}
  <SessionHistoryPanel
    mode="inline"
    onLoad={(msgs) => { conv.setMessages(sessionMessagesToTurns(msgs)); }}
    onDelete={(_id) => {}}
    onNew={newConversation}
  />
{:else if id === "orders"}
  <OrdersPanel />
{:else if id === "address-book"}
  <AddressBookPanel />
{:else if id === "memories"}
  <MemoriesPanel />
{/if}
