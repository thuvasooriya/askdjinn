import type { ShoppingError } from "./errors";

/** Result type used by shopping operations to avoid uncaught throws. */
export type ShoppingResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ShoppingError };

/** Normalized product variant snapshot from Kapruka or another catalog. */
export interface ProductVariant {
  id: string;
  name: string;
  sku?: string;
  price?: number;
  inStock?: boolean;
  stockLevel?: "low" | "medium" | "high";
  imageUrl?: string;
  attributes?: Record<string, string>;
}

/** Structured product attributes parsed from MCP description and attributes. */
export interface ProductAttributes {
  type?: string;
  subtype?: string;
  weight?: string;
  vendor?: string;
  color?: string;
  flavor?: string;
  occasions?: string;
  [key: string]: string | undefined;
}

/** Product snapshot used by search, cart, create-order, and tracking features. */
export interface Product {
  id: string;
  name: string;
  price?: number;
  compareAtPrice?: number;
  currency: string;
  imageUrl?: string;
  images?: string[];
  productUrl?: string;
  inStock?: boolean;
  stockLabel?: string;
  stockLevel?: "low" | "medium" | "high";
  category?: string;
  categoryId?: string;
  categoryPath?: string;
  summary?: string;
  description?: string;
  /** Agent-injected highlight annotation. NOT from MCP — set by product_highlight tool only. */
  reason?: string;
  rating?: number | null;
  shipsInternationally?: boolean;
  restrictedCountries?: string[];
  variants?: ProductVariant[];
  attributes?: ProductAttributes;
  shipsFrom?: string;
}

/** Catalog category node returned by kapruka_list_categories. */
export interface Category {
  name: string;
  url?: string;
  children?: Category[];
}

/** Cart item including quantity and optional price watch metadata. */
export interface CartItem {
  product: Product;
  quantity: number;
  addedAt: number;
  watchPrice?: number;
  selectedVariantId?: string;
}

/** Normalized product search response. */
export interface ProductSearchResult {
  type: "product_results";
  products: Product[];
  rawText?: string;
}

/** Normalized product detail response. */
export interface ProductDetailResult {
  type: "product_detail";
  product?: Product;
  rawText?: string;
}

/** Delivery availability and pricing response. */
export interface DeliveryCheck {
  type: "delivery_check";
  city?: string;
  deliveryDate?: string;
  available?: boolean;
  rate?: number;
  currency?: string;
  warning?: string;
  estimatedDeliveryTime?: string;
  perishableInstructions?: string;
  cityNote?: string;
  deliveryWindow?: string;
  reason?: string;
  nextAvailableDate?: string;
  perishableWarning?: string;
  rawText?: string;
}

/** Create-order line item sent to an order provider. */
export interface CreateOrderItem {
  productId: string;
  quantity: number;
  icingText?: string;
}

/** Recipient details required before creating an order. */
export interface CreateOrderRecipient {
  name: string;
  phone: string;
}

/** Delivery details required before creating an order. */
export interface CreateOrderDelivery {
  address: string;
  city: string;
  locationType?: "house" | "apartment" | "office" | "other";
  date: string;
  instructions?: string;
}

/** Sender details required before creating an order. */
export interface CreateOrderSender {
  name: string;
  anonymous?: boolean;
}

/** Validated create-order draft used before creating a real payment link. */
export interface CreateOrderDraft {
  cartId: string;
  cart: CreateOrderItem[];
  recipient: CreateOrderRecipient;
  delivery: CreateOrderDelivery;
  sender: CreateOrderSender;
  giftMessage?: string;
  currency?: string;
}

/** Normalized order creation response. */
export interface OrderResult {
  type: "order_created";
  /** Pre-payment order reference returned by Kapruka create_order. */
  orderRef?: string;
  /** Back-compat alias for orderRef in older UI code. Not the post-payment tracking order number. */
  orderNumber?: string;
  paymentUrl?: string;
  summary?: { itemsTotal?: number; deliveryFee?: number; addonsTotal?: number; grandTotal?: number; currency?: string };
  expiresAt?: string;
  rawText?: string;
}

/** One order tracking timeline step. */
export interface TrackingStep {
  step: string;
  timestamp?: string;
}

/** One item in a tracking result. Mirrors KaprukaTrackingItem. */
export interface TrackingItem {
  productId: string;
  name: string;
  quantity: number;
  sellingPrice: number;
}

/** Normalized order tracking response. */
export interface TrackingResult {
  type: "tracking";
  orderNumber?: string;
  status?: string;
  statusDisplay?: string;
  orderDate?: string;
  deliveryDate?: string;
  shippedDate?: string;
  progress?: TrackingStep[];
  hasDeliveryVideo?: boolean;
  hasDeliveryPhoto?: boolean;
  items?: TrackingItem[];
  amount?: { value: number; currency: string };
  paymentMethod?: string;
  comments?: string;
  greetingMessage?: string;
  specialInstructions?: string;
  pnref?: string;
  liveTrackingAvailable?: boolean;
  recipient?: { name?: string; phone?: string; address?: string; city?: string };
  rawText?: string;
}

