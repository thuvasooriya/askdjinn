/**
 * Cart store using Svelte 5 runes.
 * Uses unified persistence layer.
 */

import type { CartItem, Product } from "$lib/shopping-engine";
import * as persist from "$lib/stores/persistence";

const STORE_ID = "cart";
const AUTO_PURCHASE_STORE_ID = "auto-purchase";
const VERSION = 1;
const DELIVERY_ESTIMATE_STORE_ID = "delivery-estimate";

export type DeliveryEstimate = { city: string; rate: number; currency: string; estimatedDate?: string };

const AUTO_PURCHASE_HARD_LIMIT = 10_000;

type AutoPurchaseSettings = { enabled: boolean; limit: number };

const defaultAutoPurchase: AutoPurchaseSettings = {
  enabled: false,
  limit: AUTO_PURCHASE_HARD_LIMIT,
};

function addCartItem(list: CartItem[], product: Product): CartItem[] {
  const existing = list.find((item) => item.product.id === product.id);
  if (existing) return list.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
  return [...list, { product, quantity: 1, addedAt: Date.now(), watchPrice: product.price }];
}

function removeCartItem(list: CartItem[], productId: string): CartItem[] {
  return list.filter((item) => item.product.id !== productId);
}

function updateCartQuantity(list: CartItem[], productId: string, quantity: number): CartItem[] {
  if (quantity <= 0) return removeCartItem(list, productId);
  return list.map((item) => (item.product.id === productId ? { ...item, quantity } : item));
}

function cartSubtotal(list: CartItem[]): number {
  const sum = list.reduce((total, item) => total + (item.product.price ?? 0) * item.quantity, 0);
  return Math.round(sum * 100) / 100;
}

function cartCount(list: CartItem[]): number {
  return list.reduce((total, item) => total + item.quantity, 0);
}

function normalizeAutoPurchase(value: Partial<AutoPurchaseSettings>): AutoPurchaseSettings {
  const limit = typeof value.limit === "number" && Number.isFinite(value.limit) ? value.limit : defaultAutoPurchase.limit;
  return { enabled: Boolean(value.enabled), limit: Math.max(0, Math.min(AUTO_PURCHASE_HARD_LIMIT, limit)) };
}

function normalizeCartItem(value: unknown, fallbackAddedAt: number): CartItem | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<CartItem>;
  if (!item.product || typeof item.product !== "object" || !item.product.id || !item.product.name) return undefined;

  const rawProduct = item.product as unknown as Record<string, unknown>;
  const price = typeof rawProduct.price === "number" && Number.isFinite(rawProduct.price) ? rawProduct.price : undefined;
  const currency = typeof rawProduct.currency === "string" ? rawProduct.currency : "LKR";
  const product: Product = {
    id: String(rawProduct.id),
    name: String(rawProduct.name),
    price,
    currency,
    imageUrl: typeof rawProduct.imageUrl === "string" ? rawProduct.imageUrl : undefined,
    productUrl: typeof rawProduct.productUrl === "string" ? rawProduct.productUrl : (typeof rawProduct.url === "string" ? rawProduct.url : undefined),
  };

  const quantity = typeof item.quantity === "number" && item.quantity > 0 ? Math.floor(item.quantity) : 1;
  const addedAt = typeof item.addedAt === "number" && Number.isFinite(item.addedAt) ? item.addedAt : fallbackAddedAt;
  const watchPrice = typeof item.watchPrice === "number" && Number.isFinite(item.watchPrice) ? item.watchPrice : price;
  return { product, quantity, addedAt, watchPrice };
}

function loadCart(): CartItem[] {
  const raw = persist.load<unknown[]>(STORE_ID, VERSION, []);
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  return raw
    .map((item, index) => normalizeCartItem(item, now + index))
    .filter((item): item is CartItem => Boolean(item));
}

function loadAutoPurchase(): AutoPurchaseSettings {
  const raw = persist.load<Partial<AutoPurchaseSettings>>(AUTO_PURCHASE_STORE_ID, VERSION, {});
  return normalizeAutoPurchase(raw);
}

function loadDeliveryEstimate(): DeliveryEstimate | null {
  return persist.load<DeliveryEstimate | null>(DELIVERY_ESTIMATE_STORE_ID, VERSION, null);
}

class CartStore {
  items = $state<CartItem[]>([]);
  autoPurchase = $state<AutoPurchaseSettings>(defaultAutoPurchase);
  /** Bumped on every successful add so the UI can animate (badge bump +
   *  fly-to-cart) regardless of who initiated the add -- user click, text
   *  agent tool call, or live agent tool call. */
  pulse = $state(0);
  lastAddedId = $state<string | null>(null);
  deliveryEstimate = $state<DeliveryEstimate | null>(null);

  constructor() {
    if (typeof window !== "undefined") {
      this.items = loadCart();
      this.autoPurchase = loadAutoPurchase();
      this.deliveryEstimate = loadDeliveryEstimate();
    }
  }

  get subtotal() { return cartSubtotal(this.items); }
  get count() { return cartCount(this.items); }
  get autoPurchaseEnabled() { return this.autoPurchase.enabled; }
  get autoPurchaseLimit() { return this.autoPurchase.limit; }
  get grandTotal() { return this.subtotal + (this.deliveryEstimate?.rate ?? 0); }
  private commit() {
    persist.save(STORE_ID, VERSION, this.items);
    persist.save(AUTO_PURCHASE_STORE_ID, VERSION, this.autoPurchase);
    persist.save(DELIVERY_ESTIMATE_STORE_ID, VERSION, this.deliveryEstimate);
  }

  addItem(product: Product, quantity = 1) {
    for (let i = 0; i < quantity; i++) {
      this.items = addCartItem(this.items, product);
    }
    this.lastAddedId = product.id;
    this.pulse++;
    this.commit();
  }
  removeItem(productId: string) { this.items = removeCartItem(this.items, String(productId)); this.commit(); }
  updateQuantity(productId: string, quantity: number) { this.items = updateCartQuantity(this.items, String(productId), quantity); this.commit(); }
  updateAutoPurchase(next: Partial<AutoPurchaseSettings>) { this.autoPurchase = normalizeAutoPurchase({ ...this.autoPurchase, ...next }); this.commit(); }
  clear() { this.items = []; this.deliveryEstimate = null; this.commit(); }

  setDeliveryEstimate(estimate: DeliveryEstimate | null) {
    this.deliveryEstimate = estimate;
    this.commit();
  }
}

const cartInstance = new CartStore();

export function useCart() {
  return cartInstance;
}
