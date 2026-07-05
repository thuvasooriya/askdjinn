import type { OrderRecord } from "$lib/stores/session.svelte";
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

export async function createOrder(payload: CreateOrderPayload): Promise<CreatedOrder> {
  const res = await fetch("/api/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create order");
  return data as CreatedOrder;
}

export function createOrderRecord(order: CreatedOrder): OrderRecord | null {
  const orderRef = order.orderRef ?? order.orderNumber;
  if (!orderRef) return null;
  return {
    orderNumber: orderRef,
    orderRef,
    paymentUrl: order.paymentUrl,
    expiresAt: order.expiresAt,
    createdAt: Date.now(),
    lastCheckedAt: 0,
    status: "pending_payment",
    statusDisplay: "Payment pending",
    summary: order.summary,
  };
}
