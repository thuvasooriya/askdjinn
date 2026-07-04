/**
 * Unified Tool Registry
 *
 * Single source of truth for every tool the agent can use.
 * Each tool has:
 * - Identity: name, description, parameter schema (Gemini-compatible intersection)
 * - UI metadata: icon, label, category
 * - Client executor: runs client-side (fetch to API route, UI action)
 *
 * Both text mode and live mode execute tools on the CLIENT via executeClientTool
 * (see client-context.ts). The server is a thin schemas-only stream proxy.
 */

import { Search, Truck, Heart, Eye, Save, Brain, Sparkles, Send, X, ShoppingCart, MessageCircleQuestion, Eraser, Plus, List, MapPin, Package, Images, Clock, Maximize2, ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, MessageSquare } from "@lucide/svelte";
import type { LlmTool } from "$lib/llm-engine";
import type { OrderRecord } from "$lib/stores/session.svelte";
import type { Product } from "$lib/shopping-engine";

// ── Types ─────────────────────────────────────────────────────────────────────

function param(type: string, description: string, extra: Record<string, unknown> = {}) {
  return { type, description, ...extra };
}

async function fetchJsonResponse(url: string, init: RequestInit = {}, label = "Request", timeoutMs = 15_000): Promise<{ res: Response; data: Record<string, unknown> }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: init.signal ?? controller.signal });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    return { res, data };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error(`${label} timed out`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url: string, init: RequestInit = {}, label = "Request", timeoutMs = 15_000): Promise<Record<string, unknown>> {
  const { res, data } = await fetchJsonResponse(url, init, label, timeoutMs);
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `${label} failed`);
  return data;
}

function hasOrderTrackingCache(order: OrderRecord | undefined): boolean {
  return Boolean(
    order?.status ||
      order?.statusDisplay ||
      order?.tracking?.length ||
      order?.amount ||
      order?.recipient ||
      order?.deliveryDate ||
      order?.orderDate ||
      order?.shippedDate ||
      order?.comments,
  );
}

export type ToolParam = ReturnType<typeof param>;

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParam>;
    required: string[];
  };
  ui: {
    icon: typeof Search;
    label: string;
  };
  category: "shopping" | "ui" | "memory" | "web" | "grounding";
  executeClient?: (
    args: Record<string, unknown>,
    ctx: ClientToolContext,
  ) => Promise<Record<string, unknown>>;
}

export interface ClientToolContext {
  onHighlight: (items: Array<{ id: string; reason?: string }>) => void;
  onOpenDetail: (productId: string) => void;
  onCloseDetail: () => void;
  onFilter: (products: unknown[], query?: string) => void;
  onScrollTo: (productId: string) => void;
  onAddToWishlist: (productId: string) => boolean | void;
  onSaveFact: (text: string, category: string) => void;
  onForget: () => void;
  onClearHighlight: () => void;
  onGetUserHighlights: () => string[];
  onAddToCart: (productId: string, quantity?: number) => boolean;
  onRegisterProduct: (product: { id: string; name: string; price?: number; currency?: string; imageUrl?: string; images?: string[]; productUrl?: string }) => void;
  onRemoveFromCart: (productId: string) => void;
  onUpdateCartQuantity: (productId: string, quantity: number) => void;
  onGetCartContents: () => Array<{ id: string; name: string; price?: number; quantity: number }>;
  onAskUser: (question: string, options: string[]) => Promise<string>;
  onOrderCreated: (order: { orderNumber?: string; paymentUrl?: string }) => void;
  onSetDeliveryEstimate: (estimate: { city: string; rate: number; currency: string; estimatedDate?: string } | null) => void;
  onGetOrderRecord: (orderNumber: string) => OrderRecord | undefined;
  onGetOrderRecords: () => OrderRecord[];
  onUpsertOrderRecord: (record: OrderRecord) => void;
  onShowPanel: (config: { type: string; title?: string; data?: Record<string, unknown> }) => Promise<unknown>;
  onGalleryOpen: (productId: string, imageIndex?: number) => boolean | void;
  onGalleryClose: () => void;
  onGalleryNavigate: (index: number) => void;
  onOpenPanel: (type: string, data?: Record<string, unknown>) => { id: string; status: string };
  onClosePanel: (idOrType: string) => void;
  onFocusPanel: (idOrType: string) => void;
  onMinimizePanel: (idOrType: string) => void;
  onFillPanelField: (idOrType: string, key: string, value: unknown) => { ok: true } | { ok: false; error: string };
  onClickPanelAction: (idOrType: string, action: string, args?: unknown[]) => { ok: true; result?: unknown } | { ok: false; error: string };
  onVerifyPanel: (idOrType: string) => { ok: true; missing?: string[]; invalid?: [] } | { ok: false; missing: string[]; invalid: Array<{ key: string; error: string }> };
  onSearch: (args: {
    q: string;
    category?: string | null;
    minPrice?: number | null;
    maxPrice?: number | null;
    inStockOnly?: boolean;
    limit?: number;
  }) => Promise<any[]>;
  onListAddresses: () => Array<{ id: string; label?: string; recipientName?: string; recipientPhone?: string; streetAddress?: string; city?: string; isDefault?: boolean }>;
  onAddAddress: (data: { label: string; recipientName: string; recipientPhone: string; streetAddress: string; city: string; notes?: string }) => unknown;
  onRemoveAddress: (id: string) => void;
  onSetDefaultAddress: (id: string) => void;
}
// ── Tool Definitions ──────────────────────────────────────────────────────────

export const TOOLS: Record<string, ToolDefinition> = {

  datetime_now: {
    name: "datetime_now",
    description: "Get the current date and time from the user's browser immediately. Use before resolving relative dates/times like today, tomorrow, tonight, this weekend, next week, Sinhala/Tamil New Year, Mother's Day, or any time-sensitive answer.",
    parameters: {
      type: "object",
      properties: {
        time_zone: param("string", "Optional IANA timezone to format in. Defaults to the browser timezone, with Asia/Colombo always included."),
      },
      required: [],
    },
    ui: { icon: Clock, label: "Checking time" },
    category: "grounding",
    executeClient: async (args) => {
      const now = new Date();
      const browserTimeZone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const requestedTimeZone =
        typeof args.time_zone === "string" && args.time_zone.trim()
          ? args.time_zone.trim()
          : browserTimeZone;

      function formatParts(timeZone: string) {
        const numericParts = new Intl.DateTimeFormat("en-US", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
          .formatToParts(now)
          .reduce<Record<string, number>>((acc, part) => {
            if (part.type !== "literal") acc[part.type] = Number(part.value);
            return acc;
          }, {});
        const date = new Intl.DateTimeFormat("en-CA", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(now);
        const time = new Intl.DateTimeFormat("en-GB", {
          timeZone,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(now);
        const weekday = new Intl.DateTimeFormat("en-US", {
          timeZone,
          weekday: "long",
        }).format(now);
        const offsetMinutes = Math.round(
          (Date.UTC(
            numericParts.year,
            numericParts.month - 1,
            numericParts.day,
            numericParts.hour,
            numericParts.minute,
            numericParts.second,
          ) -
            now.getTime()) /
            60_000,
        );
        return { date, time, weekday, timeZone, offsetMinutes };
      }

      function addDaysISO(days: number, timeZone: string) {
        const shifted = new Date(now);
        shifted.setUTCDate(shifted.getUTCDate() + days);
        return new Intl.DateTimeFormat("en-CA", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(shifted);
      }

      const requested = formatParts(requestedTimeZone);
      const sriLanka = formatParts("Asia/Colombo");
      return {
        nowIso: now.toISOString(),
        unixMs: now.getTime(),
        browserTimeZone,
        locale:
          typeof navigator !== "undefined"
            ? navigator.language
            : Intl.DateTimeFormat().resolvedOptions().locale,
        requested,
        sriLanka,
        relativeDates: {
          today: requested.date,
          tomorrow: addDaysISO(1, requestedTimeZone),
          dayAfterTomorrow: addDaysISO(2, requestedTimeZone),
        },
      };
    },
  },

  product_search: {
    name: "product_search",
    description: "Search Kapruka's catalog. Results appear in the product grid automatically. Use this before recommending any product.",
    parameters: {
      type: "object",
      properties: {
        q: param("string", "Search query. Can be empty if a category is provided."),
        category: param("string", "Optional category filter"),
        min_price: param("number", "Optional min price in LKR"),
        max_price: param("number", "Optional max price in LKR"),
        in_stock_only: param("boolean", "Filter for in stock products only"),
        limit: param("number", "Number of results (default 8, max 12)"),
      },
      required: [],
    },
    ui: { icon: Search, label: "Searching Kapruka" },
    category: "shopping",
    executeClient: async (args, ctx) => {
      const products = await ctx.onSearch({
        q: (args.q as string) ?? "",
        category: (args.category as string) ?? null,
        minPrice: (args.min_price as number) ?? null,
        maxPrice: (args.max_price as number) ?? null,
        inStockOnly: (args.in_stock_only as boolean) ?? false,
        limit: (args.limit as number) ?? 8,
      });

      return {
        query: args.q,
        count: products.length,
        products: products.slice(0, 6).map(p => ({
          id: p.id, name: p.name, price: p.price, currency: p.currency,
        })),
      };
    },
  },

  product_get_details: {
    name: "product_get_details",
    description: "Get full details of a specific product by ID only when the product is not already available in the visible products panel or cache context. Reuses the ID from product_search results; do not search again just to open details or add a known product.",
    parameters: {
      type: "object",
      properties: {
        product_id: param("string", "The product ID"),
      },
      required: ["product_id"],
    },
    ui: { icon: Eye, label: "Loading details" },
    category: "shopping",
    executeClient: async (args, ctx) => {
      const data = await fetchJson(`/api/product/${encodeURIComponent(args.product_id as string)}`, {}, "Load product details");
      const product = data.product as Product | null;
      if (product) ctx.onRegisterProduct(product);
      return {
        product: product
          ? { id: product.id, name: product.name, price: product.price, currency: product.currency, imageUrl: product.imageUrl, images: product.images, productUrl: product.productUrl }
          : null,
      };
    },
  },

  cart_add: {
    name: "cart_add",
    description: "Add a known product to the user's shopping cart by product_id. Use the product_id from product_search results, highlighted products, or visible product context; do not repeat a search before adding a product that is already visible or cached.",
    parameters: {
      type: "object",
      properties: {
        product_id: param("string", "Product ID to add to cart"),
        quantity: param("number", "Quantity to add (default 1)", { default: 1, minimum: 1, maximum: 99 }),
      },
      required: ["product_id"],
    },
    ui: { icon: Plus, label: "Adding to cart" },
    category: "shopping",
    executeClient: async (args, ctx) => {
      const added = ctx.onAddToCart(args.product_id as string, (args.quantity as number) ?? 1);
      if (!added) return { added: false, error: `Product ${args.product_id} not found. Search for products first.` };
      return { added: true, product_id: args.product_id, quantity: args.quantity ?? 1 };
    },
  },

  delivery_check: {
    name: "delivery_check",
    description: "Check delivery availability for a city and date. Delivery info appears in a panel automatically.",
    parameters: {
      type: "object",
      properties: {
        city: param("string", "Delivery city"),
        delivery_date: param("string", "Date in YYYY-MM-DD format"),
      },
      required: ["city"],
    },
    ui: { icon: Truck, label: "Checking delivery" },
    category: "shopping",
    executeClient: async (args, ctx) => {
      const city = args.city as string;
      const deliveryDate = args.delivery_date ?? null;

      async function doCheck(c: string) {
        return fetchJsonResponse("/api/check-delivery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ city: c, delivery_date: deliveryDate }),
        }, "Check delivery");
      }

      let { res, data } = await doCheck(city);
      const warning = typeof data.warning === "string" ? data.warning : "";

      if (!res.ok || (data.available === false && /unknown city|city_not_found/i.test(warning))) {
        try {
          const cityData = await fetchJson(`/api/delivery-cities?q=${encodeURIComponent(city)}&limit=1`, {}, "Search delivery cities");
          const exactCity = (cityData.cities as Array<{ name?: string }> | undefined)?.[0]?.name;
          if (exactCity && exactCity !== city) {
            ({ res, data } = await doCheck(exactCity));
          }
        } catch { /* fall through with original data */ }
      }

      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed");
      const normalized = {
        city: typeof data.city === "string" ? data.city : city,
        available: data.available !== false,
        rate: typeof data.rate === "number" ? data.rate : undefined,
      };
      if (normalized.available && normalized.rate != null) {
        ctx.onSetDeliveryEstimate({ city: normalized.city, rate: normalized.rate, currency: "LKR" });
      } else {
        ctx.onSetDeliveryEstimate(null);
      }
      return normalized;
    },
  },

  order_create: {
    name: "order_create",
    description: "Create a real Kapruka click-to-pay order. Only use after confirming all details with the user.",
    parameters: {
      type: "object",
      properties: {
        cart: param("array", "Items to order", {
          items: {
            type: "object",
            properties: {
              product_id: param("string", "Product ID"),
              quantity: param("number", "Quantity (1-99)", { default: 1 }),
              icing_text: param("string", "Custom text on cake (optional)"),
            },
            required: ["product_id"],
          },
        }),
        recipient_name: param("string", "Recipient's name"),
        recipient_phone: param("string", "Recipient's Sri Lankan phone number"),
        delivery_address: param("string", "Delivery street address"),
        delivery_city: param("string", "Delivery city"),
        delivery_date: param("string", "Date in YYYY-MM-DD format"),
        sender_name: param("string", "Sender's name"),
        gift_message: param("string", "Optional gift card message (max 300 chars)"),
      },
      required: ["cart", "recipient_name", "recipient_phone", "delivery_address", "delivery_city", "delivery_date", "sender_name"],
    },
    ui: { icon: Send, label: "Creating order" },
    category: "shopping",
    executeClient: async (args, ctx) => {
      const data = await fetchJson("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart: args.cart,
          recipient: { name: args.recipient_name, phone: args.recipient_phone },
          delivery: { address: args.delivery_address, city: args.delivery_city, date: args.delivery_date },
          sender: { name: args.sender_name },
          gift_message: args.gift_message ?? null,
        }),
      }, "Order creation");
      const order = { orderNumber: data.orderNumber as string | undefined, paymentUrl: data.paymentUrl as string | undefined };
      if (order.orderNumber || order.paymentUrl) ctx.onOrderCreated(order);
      return data;
    },
  },

  order_track: {
    name: "order_track",
    description: "Track a Kapruka order by order number.",
    parameters: {
      type: "object",
      properties: {
        order_number: param("string", "The Kapruka order number to track"),
      },
      required: ["order_number"],
    },
    ui: { icon: Truck, label: "Tracking order" },
    category: "shopping",
    executeClient: async (args, ctx) => {
      const orderNumber = args.order_number as string;

      const cached = ctx.onGetOrderRecord(orderNumber);
      if (cached && hasOrderTrackingCache(cached) && Date.now() - cached.lastCheckedAt < 300_000) {
        const panel = ctx.onOpenPanel("order-tracking", { ...cached });
        return { cached: true, panel, ...cached };
      }

      const data = await fetchJson("/api/track-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_number: orderNumber }),
      }, "Order tracking");

      ctx.onUpsertOrderRecord({
        orderNumber: (data.orderNumber as string | undefined) ?? orderNumber,
        createdAt: cached?.createdAt ?? Date.now(),
        status: data.status as string | undefined,
        statusDisplay: data.statusDisplay as string | undefined,
        tracking: data.progress,
        amount: data.amount as number | undefined,
        recipient: data.recipient as string | undefined,
        deliveryDate: data.deliveryDate as string | undefined,
        paymentMethod: data.paymentMethod as string | undefined,
        comments: data.comments as string | undefined,
        giftMessage: data.greetingMessage as string | undefined,
        orderDate: data.orderDate as string | undefined,
        shippedDate: data.shippedDate as string | undefined,
        lastCheckedAt: Date.now(),
      } as OrderRecord);

      const panel = ctx.onOpenPanel("order-tracking", { ...data, orderNumber });
      return { ...data, panel };
    },
  },

  web_search: {
    name: "web_search",
    description: "Search the web for information beyond the Kapruka catalog (gift ideas, reviews, trends).",
    parameters: {
      type: "object",
      properties: {
        query: param("string", "Search query"),
      },
      required: ["query"],
    },
    ui: { icon: Search, label: "Searching the web" },
    category: "web",
    executeClient: async (args) => {
      return fetchJson("/api/web-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: args.query }),
      }, "Web search");
    },
  },

  web_fetch_url: {
    name: "web_fetch_url",
    description: "Fetch a web page and extract its main content as markdown.",
    parameters: {
      type: "object",
      properties: {
        url: param("string", "The URL to fetch"),
      },
      required: ["url"],
    },
    ui: { icon: Eye, label: "Reading page" },
    category: "web",
    executeClient: async (args) => {
      return fetchJson("/api/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: args.url }),
      }, "Fetch URL");
    },
  },

  product_highlight: {
    name: "product_highlight",
    description: "Highlight specific products on the user's screen. Use after searching to draw attention to 1-3 defensible picks. Reasons must be accurate against the current result set; avoid unsupported superlatives like best value, cheapest, top rated, or fastest unless the returned product data proves them.",
    parameters: {
      type: "object",
      properties: {
        items: param("array", "Products to highlight with optional reasons (1-5 max)", {
          items: {
            type: "object",
            properties: {
              id: param("string", "Product ID to highlight"),
              reason: param("string", "Short, evidence-backed reason for highlighting (e.g. 'Lower price', 'Matches request', 'Premium finish', 'In stock'). Avoid unsupported comparative claims."),
            },
            required: ["id"],
          },
        }),
      },
      required: ["items"],
    },
    ui: { icon: Sparkles, label: "Highlighting" },
    category: "ui",
    executeClient: async (args, ctx) => {
      const items = Array.isArray(args.items) ? (args.items as Array<{ id: string; reason?: string }>).slice(0, 5) : [];
      ctx.onHighlight(items);
      return { highlighted: items.length };
    },
  },

  product_open_detail: {
    name: "product_open_detail",
    description: "Open a product detail panel for a known product by product_id. Use the product_id from product_search results, highlighted products, or visible product context; do not repeat a search before opening details.",
    parameters: {
      type: "object",
      properties: { product_id: param("string", "Product ID") },
      required: ["product_id"],
    },
    ui: { icon: Eye, label: "Opening" },
    category: "ui",
    executeClient: async (args, ctx) => { ctx.onOpenDetail(args.product_id as string); return { opened: true }; },
  },

  product_close_detail: {
    name: "product_close_detail",
    description: "Close the currently open product detail modal.",
    parameters: { type: "object", properties: {}, required: [] },
    ui: { icon: X, label: "Closing" },
    category: "ui",
    executeClient: async (_args, ctx) => { ctx.onCloseDetail(); return { closed: true }; },
  },

  product_scroll_to: {
    name: "product_scroll_to",
    description: "Scroll the product grid to center on a specific product.",
    parameters: {
      type: "object",
      properties: { product_id: param("string", "Product ID") },
      required: ["product_id"],
    },
    ui: { icon: Eye, label: "Scrolling" },
    category: "ui",
    executeClient: async (args, ctx) => { ctx.onScrollTo(args.product_id as string); return { scrolled: true }; },
  },

  product_gallery_open: {
    name: "product_gallery_open",
    description: "Open the fullscreen image gallery for a product. Shows all product images in a large viewer.",
    parameters: {
      type: "object",
      properties: {
        product_id: param("string", "Product ID to show gallery for"),
        image_index: param("number", "Starting image index (0-based). Defaults to 0."),
      },
      required: ["product_id"],
    },
    ui: { icon: Images, label: "Opening gallery" },
    category: "ui" as const,
    executeClient: async (args, ctx) => {
      const opened = ctx.onGalleryOpen(String(args.product_id), typeof args.image_index === "number" ? args.image_index : 0);
      return opened === false ? { opened: false, error: `Product ${args.product_id} has no available gallery images.` } : { opened: true };
    },
  },

  product_gallery_close: {
    name: "product_gallery_close",
    description: "Close the fullscreen image gallery.",
    parameters: { type: "object", properties: {}, required: [] },
    ui: { icon: X, label: "Closing gallery" },
    category: "ui" as const,
    executeClient: async (_args, ctx) => {
      ctx.onGalleryClose();
      return { closed: true };
    },
  },

  product_gallery_navigate: {
    name: "product_gallery_navigate",
    description: "Navigate to a specific image in the open gallery by index.",
    parameters: {
      type: "object",
      properties: {
        image_index: param("number", "Image index to navigate to (0-based)"),
      },
      required: ["image_index"],
    },
    ui: { icon: Images, label: "Navigating" },
    category: "ui" as const,
    executeClient: async (args, ctx) => {
      ctx.onGalleryNavigate(typeof args.image_index === "number" ? args.image_index : 0);
      return { navigated: true };
    },
  },

  wishlist_add: {
    name: "wishlist_add",
    description: "Add a product to the user's liked list for tracking.",
    parameters: {
      type: "object",
      properties: { product_id: param("string", "Product ID") },
      required: ["product_id"],
    },
    ui: { icon: Heart, label: "Adding to list" },
    category: "memory",
    executeClient: async (args, ctx) => {
      const added = ctx.onAddToWishlist(args.product_id as string);
      return added === false ? { added: false, error: `Product ${args.product_id} not found. Search for products first.` } : { added: true };
    },
  },

  memory_save_fact: {
    name: "memory_save_fact",
    description: "Save a personal fact about the user for future sessions. Ask for confirmation before saving sensitive info.",
    parameters: {
      type: "object",
      properties: {
        text: param("string", "The fact to remember, e.g. 'Shoe size is 42'"),
        category: param("string", "Category: size, allergy, address, taste, brand, date, or other"),
      },
      required: ["text"],
    },
    ui: { icon: Save, label: "Saving" },
    category: "memory",
    executeClient: async (args, ctx) => { ctx.onSaveFact(args.text as string, (args.category as string) ?? "other"); return { saved: true }; },
  },

  memory_forget_all: {
    name: "memory_forget_all",
    description: "Clear conversation context and start fresh. Use when user says 'forget everything' or 'start over'.",
    parameters: { type: "object", properties: {}, required: [] },
    ui: { icon: Brain, label: "Forgetting" },
    category: "memory",
    executeClient: async (_args, ctx) => { ctx.onForget(); return { forgotten: true }; },
  },

  product_clear_highlight: {
    name: "product_clear_highlight",
    description: "Clear all product highlights on the screen. Use when moving to a new topic or when the user dismisses a recommendation.",
    parameters: { type: "object", properties: {}, required: [] },
    ui: { icon: Eraser, label: "Clearing" },
    category: "ui",
    executeClient: async (_args, ctx) => { ctx.onClearHighlight(); return { cleared: true }; },
  },

  product_get_user_highlights: {
    name: "product_get_user_highlights",
    description: "Get the list of product IDs the user has clicked/highlighted on the screen. Use this to understand what the user is interested in before giving advice.",
    parameters: { type: "object", properties: {}, required: [] },
    ui: { icon: Eye, label: "Reading highlights" },
    category: "ui",
    executeClient: async (_args, ctx) => {
      const ids = ctx.onGetUserHighlights();
      return { highlightedByUser: ids, count: ids.length };
    },
  },

  cart_remove: {
    name: "cart_remove",
    description: "Remove a product from the user's cart.",
    parameters: {
      type: "object",
      properties: {
        product_id: param("string", "Product ID to remove from cart"),
      },
      required: ["product_id"],
    },
    ui: { icon: ShoppingCart, label: "Removing" },
    category: "shopping",
    executeClient: async (args, ctx) => { ctx.onRemoveFromCart(args.product_id as string); return { removed: true }; },
  },

  cart_update_quantity: {
    name: "cart_update_quantity",
    description: "Update the quantity of a product in the cart. Set quantity to 0 to remove it.",
    parameters: {
      type: "object",
      properties: {
        product_id: param("string", "Product ID in cart"),
        quantity: param("number", "New quantity (0 to remove)", { minimum: 0, maximum: 99 }),
      },
      required: ["product_id", "quantity"],
    },
    ui: { icon: ShoppingCart, label: "Updating cart" },
    category: "shopping",
    executeClient: async (args, ctx) => {
      ctx.onUpdateCartQuantity(args.product_id as string, args.quantity as number);
      return { updated: true, quantity: args.quantity };
    },
  },

  cart_get_contents: {
    name: "cart_get_contents",
    description: "Read the current contents of the user's cart, including product IDs, names, prices, and quantities. Use before checkout to verify the order.",
    parameters: { type: "object", properties: {}, required: [] },
    ui: { icon: ShoppingCart, label: "Checking cart" },
    category: "shopping",
    executeClient: async (_args, ctx) => {
      const items = ctx.onGetCartContents();
      return { items, count: items.length };
    },
  },

  address_select: {
    name: "address_select",
    description: "Show an address selection panel to the user. The user can pick a saved address, add a new one, or edit existing. Pre-fill fields from conversation context if the user has spoken them. Returns the selected/confirmed address object, or null if cancelled.",
    parameters: {
      type: "object",
      properties: {
        recipient_name: param("string", "Pre-filled recipient name (from conversation)"),
        recipient_phone: param("string", "Pre-filled phone number"),
        street_address: param("string", "Pre-filled street address"),
        city: param("string", "Pre-filled city"),
      },
      required: [],
    },
    ui: { icon: MapPin, label: "Selecting address" },
    category: "shopping",
    executeClient: async (args, ctx) => {
      const prefilled: Record<string, unknown> = {};
      if (args.recipient_name) prefilled.recipientName = args.recipient_name;
      if (args.recipient_phone) prefilled.recipientPhone = args.recipient_phone;
      if (args.street_address) prefilled.streetAddress = args.street_address;
      if (args.city) prefilled.city = args.city;

      const result = await ctx.onShowPanel({
        type: "address-select",
        title: "Delivery Address",
        data: prefilled,
      });
      return { address: result };
    },
  },

  checkout_show_panel: {
    name: "checkout_show_panel",
    description: "Show the create-order form with the cart contents and delivery information fields. Pre-fill fields the user has already provided. The user can review and edit everything before generating the payment link. Returns the complete order draft object, or null if cancelled.",
    parameters: {
      type: "object",
      properties: {
        recipient_name: param("string", "Pre-filled recipient name"),
        recipient_phone: param("string", "Pre-filled recipient phone"),
        street_address: param("string", "Pre-filled delivery address"),
        delivery_city: param("string", "Pre-filled delivery city"),
        delivery_date: param("string", "Pre-filled delivery date (YYYY-MM-DD)"),
        sender_name: param("string", "Pre-filled sender name"),
        gift_message: param("string", "Pre-filled gift message"),
      },
      required: [],
    },
    ui: { icon: Send, label: "Create order" },
    category: "shopping",
    executeClient: async (args, ctx) => {
      const prefilled: Record<string, unknown> = {};
      if (args.recipient_name) prefilled.recipientName = args.recipient_name;
      if (args.recipient_phone) prefilled.recipientPhone = args.recipient_phone;
      if (args.street_address) prefilled.streetAddress = args.street_address;
      if (args.delivery_city) prefilled.deliveryCity = args.delivery_city;
      if (args.delivery_date) prefilled.deliveryDate = args.delivery_date;
      if (args.sender_name) prefilled.senderName = args.sender_name;
      if (args.gift_message) prefilled.giftMessage = args.gift_message;

      const result = await ctx.onShowPanel({
        type: "checkout",
        title: "Create Order",
        data: prefilled,
      });
      return { checkout: result };
    },
  },

  ui_ask_user: {
    name: "ui_ask_user",
    description: "Prompt the user with a multiple-choice question in a modal dialog. Use this when you need a clear decision (e.g. choosing between options, confirming preferences). Faster and more reliable than asking in free text. The response is the selected option string.",
    parameters: {
      type: "object",
      properties: {
        question: param("string", "The question to ask the user"),
        options: param("array", "2-5 answer choices", {
          items: { type: "string" },
          minItems: 2,
          maxItems: 5,
        }),
      },
      required: ["question", "options"],
    },
    ui: { icon: MessageCircleQuestion, label: "Asking" },
    category: "ui",
    executeClient: async (args, ctx) => {
      const question = args.question as string;
      const options = args.options as string[];
      const answer = await ctx.onAskUser(question, options);
      return { question, selectedAnswer: answer };
    },
  },

  // ── Layout & panel-management tools (Phase 5) ───────────────────────────
  // These let the agent curate the layout (open/close/focus/minimize) and drive
  // panel forms with validated fills. Destructive actions (place order, pay)
  // are gated — the agent can pre-fill but only the user can confirm them.

  panel_open: {
    name: "panel_open",
    description: "Open a panel by type. Only the listed types are valid — any other value will be rejected. For single-instance types (checkout, address-select), reuses an already-open panel instead of duplicating. Optionally pre-fills data.",
    parameters: {
      type: "object",
      properties: {
        type: param("string", "Panel type", { enum: ["products", "conversation", "cart", "product-detail", "sessions", "orders", "address-book", "memories", "address-select", "address-form", "checkout", "wishlist", "delivery-info", "order-tracking"] }),
        data: param("object", "Optional panel data to pre-fill or display"),
      },
      required: ["type"],
    },
    ui: { icon: Plus, label: "Opening panel" },
    category: "ui",
    executeClient: async (args, ctx) => {
      const result = ctx.onOpenPanel(args.type as string, args.data as Record<string, unknown> | undefined);
      return result;
    },
  },

  panel_close: {
    name: "panel_close",
    description: "Close a panel by id or type. Dynamic panels (checkout, address-select) resolve their promise with null. Use this to clear panels no longer needed.",
    parameters: {
      type: "object",
      properties: {
        id: param("string", "Panel id or type (e.g. 'checkout' or the uuid from panel_open)"),
      },
      required: ["id"],
    },
    ui: { icon: X, label: "Closing panel" },
    category: "ui",
    executeClient: async (args, ctx) => { ctx.onClosePanel(args.id as string); return { closed: true }; },
  },

  panel_focus: {
    name: "panel_focus",
    description: "Bring a panel to the front (active tab on mobile, prioritized recency on desktop). Use to direct the user's attention. Does not open a closed panel — use panel_open for that.",
    parameters: {
      type: "object",
      properties: { id: param("string", "Panel id or type") },
      required: ["id"],
    },
    ui: { icon: Eye, label: "Focusing panel" },
    category: "ui",
    executeClient: async (args, ctx) => { ctx.onFocusPanel(args.id as string); return { focused: true }; },
  },

  panel_minimize: {
    name: "panel_minimize",
    description: "Collapse a panel into the dock (desktop) without closing it. State is preserved. No-op on mobile (panels are tabs there).",
    parameters: {
      type: "object",
      properties: { id: param("string", "Panel id or type") },
      required: ["id"],
    },
    ui: { icon: X, label: "Minimizing panel" },
    category: "ui",
    executeClient: async (args, ctx) => { ctx.onMinimizePanel(args.id as string); return { minimized: true }; },
  },

  panel_fill_field: {
    name: "panel_fill_field",
    description: "Fill a single form field in a panel (e.g. recipientName in checkout). The value is VALIDATED against the field's rules before being written — invalid writes are rejected with an error. Use this to silently fill details as the user speaks them, then confirm in your response. Both agent and user edits go through the same validation.",
    parameters: {
      type: "object",
      properties: {
        panelId: param("string", "Panel id or type (e.g. 'checkout')"),
        key: param("string", "Field key (e.g. 'recipientName', 'deliveryCity', 'deliveryDate')"),
        value: param("string", "The value to write"),
      },
      required: ["panelId", "key", "value"],
    },
    ui: { icon: Save, label: "Filling field" },
    category: "ui",
    executeClient: async (args, ctx) => {
      return ctx.onFillPanelField(args.panelId as string, args.key as string, args.value);
    },
  },

  panel_click_action: {
    name: "panel_click_action",
    description: "Invoke a named, NON-DESTRUCTIVE action registered by a panel (e.g. 'select-saved-address' in checkout). Destructive actions (place order, pay) are NOT available here — those require the user to press the confirm button. The available actions for each panel type are listed in the panel inventory provided in your context.",
    parameters: {
      type: "object",
      properties: {
        panelId: param("string", "Panel id or type"),
        action: param("string", "Action name (e.g. 'select-saved-address')"),
        args: param("array", "Optional arguments for the action", { items: {} }),
      },
      required: ["panelId", "action"],
    },
    ui: { icon: Send, label: "Panel action" },
    category: "ui",
    executeClient: async (args, ctx) => {
      return ctx.onClickPanelAction(args.panelId as string, args.action as string, args.args as unknown[] | undefined);
    },
  },

  panel_verify: {
    name: "panel_verify",
    description: "Validate a panel's form completeness and field validity. Returns missing required fields and invalid values. ALWAYS call this before destructive steps (e.g. before order_create, verify the checkout panel) — never blindly proceed if it reports missing or invalid fields.",
    parameters: {
      type: "object",
      properties: { panelId: param("string", "Panel id or type") },
      required: ["panelId"],
    },
    ui: { icon: Brain, label: "Verifying panel" },
    category: "ui",
    executeClient: async (args, ctx) => {
      return ctx.onVerifyPanel(args.panelId as string);
    },
  },

  product_list_categories: {
    name: "product_list_categories",
    description: "List the product categories available in Kapruka's catalog to help target your search.",
    parameters: {
      type: "object",
      properties: {
        depth: param("number", "Nesting depth (1 or 2, default 1)", { default: 1 }),
      },
      required: [],
    },
    ui: { icon: List, label: "Listing categories" },
    category: "shopping",
    executeClient: async (args) => {
      const depth = args.depth ?? 1;
      const data = await fetchJson(`/api/categories?depth=${depth}`, {}, "List categories");
      return { categories: data.categories };
    },
  },

  delivery_list_cities: {
    name: "delivery_list_cities",
    description: "Search for valid deliverable city names in Sri Lanka matching a query to ensure accurate shipping details.",
    parameters: {
      type: "object",
      properties: {
        query: param("string", "Query string to search for cities (e.g. 'Colombo')"),
        limit: param("number", "Limit results (default 15, max 50)", { default: 15 }),
      },
      required: ["query"],
    },
    ui: { icon: MapPin, label: "Searching cities" },
    category: "shopping",
    executeClient: async (args) => {
      const limit = args.limit ?? 15;
      const data = await fetchJson(`/api/delivery-cities?q=${encodeURIComponent(args.query as string)}&limit=${limit}`, {}, "List delivery cities");
      return { cities: data.cities };
    },
  },

  order_list: {
    name: "order_list",
    description: "List all known orders from the user's order history cache. Returns order numbers, statuses, amounts, and delivery dates. Use this before tracking or when the user asks about their orders.",
    parameters: { type: "object", properties: {}, required: [] },
    ui: { icon: Package, label: "Listing orders" },
    category: "shopping",
    executeClient: async (_args, ctx) => {
      const records = ctx.onGetOrderRecords();
      return { orders: records.map(r => ({ orderNumber: r.orderNumber, status: r.status, statusDisplay: r.statusDisplay, amount: r.amount, deliveryDate: r.deliveryDate })) };
    },
  },

  address_list: {
    name: "address_list",
    description: "List all saved delivery addresses for the user. Returns label, recipient, phone, address, city, and default flag.",
    parameters: { type: "object", properties: {}, required: [] },
    ui: { icon: MapPin, label: "Listing addresses" },
    category: "shopping",
    executeClient: async (_args, ctx) => {
      const addresses = ctx.onListAddresses();
      return { addresses };
    },
  },

  address_add: {
    name: "address_add",
    description: "Save a new delivery address to the user's address book.",
    parameters: {
      type: "object",
      properties: {
        label: param("string", "Short label (e.g. Home, Office)"),
        recipient_name: param("string", "Recipient's full name"),
        recipient_phone: param("string", "Recipient's phone number"),
        street_address: param("string", "Street address"),
        city: param("string", "Delivery city"),
        notes: param("string", "Delivery notes (gate code, landmarks, etc.)"),
      },
      required: ["label", "recipient_name", "street_address", "city"],
    },
    ui: { icon: MapPin, label: "Adding address" },
    category: "shopping",
    executeClient: async (args, ctx) => {
      const id = ctx.onAddAddress({
        label: args.label as string,
        recipientName: args.recipient_name as string,
        recipientPhone: (args.recipient_phone as string) ?? "",
        streetAddress: args.street_address as string,
        city: args.city as string,
        notes: (args.notes as string) ?? undefined,
      });
      return { added: true, id };
    },
  },

  address_remove: {
    name: "address_remove",
    description: "Remove a saved address from the address book by ID.",
    parameters: {
      type: "object",
      properties: { address_id: param("string", "Address ID to remove") },
      required: ["address_id"],
    },
    ui: { icon: MapPin, label: "Removing address" },
    category: "shopping",
    executeClient: async (args, ctx) => {
      ctx.onRemoveAddress(args.address_id as string);
      return { removed: true };
    },
  },

  address_set_default: {
    name: "address_set_default",
    description: "Set a saved address as the default delivery target.",
    parameters: {
      type: "object",
      properties: { address_id: param("string", "Address ID to set as default") },
      required: ["address_id"],
    },
    ui: { icon: MapPin, label: "Setting default" },
    category: "shopping",
    executeClient: async (args, ctx) => {
      ctx.onSetDefaultAddress(args.address_id as string);
      return { set: true };
    },
  },
};

// ── Derived Exports ───────────────────────────────────────────────────────────

export const ALL_TOOLS = Object.values(TOOLS);

export const UI_ONLY_TOOLS = new Set(
  ALL_TOOLS.filter(t => t.category === "ui").map(t => t.name),
);

// ── Adapter Functions ─────────────────────────────────────────────────────────

/** Tools that cannot run in text mode (they need a live client round-trip the
 *  streaming chat cannot provide). ui_ask_user -> LLM asks in plain text instead. */
const TEXT_MODE_EXCLUDED = new Set(["ui_ask_user"]);

/**
 * Schemas-only tool definitions for text mode. NO `execute` -- the server is a
 * thin stream proxy; the CLIENT executes tools (same path as live mode). This
 * is what collapses text + live onto one execution engine.
 */
export function getTextModeToolSchemas(): LlmTool[] {
  return Object.values(TOOLS)
    .filter(tool => !TEXT_MODE_EXCLUDED.has(tool.name))
    .map(tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters }));
}

/**
 * Get tool definitions formatted for Gemini Live API function declarations.
 * Strips internal fields and keeps only Gemini-compatible schema.
 */
export function getLiveModeDeclarations(): Array<{
  name: string;
  description: string;
  parameters: { type: string; properties: Record<string, unknown>; required: string[] };
}> {
  return ALL_TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

/**
 * Execute a tool call on the client side (live mode).
 * Returns the response to send back to Gemini.
 */
export async function executeClientTool(
  call: { id: string; name: string; args: Record<string, unknown> },
  ctx: ClientToolContext,
): Promise<{ id: string; name: string; response: Record<string, unknown> }> {
  const tool = TOOLS[call.name];
  if (!tool?.executeClient) {
    return { id: call.id, name: call.name, response: { error: `Unknown tool: ${call.name}` } };
  }
  try {
    const response = await tool.executeClient(call.args, ctx);
    return { id: call.id, name: call.name, response };
  } catch (error) {
    return {
      id: call.id,
      name: call.name,
      response: { error: error instanceof Error ? error.message : "Tool execution failed" },
    };
  }
}

/** UI metadata map for tool call display in conversation */
export const toolUiConfig: Record<string, { icon: typeof Search; label: string }> = Object.fromEntries(
  ALL_TOOLS.map(t => [t.name, t.ui]),
);

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS[name];
}

export function getToolNames(): string[] {
  return ALL_TOOLS.map(t => t.name);
}

// ── Tool summary (shared by text + live modes for unified logging) ────────────

/** Produce a one-line human-readable summary of what a tool call did, plus an
 *  optional detail string for the debug panel. Shared by text and live modes
 *  so the debug log is consistent regardless of which agent drove the action. */
export function summarizeToolCall(
  name: string,
  args: Record<string, unknown>,
  response: Record<string, unknown>,
): { summary: string; detail?: string } {
  const ok = response.error == null;
  switch (name) {
    case "datetime_now":
      return {
        summary: "Checked current date/time",
        detail:
          typeof response.requested === "object" && response.requested
            ? `${(response.requested as { date?: string; time?: string; timeZone?: string }).date ?? ""} ${(response.requested as { date?: string; time?: string; timeZone?: string }).time ?? ""} ${(response.requested as { date?: string; time?: string; timeZone?: string }).timeZone ?? ""}`.trim()
            : undefined,
      };
    case "product_search":
      return { summary: `Searched "${args.q ?? ""}"`, detail: `${response.count ?? (Array.isArray(response.products) ? response.products.length : 0)} results` };
    case "product_get_details": {
      const p = response.product as { id?: string } | undefined;
      return { summary: p ? `Loaded product ${p.id ?? ""}`.trim() : "Product not found" };
    }
    case "cart_add": {
      const q = args.quantity ?? 1;
      return { summary: ok && response.added !== false ? `Added to cart ×${q}` : "Cart add failed", detail: `product ${args.product_id}` };
    }
    case "cart_remove":
      return { summary: "Removed from cart", detail: `product ${args.product_id}` };
    case "cart_update_quantity":
      return { summary: `Set quantity to ${args.quantity ?? 0}`, detail: `product ${args.product_id}` };
    case "cart_get_contents":
      return { summary: `Read cart (${response.count ?? 0} items)` };
    case "delivery_check":
      return { summary: response.available === false ? "Delivery unavailable" : "Delivery available", detail: `${response.city ?? args.city}` };
    case "order_create":
      return { summary: ok ? "Order created" : "Order creation failed", detail: response.orderNumber ? `order ${response.orderNumber}` : undefined };
    case "order_track":
      return { summary: ok ? `Tracked: ${response.statusDisplay ?? response.status ?? "order"}` : "Tracking failed", detail: `${args.order_number}` };
    case "web_search":
      return { summary: `Web search "${args.query ?? ""}"`, detail: `${Array.isArray(response.results) ? response.results.length : 0} results` };
    case "web_fetch_url":
      return { summary: "Fetched page", detail: `${args.url}` };
    case "product_highlight":
      return { summary: `Highlighted ${Array.isArray(args.items) ? args.items.length : 0}` };
    case "product_clear_highlight":
      return { summary: "Cleared highlights" };
    case "product_open_detail":
      return { summary: "Opened details", detail: `product ${args.product_id}` };
    case "product_close_detail":
      return { summary: "Closed details" };
    case "product_scroll_to":
      return { summary: "Scrolled to product", detail: `${args.product_id}` };
    case "product_gallery_open":
      return { summary: "Opened gallery", detail: `product ${args.product_id}` };
    case "product_gallery_close":
      return { summary: "Closed gallery" };
    case "product_gallery_navigate":
      return { summary: `Image ${args.image_index}` };
    case "wishlist_add":
      return { summary: "Added to Liked", detail: `product ${args.product_id}` };
    case "memory_save_fact":
      return { summary: "Saved a fact", detail: `${args.text}` };
    case "memory_forget_all":
      return { summary: "Forgot everything" };
    case "product_get_user_highlights":
      return { summary: `Read highlights (${response.count ?? 0})` };
    case "ui_ask_user":
      return { summary: response.selectedAnswer ? `Asked → "${response.selectedAnswer}"` : "Asked a question" };
    case "panel_open":
      return { summary: `Opened ${args.type as string}`, detail: response.id as string };
    case "panel_close":
      return { summary: `Closed panel`, detail: `${args.id}` };
    case "panel_focus":
      return { summary: `Focused panel`, detail: `${args.id}` };
    case "panel_minimize":
      return { summary: `Minimized panel`, detail: `${args.id}` };
    case "panel_fill_field":
      return { summary: ok ? `Filled ${args.key}` : `Fill failed: ${args.key}`, detail: `${args.panelId}` };
    case "panel_click_action":
      return { summary: ok ? `Action: ${args.action}` : `Action failed: ${args.action}`, detail: `${args.panelId}` };
    case "panel_verify":
      return { summary: ok ? "Panel valid" : `Panel invalid (${Array.isArray(response.missing) ? response.missing.length : 0} missing)`, detail: `${args.panelId}` };
    case "product_list_categories":
      return { summary: `Listed categories`, detail: `${Array.isArray(response.categories) ? response.categories.length : 0} categories` };
    case "delivery_list_cities":
      return { summary: `Searched cities "${args.query ?? ""}"`, detail: `${Array.isArray(response.cities) ? response.cities.length : 0} matches` };
    case "order_list":
      return { summary: `Listed ${Array.isArray(response.orders) ? response.orders.length : 0} orders` };
    case "address_list":
      return { summary: `Listed ${Array.isArray(response.addresses) ? response.addresses.length : 0} addresses` };
    case "address_add":
      return { summary: ok ? `Saved address ${args.label ?? ""}` : "Save failed" };
    case "address_remove":
      return { summary: "Removed address" };
    case "address_set_default":
      return { summary: "Set default address" };
    default:
      return { summary: response.error ? `${name} failed` : name };
  }
}
