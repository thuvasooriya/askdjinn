import { ShoppingValidationError } from "./errors";
import type { ShoppingResult, TrackingResult } from "./types";

/** Validate an order number before tracking. */
export function normalizeOrderNumber(orderNumber: string): ShoppingResult<string> {
  const value = orderNumber.trim();
  if (!value) return { ok: false, error: new ShoppingValidationError("Order number is required") };
  return { ok: true, data: value };
}

/** Return a concise display status for tracking UI. */
export function trackingDisplayStatus(result: TrackingResult): ShoppingResult<string> {
  return { ok: true, data: result.statusDisplay ?? result.status ?? "Tracking status unavailable" };
}
