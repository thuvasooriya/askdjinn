import { exportDebugLog, getDebugEntries } from '$lib/dev-log';
import { useUI } from '$lib/stores/ui.svelte';
import { useConversation } from '$lib/stores/conversation.svelte';
import { useCart } from '$lib/stores/cart.svelte';

/** Snapshot of UI + conversation state for agent/debug export. Dev-only. */
export function buildAppInspectorSnapshot(): string {
  const ui = useUI();
  const conv = useConversation();
  const cart = useCart();
  const payload = {
    at: new Date().toISOString(),
    ui: {
      layout: ui.layout,
      openPanels: [...ui.openPanels],
      conversationVisible: ui.conversationVisible,
      searchQuery: ui.searchCriteria?.q ?? '',
      productCount: ui.searchResults.length,
      dynamicPanels: ui.panels.map((p) => ({ id: p.id, type: p.type, title: p.title })),
      productDetailId: ui.productDetailId,
      lastOrder: ui.lastOrder,
    },
    conversation: {
      activeMode: conv.activeMode,
      turnCount: conv.turns.length,
      isEmpty: conv.isEmpty,
      lastTurnRole: conv.lastTurn?.role ?? null,
    },
    cart: { count: cart.count, subtotal: cart.subtotal },
    debugLogTail: getDebugEntries().slice(-40),
  };
  return JSON.stringify(payload, null, 2);
}

export function exportFullDebugBundle(): string {
  return [
    "=== APP INSPECTOR ===",
    buildAppInspectorSnapshot(),
    "",
    "=== DEBUG LOG ===",
    exportDebugLog(),
  ].join("\n");
}
