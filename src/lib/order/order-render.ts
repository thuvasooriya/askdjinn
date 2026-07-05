import type { TurnPart } from "$lib/stores/conversation.svelte";
import type { CreatedOrder } from "./create-order-client";

export type ToolCallPart = Extract<TurnPart, { type: "tool-call" }>;

export function getCreatedOrderFromToolPart(part: ToolCallPart): CreatedOrder | null {
  if (part.name !== "order_create" || part.status !== "done" || !part.result) return null;
  const result = part.result as Partial<CreatedOrder>;
  if (!result.paymentUrl && !result.orderRef && !result.orderNumber) return null;
  return {
    type: "order_created",
    orderRef: typeof result.orderRef === "string" ? result.orderRef : undefined,
    orderNumber: typeof result.orderNumber === "string" ? result.orderNumber : undefined,
    paymentUrl: typeof result.paymentUrl === "string" ? result.paymentUrl : undefined,
    expiresAt: typeof result.expiresAt === "string" ? result.expiresAt : undefined,
    summary: result.summary,
    rawText: typeof result.rawText === "string" ? result.rawText : undefined,
  };
}
