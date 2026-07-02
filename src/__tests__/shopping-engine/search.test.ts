import { describe, expect, test } from "bun:test";
import { normalizeSearchQuery } from "../../lib/shopping-engine/search";

describe("normalizeSearchQuery", () => {
  test("normalizes a valid query", () => {
    const result = normalizeSearchQuery({ q: " cake " });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ q: "cake", limit: 8, currency: "LKR", inStockOnly: true, sort: "relevance" });
  });

  test("fails empty query", () => {
    const result = normalizeSearchQuery({ q: "   " });

    expect(result.ok).toBe(false);
  });

  test("normalizes with price filters", () => {
    const result = normalizeSearchQuery({ q: "flowers", minPrice: 1000, maxPrice: 5000, limit: 20, inStockOnly: false });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.minPrice).toBe(1000);
    expect(result.data.maxPrice).toBe(5000);
    expect(result.data.limit).toBe(12);
    expect(result.data.inStockOnly).toBe(false);
  });

  test("normalizes with category", () => {
    const result = normalizeSearchQuery({ q: "birthday", category: "cakes" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.category).toBe("cakes");
  });

  test("fails when minimum price exceeds maximum price", () => {
    const result = normalizeSearchQuery({ q: "cake", minPrice: 5000, maxPrice: 1000 });

    expect(result.ok).toBe(false);
  });
});
