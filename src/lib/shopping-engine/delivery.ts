import { ShoppingValidationError } from "./errors";
import type { ShoppingResult } from "./types";

/** Request for checking delivery availability. */
export interface DeliveryCheckRequest {
  city: string;
  deliveryDate?: string;
  productId?: string;
}

/** Validate a delivery request before calling a provider. */
export function validateDeliveryCheckRequest(request: DeliveryCheckRequest): ShoppingResult<DeliveryCheckRequest> {
  if (!request.city.trim()) return fail("Delivery city is required");
  if (request.deliveryDate && !/^\d{4}-\d{2}-\d{2}$/.test(request.deliveryDate)) return fail("Delivery date must be YYYY-MM-DD");
  return ok({ ...request, city: request.city.trim() });
}

function ok<T>(data: T): ShoppingResult<T> {
  return { ok: true, data };
}

function fail<T>(message: string): ShoppingResult<T> {
  return { ok: false, error: new ShoppingValidationError(message) };
}
