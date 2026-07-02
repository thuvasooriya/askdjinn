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
    <div class="flex h-full min-h-0 flex-col items-center justify-center gap-3 p-6 text-center">
      <p class="text-sm font-semibold text-[var(--color-foreground)]">Product details are unavailable</p>
      <p class="max-w-sm text-xs text-[var(--color-muted-foreground)]">This product was not found in the saved browser search cache. Search again or reopen it from current results.</p>
      <button type="button" class="rounded-full bg-[var(--color-primary)] px-4 py-2 text-xs font-bold text-[var(--color-primary-foreground)] transition hover:scale-[1.02]" onclick={() => ui.closeProductDetail()}>
        Close details
      </button>
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
