import { ShoppingNormalizeError } from "./errors";
import type { Category, DeliveryCheck, OrderResult, Product, ProductDetailResult, ProductSearchResult, ProductVariant, ShoppingResult, TrackingItem, TrackingResult } from "./types";
import type { KaprukaCategoriesResponse, KaprukaCategoryNode, KaprukaDeliveryCheck, KaprukaOrderResponse, KaprukaProduct, KaprukaSearchItem, KaprukaSearchResponse, KaprukaTrackingResponse, KaprukaVariant } from "./kapruka-types";

type McpContent = { type?: string; text?: string };
type McpResponse = { content?: McpContent[]; structuredContent?: unknown; [key: string]: unknown };

/** Extract display text from a raw MCP-style response. */
export function extractText(result: unknown): ShoppingResult<string> {
  try {
    return ok(extractTextUnsafe(result));
  } catch (error) {
    return fail("Could not extract MCP text", error);
  }
}

/** Extract structured data from a raw MCP-style response. */
export function extractData(result: unknown): ShoppingResult<unknown> {
  try {
    return ok(extractDataUnsafe(result));
  } catch (error) {
    return fail("Could not extract MCP data", error);
  }
}

/** Normalize a product search response into product cards. */
export function normalizeProductSearch(result: unknown): ShoppingResult<ProductSearchResult> {
  try {
    const rawText = extractTextUnsafe(result);
    const data = extractDataUnsafe(result);
    // Inline boundary guard: MCP search always returns {results: [...]}
    const typed = data && typeof data === "object" && !Array.isArray(data) && Array.isArray((data as KaprukaSearchResponse).results)
      ? (data as KaprukaSearchResponse)
      : null;
    const products = typed
      ? typed.results.map(adaptSearchItem)
      : [];
    return ok({ type: "product_results", products, rawText });
  } catch (error) {
    return fail("Could not normalize product search", error);
  }
}

/** Normalize a product detail response into one product snapshot. */
export function normalizeProductDetail(result: unknown): ShoppingResult<ProductDetailResult> {
  try {
    const rawText = extractTextUnsafe(result);
    const data = extractDataUnsafe(result);
    // Inline boundary guard: MCP product always has {id, name, ...}
    const typed = data && typeof data === "object" && !Array.isArray(data)
      && typeof (data as KaprukaProduct).id === "string"
      && typeof (data as KaprukaProduct).name === "string"
      ? (data as KaprukaProduct)
      : null;
    return ok({ type: "product_detail", product: typed ? adaptProduct(typed) : undefined, rawText });
  } catch (error) {
    return fail("Could not normalize product detail", error);
  }
}

export function normalizeDeliveryCheck(result: unknown): ShoppingResult<DeliveryCheck> {
  try {
    const data = extractDataUnsafe(result);
    // Inline boundary guard: MCP always returns {available: bool, rate: number, ...}
    const typed = data && typeof data === "object" && !Array.isArray(data) && typeof (data as KaprukaDeliveryCheck).available === "boolean"
      ? (data as KaprukaDeliveryCheck)
      : null;
    if (!typed) return fail("Delivery check response missing expected fields");
    return ok({
      type: "delivery_check",
      city: typed.city,
      deliveryDate: typed.checked_date,
      available: typed.available,
      rate: typed.rate,
      currency: typed.currency,
      reason: typed.reason ?? undefined,
      nextAvailableDate: typed.next_available_date ?? undefined,
      perishableWarning: typed.perishable_warning ?? undefined,
    });
  } catch (error) {
    return fail("Could not normalize delivery check", error);
  }
}

export function normalizeCategories(result: unknown): ShoppingResult<Category[]> {
  try {
    const data = extractDataUnsafe(result);
    const typed = data && typeof data === "object" && !Array.isArray(data) && Array.isArray((data as KaprukaCategoriesResponse).categories)
      ? (data as KaprukaCategoriesResponse)
      : null;
    if (!typed) return fail("Categories response missing expected fields");
    return ok(typed.categories.map(adaptCategory));
  } catch (error) {
    return fail("Could not normalize categories", error);
  }
}

export function normalizeTracking(result: unknown): ShoppingResult<TrackingResult> {
  try {
    const data = extractDataUnsafe(result);
    const typed = data && typeof data === "object" && !Array.isArray(data) && typeof (data as KaprukaTrackingResponse).order_number === "string"
      ? (data as KaprukaTrackingResponse)
      : null;
    if (!typed) return fail("Tracking response missing expected fields");
    const amountNum = parseFloat(typed.amount);
    return ok({
      type: "tracking",
      orderNumber: typed.order_number,
      pnref: typed.pnref,
      status: typed.status,
      statusDisplay: typed.status_display,
      orderDate: typed.order_date,
      deliveryDate: typed.delivery_date,
      shippedDate: typed.shipped_date ?? undefined,
      amount: Number.isFinite(amountNum) ? { value: amountNum, currency: "LKR" } : undefined,
      paymentMethod: typed.payment_method,
      comments: typed.comments ?? undefined,
      greetingMessage: typed.greeting_message ?? undefined,
      specialInstructions: typed.special_instructions ?? undefined,
      progress: typed.progress,
      liveTrackingAvailable: typed.live_tracking_available,
      hasDeliveryVideo: typed.has_delivery_video,
      hasDeliveryPhoto: typed.has_delivery_photo,
      items: typed.items.map(i => ({ productId: i.product_id, name: i.name, quantity: i.quantity, sellingPrice: i.selling_price })),
      recipient: {
        name: typed.recipient.name,
        phone: typed.recipient.phone.replace(/<br\s*\/?>/gi, "").trim() || undefined,
        address: typed.recipient.address,
        city: typed.recipient.city,
      },
    });
  } catch (error) {
    return fail("Could not normalize tracking", error);
  }
}

export function normalizeOrder(result: unknown): ShoppingResult<OrderResult> {
  try {
    const data = extractDataUnsafe(result);
    const typed = data && typeof data === "object" && !Array.isArray(data) && typeof (data as KaprukaOrderResponse).checkout_url === "string"
      ? (data as KaprukaOrderResponse)
      : null;
    if (!typed) return fail("Order response missing expected fields");
    return ok({
      type: "order_created",
      orderRef: typed.order_ref,
      orderNumber: typed.order_ref,
      paymentUrl: typed.checkout_url,
      summary: typed.summary ? {
        itemsTotal: typed.summary.items_total,
        deliveryFee: typed.summary.delivery_fee,
        addonsTotal: typed.summary.addons_total,
        grandTotal: typed.summary.grand_total,
        currency: typed.summary.currency,
      } : undefined,
      expiresAt: typed.expires_at,
    });
  } catch (error) {
    return fail("Could not normalize order", error);
  }
}

// ── Typed adapters for Kapruka MCP product/search schemas ────────────────────

function adaptSearchItem(item: KaprukaSearchItem): Product {
  const parsed = item.summary ? parseStructuredDescription(item.summary) : undefined;
  return {
    id: item.id,
    name: item.name,
    price: item.price.amount ?? undefined,
    currency: item.price.currency,
    imageUrl: item.image_url ?? undefined,
    productUrl: item.url,
    inStock: item.in_stock,
    stockLevel: item.stock_level,
    category: item.category.name,
    categoryId: item.category.id,
    summary: item.summary || undefined,
    rating: item.rating,
    shipsInternationally: item.ships_internationally,
    compareAtPrice: item.compare_at_price?.amount ?? undefined,
    attributes: parsed ? normalizeAttributes({}, parsed) : undefined,
  };
}

function adaptProduct(item: KaprukaProduct): Product {
  const parsed = item.description ? parseStructuredDescription(item.description) : undefined;
  const images = item.images.length ? item.images : undefined;
  const variants = item.variants.length ? item.variants.map(adaptVariant) : undefined;
  return {
    id: item.id,
    name: item.name,
    price: item.price.amount ?? undefined,
    currency: item.price.currency,
    imageUrl: images?.[0],
    images,
    productUrl: item.url,
    inStock: item.in_stock,
    stockLevel: item.stock_level,
    category: item.category.name,
    categoryId: item.category.id,
    categoryPath: item.category.path,
    summary: item.summary || undefined,
    description: item.description || undefined,
    rating: item.rating,
    shipsInternationally: item.shipping.ships_internationally,
    shipsFrom: item.shipping.ships_from || undefined,
    restrictedCountries: item.shipping.restricted_countries.length ? item.shipping.restricted_countries : undefined,
    compareAtPrice: item.compare_at_price?.amount ?? undefined,
    variants,
    attributes: normalizeAttributes(item.attributes, parsed),
  };
}

function adaptVariant(v: KaprukaVariant): ProductVariant {
  return {
    id: v.id,
    name: v.name,
    sku: v.sku || undefined,
    price: v.price.amount ?? undefined,
    inStock: v.in_stock,
    stockLevel: v.stock_level,
    attributes: Object.keys(v.attributes).length ? v.attributes : undefined,
  };
}

function adaptCategory(node: KaprukaCategoryNode): Category {
  return {
    name: node.name,
    url: node.url,
    children: node.children?.map(adaptCategory),
  };
}

// ── Shared private helpers ───────────────────────────────────────────────────

function extractTextUnsafe(result: unknown) {
  const mcp = result as McpResponse;
  const contentText = mcp?.content?.map((item) => item?.type === "text" || item?.text ? item.text : "").filter(Boolean).join("\n");
  if (contentText) return contentText;
  return typeof result === "string" ? result : "";
}

function extractDataUnsafe(result: unknown): unknown {
  const mcp = result as McpResponse;
  if (mcp?.structuredContent) return parseData(mcp.structuredContent);
  const text = extractTextUnsafe(result);
  if (!text) return result;
  const parsed = parseData(text);
  return parsed === text ? result : parsed;
}

function parseData(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
    try {
      return parseData(JSON.parse(trimmed));
    } catch {
      return value;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (typeof record.result === "string") {
    const parsed = parseData(record.result);
    if (parsed !== record.result) return parsed;
  }
  return value;
}

interface ParsedDescription { type?: string; subtype?: string; weight?: string; color?: string; flavor?: string; occasions?: string; }

// The MCP description embeds structured fields as labeled lines:
// "Weight : 2.77 lbs (1.25 kg)   Color : Soft blue...   Flavor : Rich chocolate...   Occasions : ..."
// Parse them out so the detail panel can render key-value pairs instead of a prose blob.
function parseStructuredDescription(text: string): ParsedDescription | undefined {
  const pick = (label: string): string | undefined => {
    // Match "Label : value" until we hit either 2+ spaces followed by a Capitalized word,
    // or end of string. Tolerate "Label:" or "Label =" variants.
    const re = new RegExp(`${label}\\s*[:=]\\s*([^]{2,200}?)(?=\\s{2,}[A-Z][a-z]|$)`, "i");
    const m = text.match(re);
    return m ? m[1].trim().replace(/\s+/g, " ").slice(0, 120) || undefined : undefined;
  };
  const result: ParsedDescription = {
    weight: pick("Weight"),
    color: pick("Color"),
    flavor: pick("Flavor"),
    occasions: pick("Occasions"),
  };
  return Object.values(result).some(Boolean) ? result : undefined;
}

function normalizeAttributes(attrs: Record<string, unknown>, parsed?: ParsedDescription) {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === "string" && value.trim()) result[camelish(key)] = value.trim();
    else if (typeof value === "number" && Number.isFinite(value)) result[camelish(key)] = String(value);
  }
  result.type = result.type ?? parsed?.type;
  result.subtype = result.subtype ?? parsed?.subtype;
  result.weight = result.weight ?? parsed?.weight;
  // Filter out zero/placeholder weight — Kapruka returns "0" for items where shipping weight isn't tracked.
  if (result.weight === "0" || result.weight === "0.0") delete result.weight;
  result.vendor = result.vendor ?? result.seller ?? result.brand ?? result.supplier;
  result.color = result.color ?? result.colour ?? parsed?.color;
  result.flavor = result.flavor ?? result.flavour ?? result.taste ?? parsed?.flavor;
  result.occasions = result.occasions ?? result.occasion ?? parsed?.occasions;
  return Object.values(result).some(Boolean) ? result : undefined;
}

function camelish(key: string) {
  return key.replace(/[_-]([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function asRecord(value: unknown): Record<string, unknown> {
  return asOptionalRecord(value) ?? {};
}

function asOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function ok<T>(data: T): ShoppingResult<T> {
  return { ok: true, data };
}

function fail<T>(message: string, details?: unknown): ShoppingResult<T> {
  return { ok: false, error: new ShoppingNormalizeError(message, details) };
}
