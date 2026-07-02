import { ShoppingNormalizeError } from "./errors";
import type { Category, DeliveryCheck, OrderResult, Product, ProductDetailResult, ProductSearchResult, ShoppingResult, TrackingResult } from "./types";
import { parsePrice } from "$lib/money";

type McpContent = { type?: string; text?: string };
type McpResponse = { content?: McpContent[]; structuredContent?: unknown; [key: string]: unknown };

const imageKeys = ["image", "image_url", "imageUrl", "img", "thumbnail", "thumbnail_url", "thumbnailUrl", "photo", "photo_url", "photoUrl"];
const urlKeys = ["url", "product_url", "productUrl", "link", "direct_url", "directUrl"];
const idKeys = ["id", "product_id", "productId", "code", "sku"];

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
    const data = extractDataUnsafe(result);
    const rawText = extractTextUnsafe(result);
    return ok({ type: "product_results", products: collectProducts(data, rawText), rawText });
  } catch (error) {
    return fail("Could not normalize product search", error);
  }
}

/** Normalize a product detail response into one product snapshot. */
export function normalizeProductDetail(result: unknown): ShoppingResult<ProductDetailResult> {
  try {
    const data = extractDataUnsafe(result);
    const rawText = extractTextUnsafe(result);
    return ok({ type: "product_detail", product: normalizeProduct(findProductObject(data), rawText, 0), rawText });
  } catch (error) {
    return fail("Could not normalize product detail", error);
  }
}

/** Normalize a delivery check response. */
export function normalizeDeliveryCheck(result: unknown): ShoppingResult<DeliveryCheck> {
  try {
    const data = asRecord(extractDataUnsafe(result));
    const rawText = extractTextUnsafe(result);
    const unavailable = /(error|city_not_found|unknown city|not available|unavailable|cannot deliver|no delivery)/i.test(rawText);
    const available = unavailable ? false : getBoolean(data, ["available", "is_available", "deliverable"]) ?? undefined;
    const currency = getString(data, ["currency"]) ?? "LKR";
    return ok({
      type: "delivery_check",
      city: getString(data, ["city", "delivery_city", "name"]),
      deliveryDate: getString(data, ["checked_date", "delivery_date", "deliveryDate", "date"]),
      available,
      rate: parsePrice(getValue(data, ["rate", "delivery_rate", "deliveryRate", "fee"]), currency),
      currency,
      warning: getString(data, ["warning", "perishable_warning", "message"]) ?? (unavailable ? rawText : undefined),
      estimatedDeliveryTime: getString(data, ["estimated_delivery_time", "estimatedDeliveryTime", "eta", "estimated_time"]),
      perishableInstructions: getString(data, ["perishable_instructions", "perishableInstructions", "handling_instructions", "instructions"]),
      cityNote: getString(data, ["city_note", "cityNote", "delivery_note", "note"]),
      deliveryWindow: getString(data, ["delivery_window", "deliveryWindow", "window"]),
      reason: getString(data, ["reason"]),
      nextAvailableDate: getString(data, ["next_available_date", "nextAvailableDate"]),
      rawText,
    });
  } catch (error) {
    return fail("Could not normalize delivery check", error);
  }
}

/** Normalize category browse results. */
export function normalizeCategories(result: unknown): ShoppingResult<Category[]> {
  try {
    const data = extractDataUnsafe(result);
    const candidates = Array.isArray(data) ? data : findArray(asRecord(data), ["categories", "items", "results", "data"]);
    return ok(candidates.map((item, index) => normalizeCategory(item, index)).filter((category): category is Category => Boolean(category)));
  } catch (error) {
    return fail("Could not normalize categories", error);
  }
}

/** Normalize order tracking response. */
export function normalizeTracking(result: unknown): ShoppingResult<TrackingResult> {
  try {
    const data = asRecord(extractDataUnsafe(result));
    const rawText = extractTextUnsafe(result);
    const progressItems = arrayValue(getValue(data, ["progress", "steps", "timeline", "tracking_steps", "trackingSteps"]));
    const itemsArr = arrayValue(getValue(data, ["items", "products", "order_items", "orderItems"]));
    const recipientObj = asOptionalRecord(getValue(data, ["recipient", "customer", "receiver"]));
    const amountObj = asOptionalRecord(getValue(data, ["amount", "total", "order_total", "orderTotal"]));
    const amountCur = getString(amountObj, ["currency"]) ?? "LKR";
    const amountVal = getNumber(amountObj, ["value", "amount", "total"]);
    return ok({
      type: "tracking",
      orderNumber: getString(data, ["order_number", "orderNumber", "order_ref", "orderRef", "pnref"]),
      status: getString(data, ["status", "order_status", "orderStatus"]),
      statusDisplay: getString(data, ["status_display", "statusDisplay", "status_text", "statusText"]),
      orderDate: getString(data, ["order_date", "orderDate", "created_date", "createdDate"]),
      progress: progressItems.map((step) => {
        const item = asRecord(step);
        return { step: getString(item, ["step", "name", "label", "status", "title"]) ?? "", timestamp: getString(item, ["timestamp", "time", "date", "at", "updated_at", "updatedAt"]) };
      }).filter((step) => step.step),
      hasDeliveryVideo: getBoolean(data, ["has_delivery_video", "hasDeliveryVideo", "delivery_video", "video_available"]) ?? false,
      hasDeliveryPhoto: getBoolean(data, ["has_delivery_photo", "hasDeliveryPhoto", "delivery_photo", "photo_available"]) ?? false,
      deliveryDate: getString(data, ["delivery_date", "deliveryDate", "delivered_date", "deliveredDate"]),
      shippedDate: getString(data, ["shipped_date", "shippedDate", "dispatched_date", "dispatchedDate"]),
      items: itemsArr.map((item) => typeof item === "string" ? item : getString(asRecord(item), ["name", "title", "product_name", "productName"]) ?? getString(asRecord(item), ["id"]) ?? "").filter(Boolean),
      amount: amountVal != null ? { value: amountVal, currency: amountCur } : undefined,
      paymentMethod: getString(data, ["payment_method", "paymentMethod", "payment_type", "paymentType"]),
      comments: getString(data, ["comments", "comment", "note", "notes"]),
      greetingMessage: getString(data, ["greeting_message", "greetingMessage", "gift_message", "giftMessage", "card_message", "cardMessage"]),
      specialInstructions: getString(data, ["special_instructions", "specialInstructions", "delivery_instructions", "deliveryInstructions"]),
      pnref: getString(data, ["pnref", "reference", "ref"]),
      recipient: recipientObj ? {
        name: getString(recipientObj, ["name", "full_name", "fullName"]),
        phone: getString(recipientObj, ["phone", "mobile", "contact"]),
        address: getString(recipientObj, ["address", "street", "delivery_address", "deliveryAddress"]),
        city: getString(recipientObj, ["city", "delivery_city", "deliveryCity"]),
      } : undefined,
      rawText,
    });
  } catch (error) {
    return fail("Could not normalize tracking", error);
  }
}

/** Normalize order creation response. */
export function normalizeOrder(result: unknown): ShoppingResult<OrderResult> {
  try {
    const data = asRecord(extractDataUnsafe(result));
    const rawText = extractTextUnsafe(result);
    const paymentUrl = getString(data, ["payment_url", "paymentUrl", "pay_url", "payUrl", "url"]) ?? rawText.match(/https?:\/\/\S+/)?.[0]?.replace(/[.,;:!?)\]}>]+$/, "");
    return ok({
      type: "checkout_created",
      orderNumber: getString(data, ["order_number", "orderNumber", "order_ref", "orderRef", "id"]),
      paymentUrl,
      summary: normalizeOrderSummary(data),
      expiresAt: getString(data, ["expires_at", "expiresAt"]),
      rawText,
    });
  } catch (error) {
    return fail("Could not normalize order", error);
  }
}

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

function collectProducts(data: unknown, rawText: string): Product[] {
  const candidates = Array.isArray(data) ? data : findOptionalArray(asRecord(data), ["products", "items", "results", "data", "catalog"]);
  if (!candidates) return parseProductsFromText(rawText);
  const products = candidates.map((item, index) => normalizeProduct(item, rawText, index)).filter((product): product is Product => Boolean(product));
  return products;
}

function normalizeProduct(item: unknown, rawText: string, index: number): Product | undefined {
  const record = asOptionalRecord(item);
  if (!record) return undefined;
  const priceValue = getValue(record, ["price", "amount", "sale_price", "salePrice", "current_price"]);
  const id = getString(record, idKeys) ?? getString(record, ["productCode"]);
  const name = getString(record, ["name", "title", "product_name", "productName"]);
  if (!id && !name) return undefined;
  const currency = getString(record, ["currency"]) ?? getNestedString(priceValue, ["currency"]) ?? inferCurrency(rawText);
  const categoryObj = asOptionalRecord(record.category);
  const description = getString(record, ["description", "summary", "details"]);
  const parsed = description ? parseStructuredDescription(description) : undefined;
  return {
    id: id ?? `product-${index}`,
    name: name ?? "Product",
    price: parsePriceValue(priceValue, currency),
    currency,
    imageUrl: getString(record, imageKeys),
    productUrl: getString(record, urlKeys),
    inStock: getBoolean(record, ["in_stock", "inStock", "available", "stock"]),
    stockLabel: getString(record, ["stock_label", "stockLabel", "stock_status", "stockStatus"]),
    category: categoryObj ? (getString(categoryObj, ["name", "title"]) ?? undefined) : (getString(record, ["category", "category_name", "categoryName"]) ?? undefined),
    categoryId: categoryObj ? getString(categoryObj, ["id"]) : undefined,
    categoryPath: categoryObj ? (getString(categoryObj, ["path"]) ?? undefined) : undefined,
    summary: getString(record, ["summary"]),
    description,
    rating: getNumber(record, ["rating", "stars", "score"]) ?? null,
    stockLevel: normalizeStockLevel(getString(record, ["stock_level", "stockLevel"])),
    compareAtPrice: parsePrice(getValue(record, ["compare_at_price", "compareAtPrice", "original_price", "originalPrice", "was_price", "wasPrice"]), currency),
    shipsInternationally: getBoolean(record, ["ships_internationally", "shipsInternationally", "international_shipping", "internationalShipping"]) ?? getNestedBoolean(record.shipping, ["ships_internationally", "shipsInternationally"]),
    restrictedCountries: normalizeRestrictedCountries(getValue(record, ["shipping", "restricted_countries", "restrictedCountries"])),
    images: normalizeStringArray(record, ["images", "image_urls", "imageUrls", "photos"]),
    variants: normalizeVariants(record, currency),
    attributes: normalizeAttributes(record, parsed),
  };
}

function normalizeCategory(item: unknown, index: number): Category | undefined {
  const record = asOptionalRecord(item);
  if (!record) return undefined;
  const name = getString(record, ["name", "title", "category", "category_name", "categoryName"]);
  if (!name) return undefined;
  const fallbackId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `category-${index}`;
  return { id: getString(record, ["id", "slug", "code", "category_id", "categoryId"]) ?? fallbackId, name, productCount: getNumber(record, ["product_count", "productCount", "count", "total"]), description: getString(record, ["description", "summary"]) };
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

function findProductObject(data: unknown): unknown {
  if (Array.isArray(data)) return data[0];
  if (!data || typeof data !== "object") return data;
  const record = data as Record<string, unknown>;
  return record.product ?? record.item ?? record.data ?? record;
}

function findArray(record: Record<string, unknown>, keys: string[]) {
  return findOptionalArray(record, keys) ?? [];
}

function findOptionalArray(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (Array.isArray(record?.[key])) return record[key] as unknown[];
}

function getValue(record: Record<string, unknown> | undefined, keys: string[]) {
  if (!record) return undefined;
  for (const key of keys) if (record?.[key] != null) return record[key];
}

function getString(record: Record<string, unknown> | undefined, keys: string[]) {
  const value = getValue(record, keys);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getBoolean(record: Record<string, unknown> | undefined, keys: string[]) {
  const value = getValue(record, keys);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") return /^(true|yes|available|1|in.?stock)/i.test(value.trim());
}

function getNumber(record: Record<string, unknown> | undefined, keys: string[]) {
  const value = getValue(record, keys);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(",", ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}

function parsePriceValue(value: unknown, currency?: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return parsePrice(value, currency);
  return parsePrice(getValue(value as Record<string, unknown>, ["amount", "value", "price"]), currency);
}

function getNestedString(value: unknown, keys: string[]) {
  const record = asOptionalRecord(value);
  return record ? getString(record, keys) : undefined;
}

function parseProductsFromText(text: string): Product[] {
  if (!text) return [];
  if (/(rate limit|error|failed|too many requests|wait a moment)/i.test(text)) return [];
  return text.split("\n").flatMap((line, index) => {
    const name = line.replace(/^[-*\d.\s]+/, "").trim();
    if (!name || name.length < 8) return [];
    const currency = inferCurrency(name);
    return [{ id: `text-${index}`, name: name.slice(0, 120), price: parsePrice(name.match(/(?:LKR|Rs\.?|USD)\s*[\d,.]+/i)?.[0], currency), currency, inStock: !/out of stock/i.test(name) }];
  }).slice(0, 8);
}

function normalizeStockLevel(value: string | undefined): "low" | "medium" | "high" | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (/low|critical|few|limited|almost/.test(lower)) return "low";
  if (/high|plenty|many|surplus/.test(lower)) return "high";
  if (/medium|moderate|normal/.test(lower)) return "medium";
}

function normalizeStringArray(record: Record<string, unknown>, keys: string[]): string[] | undefined {
  const value = getValue(record, keys);
  const rawItems = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const items = rawItems.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [item.trim()];
    const nested = asOptionalRecord(item);
    if (!nested) return [];
    const nestedUrl = getString(nested, imageKeys);
    return nestedUrl ? [nestedUrl] : [];
  });
  const unique = [...new Set(items)];
  return unique.length ? unique : undefined;
}

function normalizeVariants(record: Record<string, unknown>, fallbackCurrency?: string) {
  const raw = getValue(record, ["variants", "options", "sizes"]);
  if (!Array.isArray(raw)) return undefined;
  const variants = raw.flatMap((item) => {
    const r = asOptionalRecord(item);
    if (!r) return [];
    const id = getString(r, ["id", "variant_id", "variantId", "sku"]);
    const name = getString(r, ["name", "title", "label", "option"]);
    const currency = getString(r, ["currency"]) ?? fallbackCurrency;
    if (!id && !name) return [];
    return [{ id: id ?? name ?? "", name: name ?? id ?? "", sku: getString(r, ["sku"]), price: parsePrice(getValue(r, ["price", "amount"]), currency), inStock: getBoolean(r, ["in_stock", "inStock", "available"]), stockLevel: normalizeStockLevel(getString(r, ["stock_level", "stockLevel"])), imageUrl: getString(r, imageKeys), attributes: normalizeVariantAttributes(r.attributes) }];
  });
  return variants.length ? variants : undefined;
}

function normalizeVariantAttributes(value: unknown) {
  const record = asOptionalRecord(value);
  return record ? Object.fromEntries(Object.entries(record).filter(([, item]) => typeof item === "string")) as Record<string, string> : undefined;
}

function normalizeAttributes(record: Record<string, unknown>, parsed?: ParsedDescription) {
  const raw = asOptionalRecord(record.attributes ?? record.attrs ?? record.details);
  const result: Record<string, string | undefined> = {};
  if (raw) {
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "string" && value.trim()) result[camelish(key)] = value.trim();
      else if (typeof value === "number" && Number.isFinite(value)) result[camelish(key)] = String(value);
    }
  }
  result.type = result.type ?? result.productType ?? result.category ?? parsed?.type;
  result.subtype = result.subtype ?? result.subType ?? result.subCategory ?? parsed?.subtype;
  result.weight = result.weight ?? result.shippingWeight ?? parsed?.weight;
  result.vendor = result.vendor ?? result.seller ?? result.brand ?? result.supplier;
  result.color = result.color ?? result.colour ?? parsed?.color;
  result.flavor = result.flavor ?? result.flavour ?? result.taste ?? parsed?.flavor;
  result.occasions = result.occasions ?? result.occasion ?? parsed?.occasions;
  return Object.values(result).some(Boolean) ? result : undefined;
}

function camelish(key: string) {
  return key.replace(/[_-]([a-z])/g, (_match, letter: string) => letter.toUpperCase());
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
    return m ? m[1].trim().replace(/\\s+/g, " ").slice(0, 120) || undefined : undefined;
  };
  const result: ParsedDescription = {
    weight: pick("Weight"),
    color: pick("Color"),
    flavor: pick("Flavor"),
    occasions: pick("Occasions"),
  };
  return Object.values(result).some(Boolean) ? result : undefined;
}

function normalizeRestrictedCountries(value: unknown): string[] | undefined {
  const arr = Array.isArray(value) ? value : (asOptionalRecord(value)?.restricted_countries ?? asOptionalRecord(value)?.restrictedCountries);
  if (!Array.isArray(arr)) return undefined;
  const items = arr.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  return items.length ? items : undefined;
}

function getNestedBoolean(value: unknown, keys: string[]) {
  const record = asOptionalRecord(value);
  return record ? getBoolean(record, keys) : undefined;
}

function normalizeOrderSummary(data: Record<string, unknown>) {
  const raw = asOptionalRecord(getValue(data, ["summary", "totals", "breakdown", "order_summary", "orderSummary"]));
  if (!raw) return undefined;
  const result = { itemsTotal: getNumber(raw, ["items_total", "itemsTotal", "subtotal", "sub_total", "subTotal"]), deliveryFee: getNumber(raw, ["delivery_fee", "deliveryFee", "shipping", "shipping_fee", "shippingFee", "delivery"]), grandTotal: getNumber(raw, ["grand_total", "grandTotal", "total", "amount"]), currency: getString(raw, ["currency"]) };
  return Object.values(result).some((value) => value != null) ? result : undefined;
}

function inferCurrency(text: string) {
  return /USD|\$/i.test(text) ? "USD" : "LKR";
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
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
