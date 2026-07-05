import type { CreatedOrderRecord, CartSnapshotItem } from "$lib/stores/session.svelte";
import type { OrderResult } from "$lib/shopping-engine";

export type CreateOrderLineItem = {
  product_id: string;
  quantity: number;
  icing_text?: string | null;
};

export type CreateOrderPayload = {
  cart: CreateOrderLineItem[];
  recipient: { name: string; phone: string };
  delivery: {
    address: string;
    city: string;
    date: string;
    location_type?: "house" | "apartment" | "office" | "other";
    instructions?: string | null;
  };
  sender: { name: string; anonymous?: boolean };
  gift_message?: string | null;
  currency?: string;
};

export type CreatedOrder = OrderResult;

const CREATE_ORDER_TIMEOUT_MS = 35_000;


export async function createOrder(payload: CreateOrderPayload): Promise<CreatedOrder> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), CREATE_ORDER_TIMEOUT_MS);
  try {
    const res = await fetch("/api/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({})) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Failed to create order");
    return data as CreatedOrder;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Order creation timed out. Check Orders before retrying, because a payment link may still have been created upstream.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export function createOrderRecord(
  order: CreatedOrder,
  payload?: CreateOrderPayload,
  cartSnapshot?: CartSnapshotItem[],
): CreatedOrderRecord | null {
  const orderRef = order.orderRef ?? order.orderNumber;
  if (!orderRef) return null;
  return {
    kind: "created",
    id: orderRef,
    orderRef,
    paymentUrl: order.paymentUrl,
    expiresAt: order.expiresAt,
    createdAt: Date.now(),
    lastCheckedAt: 0,
    status: "pending_payment",
    statusDisplay: "Pending",
    summary: order.summary,
    payload,
    cartSnapshot,
  };
}
