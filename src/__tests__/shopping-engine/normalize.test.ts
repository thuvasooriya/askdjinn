import { describe, expect, test } from "bun:test";
import { normalizeCategories, normalizeDeliveryCheck, normalizeOrder, normalizeProductDetail, normalizeProductSearch, normalizeTracking } from "../../lib/shopping-engine/normalize";

const textResponse = (value: unknown) => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }],
});

describe("normalizeProductSearch", () => {
  test("parses valid MCP response with products", () => {
    const result = normalizeProductSearch(textResponse({
      results: [{ id: "P1", name: "Cake", price: { amount: 5000, currency: "LKR" }, in_stock: true }],
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.products).toHaveLength(1);
    expect(result.data.products[0].id).toBe("P1");
    expect(result.data.products[0].name).toBe("Cake");
    expect(result.data.products[0].price).toBe(5000);
    expect(result.data.products[0].currency).toBe("LKR");
    expect(result.data.products[0].inStock).toBe(true);
  });

  test("parses empty results", () => {
    const result = normalizeProductSearch(textResponse({ results: [] }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.products).toEqual([]);
  });

  test("falls back to parsing products from raw text when there is no content array", () => {
    const result = normalizeProductSearch("Chocolate Cake Rs. 5,000 in stock");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.products).toHaveLength(1);
    expect(result.data.products[0].id).toBe("text-0");
    expect(result.data.products[0].name).toContain("Chocolate Cake");
    expect(result.data.products[0].price).toBe(5000);
    expect(result.data.products[0].currency).toBe("LKR");
    expect(result.data.products[0].inStock).toBe(true);
  });

  test("never turns a no-results/error message into a fake product", () => {
    const cases = [
      "No products found for 'gift' in category 'cakes'.",
      "No results found.",
      "0 results",
      "Rate limit exceeded, please wait a moment",
      "Category 'cakes' not found",
    ];
    for (const text of cases) {
      const result = normalizeProductSearch(text);
      expect(result.ok, text).toBe(true);
      if (!result.ok) continue;
      expect(result.data.products, text).toEqual([]);
    }
  });

  test("parses structuredContent results", () => {
    const result = normalizeProductSearch({
      structuredContent: { results: [{ id: "P2", name: "Flowers", price: "6010", currency: "LKR", inStock: false }] },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.products).toHaveLength(1);
    expect(result.data.products[0]).toMatchObject({ id: "P2", name: "Flowers", price: 6010, currency: "LKR", inStock: false });
  });

  test("parses common price string formats from product data", () => {
    const result = normalizeProductSearch(textResponse({
      results: [
        { id: "P1", name: "Plain Number", price: "6010" },
        { id: "P2", name: "US Decimal", price: "1,234.56" },
        { id: "P3", name: "EU Decimal", price: "1.234,56" },
        { id: "P4", name: "Rupees", price: "Rs. 5,000" },
      ],
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.products.map((product) => product.price)).toEqual([6010, 1234.56, 1234.56, 5000]);
  });

  test("normalizes images from mixed string and object arrays", () => {
    const result = normalizeProductSearch(textResponse({
      results: [
        {
          id: "P1",
          name: "Mixed Images",
          price: { amount: 1000, currency: "LKR" },
          images: [
            "https://example.com/direct.jpg",
            { image_url: "https://example.com/from_object.jpg" },
            { imageUrl: "https://example.com/from_camel.jpg" },
            { photo: "https://example.com/from_photo.jpg" },
            { thumbnail: "https://example.com/from_thumb.jpg" },
            "",
            { no_match: "https://example.com/should_not_appear.jpg" },
          ],
        },
      ],
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const product = result.data.products[0];
    expect(product.images).toEqual([
      "https://example.com/direct.jpg",
      "https://example.com/from_object.jpg",
      "https://example.com/from_camel.jpg",
      "https://example.com/from_photo.jpg",
      "https://example.com/from_thumb.jpg",
    ]);
  });

  test("normalizes variant imageUrl from common image key aliases", () => {
    const result = normalizeProductSearch(textResponse({
      results: [
        {
          id: "P2",
          name: "Variant Images",
          price: { amount: 2000, currency: "LKR" },
          variants: [
            { id: "V1", name: "Red", image_url: "https://example.com/red.jpg" },
            { id: "V2", name: "Blue", imageUrl: "https://example.com/blue.jpg" },
            { id: "V3", name: "Green", photo_url: "https://example.com/green.jpg" },
          ],
        },
      ],
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const variants = result.data.products[0].variants;
    expect(variants).toHaveLength(3);
    expect(variants![0].imageUrl).toBe("https://example.com/red.jpg");
    expect(variants![1].imageUrl).toBe("https://example.com/blue.jpg");
    expect(variants![2].imageUrl).toBe("https://example.com/green.jpg");
  });

  test("preserves arbitrary string and number attributes alongside known aliases", () => {
    const result = normalizeProductSearch(textResponse({
      results: [
        {
          id: "P3",
          name: "Rich Attributes",
          price: { amount: 3000, currency: "LKR" },
          attributes: {
            color: "red",
            flavour: "chocolate",
            material: "cotton",
            serving_size: "100g",
            weight_grams: 500,
            rating_star: 4.5,
          },
        },
      ],
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const attrs = result.data.products[0].attributes;
    expect(attrs).toBeDefined();
    expect(attrs!.color).toBe("red");
    expect(attrs!.flavor).toBe("chocolate");
    expect(attrs!.material).toBe("cotton");
    expect(attrs!.servingSize).toBe("100g");
    expect(attrs!.weightGrams).toBe("500");
    expect(attrs!.ratingStar).toBe("4.5");
  });
});

describe("normalizeProductDetail", () => {
  test("parses product object in MCP response", () => {
    const result = normalizeProductDetail(textResponse({
      product: { id: "P10", name: "Birthday Cake", price: { amount: 7500, currency: "LKR" }, image_url: "https://example.com/cake.jpg" },
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.product).toMatchObject({ id: "P10", name: "Birthday Cake", price: 7500, currency: "LKR", imageUrl: "https://example.com/cake.jpg" });
  });
});

describe("normalizeDeliveryCheck", () => {
  test("parses available delivery with rate and city", () => {
    const result = normalizeDeliveryCheck(textResponse({ available: true, rate: 300, city: "Colombo 07" }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.available).toBe(true);
    expect(result.data.rate).toBe(300);
    expect(result.data.city).toBe("Colombo 07");
    expect(result.data.currency).toBe("LKR");
  });

  test("marks unknown city error text as unavailable", () => {
    const result = normalizeDeliveryCheck(textResponse("Unknown city"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.available).toBe(false);
    expect(result.data.warning).toBe("Unknown city");
  });

  test("parses perishable warning fields", () => {
    const result = normalizeDeliveryCheck(textResponse({
      city: "Kandy",
      available: true,
      perishable_warning: "Keep refrigerated",
      perishable_instructions: "Deliver before noon",
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.warning).toBe("Keep refrigerated");
    expect(result.data.perishableInstructions).toBe("Deliver before noon");
  });
});

describe("normalizeCategories", () => {
  test("parses category array", () => {
    const result = normalizeCategories(textResponse({ categories: [{ id: "cakes", name: "Cakes", product_count: 12 }] }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([{ id: "cakes", name: "Cakes", productCount: 12, description: undefined }]);
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
      status: "delivered",
      steps: [{ step: "Packed", timestamp: "2026-06-10T08:00:00Z" }, { name: "Delivered", time: "2026-06-10T12:00:00Z" }],
      has_delivery_video: true,
      has_delivery_photo: true,
      items: [{ name: "Cake" }, "Flowers"],
      recipient: { name: "Nimal", city: "Colombo" },
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.progress).toEqual([{ step: "Packed", timestamp: "2026-06-10T08:00:00Z" }, { step: "Delivered", timestamp: "2026-06-10T12:00:00Z" }]);
    expect(result.data.hasDeliveryVideo).toBe(true);
    expect(result.data.hasDeliveryPhoto).toBe(true);
    expect(result.data.items).toEqual(["Cake", "Flowers"]);
    expect(result.data.recipient).toMatchObject({ name: "Nimal", city: "Colombo" });
  });

  test("parses minimal tracking data", () => {
    const result = normalizeTracking(textResponse({ status: "processing" }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("processing");
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

  test("extracts payment URL embedded in text", () => {
    const result = normalizeOrder(textResponse("Pay here: https://pay.example/abc."));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.paymentUrl).toBe("https://pay.example/abc");
  });
});
