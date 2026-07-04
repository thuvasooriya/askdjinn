// Shared client-side tool context. Both text mode (ConversationPanel) and live
// mode (AppShell) build their ClientToolContext from this, so tool execution is
// ONE engine regardless of which agent drove the call. Tools run where the state
// lives -> instantly reactive, can't lie, no ui-command stream indirection.

import type { ClientToolContext } from "$lib/ai/tool-registry";
import type { Product } from "$lib/shopping-engine";
import { useUI } from "$lib/stores/ui.svelte";
import { getContract } from "$lib/panel-contracts";
import { useCart } from "$lib/stores/cart.svelte";
import { useLists } from "$lib/stores/lists.svelte";
import { useProfile } from "$lib/stores/profile.svelte";
import { useSession } from "$lib/stores/session.svelte";
import { useConversation } from "$lib/stores/conversation.svelte";
import { useSessionHistory } from "$lib/stores/session-history.svelte";
import { useInteraction } from "$lib/stores/interaction.svelte";
import { useAddresses } from "$lib/stores/addresses.svelte";

export function buildClientToolContext(): ClientToolContext {
  const ui = useUI();
  const cart = useCart();
  const lists = useLists();
  const profile = useProfile();
  const session = useSession();
  const conv = useConversation();
  const sessionHistory = useSessionHistory();
  const interaction = useInteraction();
  const addresses = useAddresses();

  return {
    onHighlight: (items) => ui.highlight(items),
    onOpenDetail: (id) => ui.openProductDetail(id),
    onCloseDetail: () => ui.closeProductDetail(),
    onFilter: (products, query) => ui.setSearchResults(products as Product[], query ?? ""),
    onScrollTo: (id) => ui.scrollTo(id),
    onAddToWishlist: (id) => {
      const product = ui.getProduct(id);
      if (!product) return false;
      lists.toggleLike(product);
      return true;
    },
    onSaveFact: (text, category) => profile.addFact(text, category as never),
    onForget: () => { conv.clearAll(); ui.resetView(); sessionHistory.startNew(); interaction.clear(); },
    onClearHighlight: () => ui.clearHighlight(),
    onGetUserHighlights: () => ui.getUserHighlights(),
    onAddToCart: (id, qty = 1) => {
      const product = ui.getProduct(id);
      if (product) { cart.addItem(product, qty); return true; }
      return false;
    },
    onRegisterProduct: (product) => ui.registerProduct(product as Product),
    onRemoveFromCart: (id) => cart.removeItem(id),
    onUpdateCartQuantity: (id, qty) => cart.updateQuantity(id, qty),
    onGetCartContents: () => cart.items.map(i => ({ id: i.product.id, name: i.product.name, price: i.product.price, quantity: i.quantity })),
    onOrderCreated: (order) => { ui.setOrderResult(order); if (order.orderNumber) session.addOrder(order.orderNumber); cart.clear(); },
    onAskUser: (question, options) => new Promise<string>((resolve) => ui.setAskUser(question, options, resolve)),
    onSetDeliveryEstimate: (estimate) => cart.setDeliveryEstimate(estimate),
    onGetOrderRecord: (orderNumber) => session.getOrderRecord(orderNumber),
    onUpsertOrderRecord: (record) => session.upsertOrderRecord(record),
    onShowPanel: (config) => ui.showPanel(config as { type: never; title?: string; data?: Record<string, unknown> }),

    onGalleryOpen: (productId, imageIndex = 0) => {
      const product = ui.getProduct(productId);
      if (!product) return false;
      const images: string[] = [];
      if (product.imageUrl) images.push(product.imageUrl);
      if (product.images) images.push(...product.images);
      const unique = [...new Set(images)];
      if (unique.length === 0) return false;
      ui.openGallery(unique, imageIndex, productId);
      return true;
    },
    onGalleryClose: () => ui.closeGallery(),
    onGalleryNavigate: (index) => ui.navigateGallery(index),
    onOpenPanel: (type, data) => {
      const panel = ui.open(type as never, { data });
      return { id: panel.id, status: panel.status };
    },
    onClosePanel: (idOrType) => ui.close(idOrType),
    onFocusPanel: (id) => ui.focus(id),
    onMinimizePanel: (id) => ui.minimize(id),
    onFillPanelField: (idOrType, key, value) => {
      // Accept id OR type: resolve to the panel id first.
      const panel = ui.panels.find(p => p.id === idOrType || p.type === idOrType);
      if (!panel) return { ok: false, error: `Panel "${idOrType}" not found` };
      return ui.fillPanelField(panel.id, key, value);
    },
    onClickPanelAction: (idOrType, action, args) => {
      const panel = ui.panels.find(p => p.id === idOrType || p.type === idOrType);
      if (!panel) return { ok: false, error: `Panel "${idOrType}" not found` };
      // Actions are declared in the panel contract; only non-destructive ones
      // are invokable here. Destructive (place-order, pay) stay user-only.
      const contract = getContract(panel.type);
      const act = contract.actions?.[action];
      if (!act) return { ok: false, error: `Action "${action}" not available on ${panel.type}` };
      if (act.destructive) return { ok: false, error: `Action "${action}" is destructive — user-only` };
      const result = act.run({ panelId: panel.id, data: panel.data, update: (d) => ui.updatePanelData(panel.id, d) }, ...(args ?? []));
      return { ok: true, result };
    },
    onVerifyPanel: (idOrType) => {
      const panel = ui.panels.find(p => p.id === idOrType || p.type === idOrType);
      if (!panel) return { ok: false, missing: [], invalid: [{ key: "_", error: `Panel "${idOrType}" not found` }] };
      return ui.verifyPanel(panel.id);
    },
    onSearch: (args) => ui.runSearch({
      q: args.q ?? "",
      category: args.category ?? null,
      minPrice: args.minPrice ?? null,
      maxPrice: args.maxPrice ?? null,
      inStockOnly: args.inStockOnly ?? false,
      limit: args.limit,
    }),
    onGetOrderRecords: () => session.orderRecords,
    onListAddresses: () => addresses.addresses.map(a => ({ id: a.id, label: a.label, recipientName: a.recipientName, recipientPhone: a.recipientPhone, streetAddress: a.streetAddress, city: a.city, isDefault: a.isDefault })),
    onAddAddress: (data) => addresses.add(data),
    onRemoveAddress: (id) => addresses.remove(id),
    onSetDefaultAddress: (id) => addresses.setDefault(id),
  };
}
