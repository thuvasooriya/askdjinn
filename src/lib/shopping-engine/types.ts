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

/** Product snapshot used by search, cart, checkout, and tracking features. */
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
  deliveryAvailable?: boolean;
}

/** Catalog category returned by browse or category search. */
export interface Category {
  id: string;
  name: string;
  productCount?: number;
  description?: string;
}

/** Cart item including quantity and optional price watch metadata. */
export interface CartItem {
  product: Product;
  quantity: number;
  addedAt: number;
  watchPrice?: number;
  selectedVariantId?: string;
}

/** Named cart with local business rules and checkout hints. */
export interface Cart {
  id: string;
  name: string;
  items: CartItem[];
  budget?: number;
  autoPurchaseEnabled: boolean;
  autoPurchaseLimit: number;
  deliveryCity?: string;
  deliveryDate?: string;
  createdAt: number;
  updatedAt: number;
}

/** Product watch entry for price and stock monitoring. */
export interface WatchItem {
  productId: string;
  product: Product;
  targetPrice?: number;
  watchStock: boolean;
  cartId: string;
  createdAt: number;
}

/** Multi-cart shopping workspace independent of React and storage. */
export interface ShoppingWorkspace {
  version: 1;
  activeCartId: string;
  carts: Cart[];
  watchlist: WatchItem[];
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

/** Delivery city metadata. */
export interface DeliveryCity {
  name: string;
  aliases?: string[];
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
  rawText?: string;
}

/** Checkout line item sent to an order provider. */
export interface CheckoutItem {
  productId: string;
  quantity: number;
  icingText?: string;
}

/** Recipient details required before creating a checkout. */
export interface CheckoutRecipient {
  name: string;
  phone: string;
}

/** Delivery details required before creating a checkout. */
export interface CheckoutDelivery {
  address: string;
  city: string;
  locationType?: "house" | "apartment" | "office" | "other";
  date: string;
  instructions?: string;
}

/** Sender details required before creating a checkout. */
export interface CheckoutSender {
  name: string;
  anonymous?: boolean;
}

/** Validated checkout draft used before creating a real payment link. */
export interface CheckoutDraft {
  cartId: string;
  cart: CheckoutItem[];
  recipient: CheckoutRecipient;
  delivery: CheckoutDelivery;
  sender: CheckoutSender;
  giftMessage?: string;
  currency?: string;
}

/** Normalized order creation response. */
export interface OrderResult {
  type: "checkout_created";
  orderNumber?: string;
  paymentUrl?: string;
  summary?: { itemsTotal?: number; deliveryFee?: number; grandTotal?: number; currency?: string };
  expiresAt?: string;
  rawText?: string;
}

/** One order tracking timeline step. */
export interface TrackingStep {
  step: string;
  timestamp?: string;
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
  items?: string[];
  amount?: { value: number; currency: string };
  paymentMethod?: string;
  comments?: string;
  greetingMessage?: string;
  specialInstructions?: string;
  pnref?: string;
  recipient?: { name?: string; phone?: string; address?: string; city?: string };
  rawText?: string;
}

/** Sri Lankan occasion metadata used for recommendations. */
export interface Occasion {
  name: string;
  date: string;
  category: "cultural" | "religious" | "family" | "romantic" | "seasonal";
  description: string;
}
