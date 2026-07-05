import { describe, expect, test } from "bun:test";
import { normalizeCategories, normalizeDeliveryCheck, normalizeOrder, normalizeProductDetail, normalizeProductSearch, normalizeTracking } from "../../lib/shopping-engine/normalize";

// Wraps a value as MCP content-array text response (JSON-stringified if not string).
const textResponse = (value: unknown) => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }],
});

// Full KaprukaSearchItem fixture matching exact MCP schema.
const searchItem = (overrides: object = {}) => ({
  id: "P1", name: "Cake", summary: "A nice cake",
  price: { amount: 5000, currency: "LKR" },
  compare_at_price: null,
  in_stock: true, stock_level: "medium",
  image_url: "https://example.com/cake.jpg",
  category: { id: "cat1", name: "Cakes", slug: "cakes" },
  rating: null, ships_internationally: false,
  url: "https://kapruka.com/cake",
  ...overrides,
});

// Full KaprukaProduct fixture matching exact MCP schema.
const productDetail = (overrides: object = {}) => ({
  id: "P10", name: "Birthday Cake",
  description: "A birthday cake", summary: "Great cake",
  price: { amount: 7500, currency: "LKR" },
  compare_at_price: null,
  in_stock: true, stock_level: "high",
  category: { id: "cat1", name: "Cakes", slug: "cakes", path: "/cakes" },
  variants: [], images: ["https://example.com/cake.jpg"],
  attributes: { type: "cake", vendor: "Baker" },
  shipping: { ships_from: "LK", ships_internationally: false, restricted_countries: [] },
  rating: null, url: "https://kapruka.com/p/birthday-cake",
  ...overrides,
});

describe("normalizeProductSearch", () => {
  test("parses valid MCP response with products", () => {
    const result = normalizeProductSearch(textResponse({ results: [searchItem()] }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.products).toHaveLength(1);
    expect(result.data.products[0].id).toBe("P1");
    expect(result.data.products[0].name).toBe("Cake");
    expect(result.data.products[0].price).toBe(5000);
    expect(result.data.products[0].currency).toBe("LKR");
    expect(result.data.products[0].inStock).toBe(true);
    expect(result.data.products[0].stockLevel).toBe("medium");
    expect(result.data.products[0].imageUrl).toBe("https://example.com/cake.jpg");
    expect(result.data.products[0].productUrl).toBe("https://kapruka.com/cake");
    expect(result.data.products[0].shipsInternationally).toBe(false);
    expect(result.data.products[0].category).toBe("Cakes");
  });

  test("parses empty results array", () => {
    const result = normalizeProductSearch(textResponse({ results: [] }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.products).toEqual([]);
  });

  test("returns empty products when response has no results key", () => {
    // No heuristic fallback — typed guard fails cleanly, products = []
    const result = normalizeProductSearch(textResponse({ items: [searchItem()] }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.products).toEqual([]);
  });

  test("returns empty products for plain text / error strings", () => {
    const cases = [
      "No products found for 'gift' in category 'cakes'.",
      "No results found.",
      "0 results",
      "Rate limit exceeded, please wait a moment",
      "Error: city_not_found",
    ];
    for (const text of cases) {
      const result = normalizeProductSearch(text);
      expect(result.ok, text).toBe(true);
      if (!result.ok) continue;
      expect(result.data.products, text).toEqual([]);
    }
  });

  test("parses structuredContent results", () => {
    const result = normalizeProductSearch({ structuredContent: { results: [searchItem()] } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.products).toHaveLength(1);
    expect(result.data.products[0].id).toBe("P1");
  });

  test("maps compare_at_price correctly", () => {
    const result = normalizeProductSearch(textResponse({
      results: [searchItem({ compare_at_price: { amount: 6000, currency: "LKR" } })],
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.products[0].compareAtPrice).toBe(6000);
  });

  test("handles null price amount", () => {
    const result = normalizeProductSearch(textResponse({
      results: [searchItem({ price: { amount: null, currency: "LKR" } })],
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.products[0].price).toBeUndefined();
  });

  test("preserves stock_level enum values from MCP", () => {
    for (const stockLevel of ["low", "medium", "high"] as const) {
      const result = normalizeProductSearch(textResponse({ results: [searchItem({ stock_level: stockLevel })] }));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.data.products[0].stockLevel).toBe(stockLevel);
    }
  });
});

describe("normalizeProductDetail", () => {
  test("parses full product object", () => {
    const result = normalizeProductDetail(textResponse(productDetail()));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.data.product!;
    expect(p.id).toBe("P10");
    expect(p.name).toBe("Birthday Cake");
    expect(p.price).toBe(7500);
    expect(p.currency).toBe("LKR");
    expect(p.imageUrl).toBe("https://example.com/cake.jpg");
    expect(p.images).toEqual(["https://example.com/cake.jpg"]);
    expect(p.inStock).toBe(true);
    expect(p.stockLevel).toBe("high");
    expect(p.shipsInternationally).toBe(false);
    expect(p.category).toBe("Cakes");
    expect(p.categoryPath).toBe("/cakes");
    expect(p.productUrl).toBe("https://kapruka.com/p/birthday-cake");
    expect(p.shipsFrom).toBe("LK");
  });

  test("maps variants from MCP schema", () => {
    const result = normalizeProductDetail(textResponse(productDetail({
      variants: [{ id: "V1", name: "Large", sku: "SKU1", price: { amount: 8000, currency: "LKR" }, in_stock: true, stock_level: "low", attributes: {} }],
    })));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const v = result.data.product!.variants![0];
    expect(v.id).toBe("V1");
    expect(v.name).toBe("Large");
    expect(v.price).toBe(8000);
    expect(v.inStock).toBe(true);
    expect(v.stockLevel).toBe("low");
  });

  test("returns undefined product when response is missing id/name", () => {
    const result = normalizeProductDetail(textResponse({ description: "no id or name" }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.product).toBeUndefined();
  });

  test("maps restricted_countries from shipping", () => {
    const result = normalizeProductDetail(textResponse(productDetail({
      shipping: { ships_from: "LK", ships_internationally: true, restricted_countries: ["US", "CA"] },
    })));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.product!.restrictedCountries).toEqual(["US", "CA"]);
  });
});

describe("normalizeDeliveryCheck", () => {
  test("parses available delivery with rate and city", () => {
    const result = normalizeDeliveryCheck(textResponse({
      city: "Colombo 07",
      now: "2026-07-05T12:00:00Z",
      checked_date: "2026-07-05",
      available: true,
      rate: 300,
      currency: "LKR",
      reason: null,
      next_available_date: null,
      perishable_warning: null,
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.available).toBe(true);
    expect(result.data.rate).toBe(300);
    expect(result.data.city).toBe("Colombo 07");
    expect(result.data.currency).toBe("LKR");
    expect(result.data.deliveryDate).toBe("2026-07-05");
  });

  test("marks unavailable delivery with reason", () => {
    const result = normalizeDeliveryCheck(textResponse({
      city: "Unknown",
      now: "2026-07-05T12:00:00Z",
      checked_date: "2026-07-05",
      available: false,
      rate: 0,
      currency: "LKR",
      reason: "City not found",
      next_available_date: null,
      perishable_warning: null,
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.available).toBe(false);
    expect(result.data.reason).toBe("City not found");
  });

  test("parses perishable warning field", () => {
    const result = normalizeDeliveryCheck(textResponse({
      city: "Kandy",
      now: "2026-07-05T12:00:00Z",
      checked_date: "2026-07-05",
      available: true,
      rate: 350,
      currency: "LKR",
      reason: null,
      next_available_date: null,
      perishable_warning: "Keep refrigerated",
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.perishableWarning).toBe("Keep refrigerated");
  });
});

describe("normalizeCategories", () => {
  test("parses category array", () => {
    const result = normalizeCategories(textResponse({ categories: [{ name: "Cakes", url: "/cakes" }] }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([{ name: "Cakes", url: "/cakes" }]);
  });

  test("parses empty category array", () => {
    const result = normalizeCategories(textResponse({ categories: [] }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([]);
  });
});

describe("normalizeTracking", () => {
  test("parses tracking steps and delivery media flags", () => {
    const result = normalizeTracking(textResponse({
      order_number: "ORD-001",
      pnref: "PNREF001",
      status: "delivered",
      status_display: "Delivered",
      order_date: "2026-06-01",
      delivery_date: "2026-06-10",
      shipped_date: null,
      amount: "15500.00",
      payment_method: "card",
      comments: null,
      recipient: { name: "Nimal", phone: "", address: "", city: "Colombo" },
      greeting_message: null,
      special_instructions: null,
      progress: [{ step: "Packed", timestamp: "2026-06-10T08:00:00Z" }, { step: "Delivered", timestamp: "2026-06-10T12:00:00Z" }],
      live_tracking_available: false,
      has_delivery_video: true,
      has_delivery_photo: true,
      items: [{ product_id: "1", name: "Cake", quantity: 1, selling_price: 1500 }],
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("delivered");
    expect(result.data.statusDisplay).toBe("Delivered");
    expect(result.data.progress).toEqual([{ step: "Packed", timestamp: "2026-06-10T08:00:00Z" }, { step: "Delivered", timestamp: "2026-06-10T12:00:00Z" }]);
    expect(result.data.hasDeliveryVideo).toBe(true);
    expect(result.data.hasDeliveryPhoto).toBe(true);
    expect(result.data.liveTrackingAvailable).toBe(false);
    expect(result.data.items).toEqual([{ productId: "1", name: "Cake", quantity: 1, sellingPrice: 1500 }]);
    expect(result.data.recipient).toMatchObject({ name: "Nimal", city: "Colombo" });
    expect(result.data.amount).toEqual({ value: 15500, currency: "LKR" });
  });

  test("parses minimal tracking data", () => {
    const result = normalizeTracking(textResponse({
      order_number: "ORD-002",
      pnref: "",
      status: "processing",
      status_display: "Processing",
      order_date: "2026-06-01",
      delivery_date: "",
      shipped_date: null,
      amount: "0.00",
      payment_method: "",
      comments: null,
      recipient: { name: "", phone: "", address: "", city: "" },
      greeting_message: null,
      special_instructions: null,
      progress: [],
      live_tracking_available: false,
      has_delivery_video: false,
      has_delivery_photo: false,
      items: [],
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("processing");
    expect(result.data.statusDisplay).toBe("Processing");
    expect(result.data.progress).toEqual([]);
    expect(result.data.hasDeliveryVideo).toBe(false);
    expect(result.data.hasDeliveryPhoto).toBe(false);
  });
});

describe("normalizeOrder", () => {
  test("parses Kapruka create-order reference, payment link, expiry, and summary", () => {
    const result = normalizeOrder(textResponse({
      checkout_url: "https://pay.example/123",
      order_ref: "ORD-123",
      summary: { items_total: 1000, delivery_fee: 250, addons_total: 50, grand_total: 1300, currency: "LKR" },
      expires_at: "2026-05-20T13:45:00+05:30",
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.paymentUrl).toBe("https://pay.example/123");
    expect(result.data.orderRef).toBe("ORD-123");
    expect(result.data.orderNumber).toBe("ORD-123");
    expect(result.data.summary?.addonsTotal).toBe(50);
    expect(result.data.expiresAt).toBe("2026-05-20T13:45:00+05:30");
  });
});
