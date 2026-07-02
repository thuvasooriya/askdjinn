import { describe, expect, test } from "bun:test";
import { validateDeliveryCheckRequest } from "../../lib/shopping-engine/delivery";

describe("validateDeliveryCheckRequest", () => {
  test("trims valid city", () => {
    const result = validateDeliveryCheckRequest({ city: " Colombo 07 ", deliveryDate: "2026-06-10", productId: "P1" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({ city: "Colombo 07", deliveryDate: "2026-06-10", productId: "P1" });
  });

  test("fails blank city", () => {
    const result = validateDeliveryCheckRequest({ city: "   " });

    expect(result.ok).toBe(false);
  });

  test("fails invalid delivery date format", () => {
    const result = validateDeliveryCheckRequest({ city: "Colombo", deliveryDate: "10-06-2026" });

    expect(result.ok).toBe(false);
  });
});
