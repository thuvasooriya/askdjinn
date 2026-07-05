import { CreateOrderValidationError } from "./errors";
import type { CreateOrderDraft, ShoppingResult } from "./types";

/** Validate an order draft before creating a real payment link. */
export function validateCreateOrderDraft(draft: CreateOrderDraft): ShoppingResult<CreateOrderDraft> {
  if (!draft.cart.length) return fail("Create order requires at least one item");
  if (!draft.recipient.name.trim()) return fail("Recipient name is required");
  if (!draft.recipient.phone.trim()) return fail("Recipient phone is required");
  if (!draft.delivery.address.trim()) return fail("Delivery address is required");
  if (!draft.delivery.city.trim()) return fail("Delivery city is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.delivery.date)) return fail("Delivery date must be YYYY-MM-DD");
  if (!draft.sender.name.trim() && !draft.sender.anonymous) return fail("Sender name is required unless anonymous");
  if (draft.giftMessage && draft.giftMessage.length > 300) return fail("Gift message must be 300 characters or less");
  return ok({ ...draft, currency: draft.currency ?? "LKR" });
}

function ok<T>(data: T): ShoppingResult<T> {
  return { ok: true, data };
}

function fail<T>(message: string): ShoppingResult<T> {
  return { ok: false, error: new CreateOrderValidationError(message) };
}
