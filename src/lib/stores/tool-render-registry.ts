// Registry of tools that emit rich bubbles in floating mode.
//
// Tools NOT registered here still execute normally and show briefly in the
// status pill (via session-phase), but they don't pop out as bubbles. This is
// intentional -- only tools with dedicated visual content (delivery checks,
// order confirmations, ask-user prompts) get their own bubble. Adding a new
// bubble tool is one registerToolBubble() call.

import type { Component } from "svelte";
import DeliveryCheckCard from "$lib/components/DeliveryCheckCard.svelte";
import OrderConfirmationCard from "$lib/components/OrderConfirmationCard.svelte";
import CartAddCard from "$lib/components/CartAddCard.svelte";
import { getCreatedOrderFromToolPart } from "$lib/order/order-render";
import { getDeliveryCheckFromToolPart, type ToolCallPart } from "$lib/delivery/delivery-render";

export interface ToolBubbleOptions {
  /** Auto-dismiss after this many ms, or "manual" to persist until dismissed. */
  timeout: number | "manual";
  /** Can be dropped by stack pressure before timeout. Permanent bubbles never are. */
  evictable: boolean;
  /** Supports click-to-expand into a full panel. */
  expandable?: boolean;
}

// Generic entry: P is the component's prop shape. The extract function is the
// single source of props, so it guarantees the component always receives what
// it needs. At the Map boundary the generic is erased to Record<string,
// unknown> -- safe because extract enforces the contract at construction time.
export interface ToolBubbleRender<P extends Record<string, unknown> = Record<string, unknown>> {
  tool: string;
  extract: (part: ToolCallPart) => P | null;
  component: Component<P>;
  options: ToolBubbleOptions;
}

const registry = new Map<string, ToolBubbleRender>();

export function registerToolBubble<P extends Record<string, unknown>>(
  render: ToolBubbleRender<P>,
): void {
  // Erase P to the storable base. Safe: extract + component were typed as a
  // matching pair at the call site, so the runtime contract holds.
  registry.set(render.tool, render as unknown as ToolBubbleRender);
}

export function getToolBubbleRender(tool: string): ToolBubbleRender | undefined {
  return registry.get(tool);
}

export function isBubbleTool(tool: string): boolean {
  return registry.has(tool);
}

// ── Default registrations ──────────────────────────────────────────────────

registerToolBubble({
  tool: "delivery_check",
  extract: (part) => {
    const r = getDeliveryCheckFromToolPart(part);
    return r ? { city: r.city, rate: r.rate, dates: r.dates } : null;
  },
  component: DeliveryCheckCard,
  options: { timeout: 20_000, evictable: true },
});

registerToolBubble({
  tool: "order_create",
  extract: (part) => {
    const order = getCreatedOrderFromToolPart(part);
    return order ? { order, compact: true } : null;
  },
  component: OrderConfirmationCard,
  options: { timeout: 30_000, evictable: false },
});

registerToolBubble({
  tool: "cart_add",
  extract: (part) => {
    const result = part.result as {
      results?: Array<{ product_id: string; quantity: number; added: boolean }>;
      partial?: boolean;
      error?: string;
    } | undefined;
    if (!result?.results?.length) return null;
    return { results: result.results, partial: result.partial, error: result.error };
  },
  component: CartAddCard,
  options: { timeout: 12_000, evictable: true },
});
