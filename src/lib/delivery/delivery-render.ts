import type { TurnPart } from "$lib/stores/conversation.svelte";

export type ToolCallPart = Extract<TurnPart, { type: "tool-call" }>;

export interface DeliveryCheckResult {
  city: string;
  rate?: number;
  dates: Array<{ date: string; available: boolean }>;
}

/** Extract delivery-check data from a tool-call part.
 *  Handles both the new multi-date result format and the old single-date format. */
export function getDeliveryCheckFromToolPart(part: ToolCallPart): DeliveryCheckResult | null {
  if (part.name !== "delivery_check" || part.status !== "done" || !part.result) return null;
  const result = part.result as Record<string, unknown>;
  const city = typeof result.city === "string" ? result.city : "";
  if (!city) return null;

  // New format: { city, rate?, dates: [{date, available}, ...] }
  if (Array.isArray(result.dates)) {
    const valid = (result.dates as unknown[]).filter(
      (d): d is { date: string; available: boolean } =>
        typeof d === "object" && d != null && typeof (d as Record<string, unknown>).date === "string",
    );
    return { city, rate: typeof result.rate === "number" ? result.rate : undefined, dates: valid };
  }

  // Legacy format: { city, available, rate? }
  if (typeof result.available === "boolean") {
    const args = part.args as Record<string, unknown> | undefined;
    const date = typeof args?.delivery_date === "string" ? args.delivery_date : undefined;
    return {
      city,
      rate: typeof result.rate === "number" ? result.rate : undefined,
      dates: date ? [{ date, available: result.available }] : [],
    };
  }

  return null;
}
