<script lang="ts">
  import { ExternalLink, X, Check } from "@lucide/svelte";
  import type { ResolvedProvider } from "$lib/providers";
  import { fade } from "svelte/transition";
  import type { Product } from "$lib/shopping-engine";
  import { useCart } from "$lib/stores/cart.svelte";
  import { useSession } from "$lib/stores/session.svelte";
  import { useProfile } from "$lib/stores/profile.svelte";
  import * as persist from "$lib/stores/persistence";
  import { useConversation } from "$lib/stores/conversation.svelte";
  import { useUI } from "$lib/stores/ui.svelte";
  import { toasts } from "$lib/ui/toast";
  import { useLiveVoice } from "$lib/stores/live-voice.svelte";
  import { buildClientToolContext } from "$lib/ai/client-context";
  import { flyToCart } from "$lib/cart-animation";
  import type { PanelType } from "$lib/panel-contracts";
  import ConfirmDialog from "$lib/ui/ConfirmDialog.svelte";
  import type { StorageResetNotice } from "$lib/stores/persistence";
  import HomeHero from "$lib/components/shell/HomeHero.svelte";
  import CanvasGrid from "$lib/components/shell/CanvasGrid.svelte";
  import FloatingResponse from "$lib/components/shell/FloatingResponse.svelte";
  import Region from "$lib/components/shell/Region.svelte";
  import Dock from "$lib/components/shell/Dock.svelte";
  import WebcamPip from "./shell/WebcamPip.svelte";
  import AgentBar from "./AgentBar.svelte";
  import Onboarding from "./Onboarding.svelte";
  import AskUserModal from "./AskUserModal.svelte";
  import ImageGalleryModal from "./ImageGalleryModal.svelte";

  let { liveAvailable }: { liveAvailable: boolean } = $props();

  const cart = useCart();
  const session = useSession();
  const profile = useProfile();
  const conv = useConversation();
  const ui = useUI();
  const liveVoice = useLiveVoice();

  let liveActive = $state(false);
  let cartBumping = $state(false);
  let cartButtonEl: HTMLElement | undefined = $state();
  let resetNotice = $state<StorageResetNotice | null>(null);
  let resetPromptOpen = $state(false);

  $effect(() => {
    if (resetNotice) return;
    const notice = persist.storageResetNotice();
    if (!notice) return;
    resetNotice = notice;
    resetPromptOpen = true;
  });

  $effect(() => {
    const state = liveVoice.state;
    if (liveActive && (state === "idle" || state === "error")) {
      liveActive = false;
      conv.setMode("text");
      if (state === "error" && liveVoice.error) toasts.error(liveVoice.error);
    }
  });

  function addProduct(product: Product, _sourceEl: HTMLElement | null = null) {
    cart.addItem(product);
    toasts.success("Added to cart");
  }

  $effect(() => {
    const pulse = cart.pulse;
    if (pulse === 0) return;
    bumpCart();
    const id = cart.lastAddedId;
    if (id && cartButtonEl) {
      const card = document.querySelector(`[data-product-id="${CSS.escape(id)}"]`) as HTMLElement | null;
      if (card) flyToCart(card, cartButtonEl);
    }
  });


  let bumpTimer: number | undefined;
  $effect(() => () => { if (bumpTimer) window.clearTimeout(bumpTimer); });
  function bumpCart() { cartBumping = true; if (bumpTimer) window.clearTimeout(bumpTimer); bumpTimer = window.setTimeout(() => { cartBumping = false; }, 600); }
  function openPaymentLink(url?: string) {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const detailProduct = $derived(
    ui.productDetailId
      ? ui.productRegistry.get(ui.productDetailId) ?? null
      : null,
  );

  function handleProductClick(product: Product) {
    ui.openProductDetail(product.id);
  }

  async function startLiveVoice() {
    liveActive = true;
    conv.setMode("voice");
    try {
      const ok = await liveVoice.connect(buildClientToolContext());
      if (!ok) {
        toasts.error(liveVoice.error ?? "Failed to connect");
        liveActive = false;
        conv.setMode("text");
      }
    } catch (err) {
      toasts.fromError(err, "Voice connection failed");
      liveActive = false;
      conv.setMode("text");
    }
  }

  function endLiveVoice() {
    liveVoice.disconnect();
    liveActive = false;
    conv.setMode("text");
  }

  function newConversation() {
    conv.clearAll();
    ui.resetView();
  }

  function rerunOnboarding() {
    profile.resetOnboarding();
  }

  function clearCache() {
    persist.clearAll();
    persist.markStorageCurrent();
    window.location.reload();
  }

  function resetStaleStorage() {
    persist.clearAll();
    persist.markStorageCurrent();
    window.location.reload();
  }

  function resetPromptDescription(notice: StorageResetNotice | null): string {
    if (!notice) return "";
    const stored = notice.storedEpoch == null ? "an older unversioned cache" : `storage epoch ${notice.storedEpoch}`;
    return `This browser has ${stored}, while this build expects storage epoch ${notice.currentEpoch}. Resetting local app data clears old cache entries that can conflict with the latest order and panel state.`;
  }

  const hasDisplayedPanels = $derived(ui.placement.visible.length > 0);
  const isHome = $derived(!hasDisplayedPanels);
  // Grid class derives from the ACTUAL visible-panel count (placement), not the
  // stale isOpen checks. 1 visible panel → full-width; 2 → grid-2; 3+.
  const visibleCount = $derived(ui.isSplit ? ui.placement.visible.length : 0);
  const gridClass = $derived(
    isHome ? 'grid-home'
      : !ui.isSplit ? 'grid-mobile'
      : visibleCount <= 1 ? 'grid-1'
      : visibleCount === 2 ? 'grid-2'
      : 'grid-3'
  );
</script>
<svelte:window oncontextmenu={(e) => e.preventDefault()} />

<ConfirmDialog
  bind:open={resetPromptOpen}
  title="Reset local app data?"
  description={resetPromptDescription(resetNotice)}
  confirmLabel="Reset app data"
  cancelLabel="Continue for now"
  variant="destructive"
  onConfirm={resetStaleStorage}
/>

{#if profile.hydrated && !profile.onboarded}
  <Onboarding />
{:else if !profile.hydrated}
  <div class="flex h-dvh items-center justify-center bg-[var(--color-background)]"></div>
{:else}
  <div class="canvas safe-top">
    <Dock
      onNewConversation={newConversation}
      onRerunOnboarding={rerunOnboarding}
      onClearCache={clearCache}
      onCartClick={(el) => { cartButtonEl = el; bumpCart(); ui.togglePanelVisibility("cart"); }}
      {isHome}
    />

    <!-- Order banner (if active) -->
    {#if ui.lastOrder}
      <div class="order-banner bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-foreground)] rounded-xl shadow-lg flex items-center gap-3 px-4 py-3">
        <div class="order-icon"><Check class="h-3.5 w-3.5" /></div>
        <span class="order-text">Order ready</span>
        {#if ui.lastOrder.orderRef ?? ui.lastOrder.orderNumber}<span class="order-num font-mono text-[10px] text-[var(--color-muted-foreground)]">{ui.lastOrder.orderRef ?? ui.lastOrder.orderNumber}</span>{/if}
        <span class="flex-1"></span>
        {#if ui.lastOrder.paymentUrl}
          <button type="button" onclick={() => openPaymentLink(ui.lastOrder?.paymentUrl)} class="order-pay flex items-center gap-1 rounded-full bg-[var(--color-primary)] px-2.5 py-1 text-[10px] font-bold text-[var(--color-primary-foreground)] no-underline">Pay <ExternalLink class="h-3 w-3" /></button>
        {/if}
        <button onclick={() => ui.clearOrderResult()} type="button" class="order-dismiss" aria-label="Dismiss"><X class="h-3 w-3" /></button>
      </div>
    {/if}

    <!-- Canvas tiles -->
    <!-- Canvas tiles (renders the Region tree on both desktop and mobile!) -->
    <CanvasGrid {gridClass}>
      {#if isHome}
        <HomeHero />
      {:else}
        <!-- Composable layout tree. On mobile, the visible cap is 1, so Region
             automatically renders exactly the single active panel fullscreen. -->
        <Region
          region={ui.placement.tree}
          panels={ui.panels}
          onClose={(id) => ui.close(id)}
          onAddProduct={addProduct}
          onClickProduct={handleProductClick}
          onCreateOrder={() => { ui.open("create-order" as PanelType, { kind: "dynamic" }); }}
          {liveActive}
        />
      {/if}
    </CanvasGrid>

    <!-- Floating response and orb -->
    <FloatingResponse />
    {#if !ui.conversationVisible}
      <AgentBar {liveActive} onLiveStart={startLiveVoice} onLiveEnd={endLiveVoice} />
    {/if}

    {#if ui.askUser}
      <AskUserModal question={ui.askUser.question} options={ui.askUser.options} onSelect={(answer: string) => ui.resolveAskUser(answer)} onDismiss={() => ui.dismissAskUser()} />
    {/if}

    {#if ui.galleryState?.open}
      <ImageGalleryModal
        images={ui.galleryState.images}
        activeIndex={ui.galleryState.activeIndex}
        productName={ui.galleryState.productId ? (ui.productRegistry.get(ui.galleryState.productId)?.name ?? "") : ""}
        open={true}
        onClose={() => ui.closeGallery()}
        onNavigate={(index) => ui.navigateGallery(index)}
      />
    {/if}
  </div>
    <!-- Floating FaceTime PIP webcam preview for Video Calls -->
    {#if liveVoice.videoStream}
      <WebcamPip stream={liveVoice.videoStream} onClose={() => liveVoice.stopVideoStream()} />
    {/if}
{/if}

<style>
  .canvas {
    position: relative;
    height: 100dvh;
    overflow: hidden;
    background: var(--color-background);
  }

  /* Old top-right FAB styles removed — replaced by the bottom-right Dock.
     Cart fly-to-cart target is now the Dock's cart chip. */

  /* Order banner — toast-style container, positioned top-center */
  .order-banner {
    position: fixed; top: 0.625rem; left: 50%; transform: translateX(-50%); z-index: 40;
    cursor: pointer;
    transition: transform 0.15s;
  }
  .order-banner:hover {
    transform: translateX(-50%) scale(1.02);
  }
  .order-banner:active {
    transform: translateX(-50%) scale(0.98);
  }
  .order-icon {
    display: flex; align-items: center; justify-content: center;
    width: 1.5rem; height: 1.5rem; border-radius: var(--radius-full);
    background: var(--color-success); color: var(--color-success-foreground);
  }
  .order-text { font-size: var(--fs-sm); font-weight: 500; }
  .order-dismiss {
    background: none; border: none; color: var(--color-muted-foreground);
    cursor: pointer; padding: 0.25rem;
  }

  /* .tile chrome now lives on PanelHost (.tile-host) — the old .tile rule
     was for the flat-grid wrappers that the Region tree replaced. */


  /* Mobile sheets */
  :global(.mobile-overlay) { position: fixed; inset: 0; z-index: 40; background: color-mix(in srgb, var(--color-background) 60%, transparent); backdrop-filter: blur(2px); }
  :global(.mobile-sheet) {
    position: fixed; top: 0; bottom: auto; left: 0; right: 0; z-index: 45; max-height: 75vh;
    display: flex; flex-direction: column; background: var(--color-surface);
    border-bottom-left-radius: 1.25rem; border-bottom-right-radius: 1.25rem; border-bottom: 1px solid var(--color-border);
    box-shadow: var(--shadow-float); outline: none;
    animation: slide-down-sheet 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes slide-down-sheet { from { transform: translateY(-100%); } to { transform: translateY(0); } }
  :global(.mobile-title) { font-size: var(--fs-md); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-muted-foreground); padding: 0 1rem 0.5rem; }
  :global(.mobile-scroll) { overflow-y: auto; padding: 0.5rem; flex: 1; }

  /* Options dialog removed — its items now live directly in the Dock fanout. */

  :global(.fly-clone) { position: fixed; border-radius: var(--radius-full); z-index: 100; pointer-events: none; transition: transform 0.6s cubic-bezier(0.16,1,0.3,1), opacity 0.6s ease-out; }
  :global(.cart-bump) { animation: cart-bump-anim 0.4s ease-out; }
  @keyframes cart-bump-anim { 0% { transform: scale(1); } 30% { transform: scale(1.3); } 100% { transform: scale(1); } }
</style>
