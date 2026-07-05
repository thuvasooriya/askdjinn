// Typed interfaces mirroring the Kapruka MCP JSON schemas exactly.
// Source of truth: https://github.com/kapruka/mcp/blob/main/src/tools/products.py
// The MCP server always returns these exact field names when response_format="json".

export interface KaprukaPrice {
  amount: number | null;
  currency: string;
}

export interface KaprukaCategory {
  id: string;
  name: string;
  slug: string;
  path?: string; // present on product detail, absent on search result items
}

// One item in kapruka_search_products "results" array.
export interface KaprukaSearchItem {
  id: string;
  name: string;
  summary: string;
  price: KaprukaPrice;
  compare_at_price: KaprukaPrice | null;
  in_stock: boolean;
  stock_level: "low" | "medium" | "high";
  image_url: string | null;
  category: KaprukaCategory;
  rating: null;
  ships_internationally: boolean;
  url: string;
}

// Top-level response from kapruka_search_products (json format).
export interface KaprukaSearchResponse {
  results: KaprukaSearchItem[];
  next_cursor: string | null;
  applied_filters: { q: string; limit: number; in_stock_only: boolean };
}

// One variant item from kapruka_get_product "variants" array.
export interface KaprukaVariant {
  id: string;
  name: string;
  sku: string;
  price: KaprukaPrice;
  in_stock: boolean;
  stock_level: "low" | "medium" | "high";
  attributes: Record<string, string>;
}

// Product attributes from kapruka_get_product.
export interface KaprukaProductAttributes {
  type?: string;
  subtype?: string;
  weight?: string;
  vendor?: string;
  [key: string]: string | undefined;
}

// Product shipping info from kapruka_get_product.
export interface KaprukaShipping {
  ships_from: string;
  ships_internationally: boolean;
  restricted_countries: string[];
}

// Top-level response from kapruka_get_product (json format).
export interface KaprukaProduct {
  id: string;
  name: string;
  description: string;
  summary: string;
  price: KaprukaPrice;
  compare_at_price: KaprukaPrice | null;
  in_stock: boolean;
  stock_level: "low" | "medium" | "high";
  category: KaprukaCategory;
  variants: KaprukaVariant[];
  images: string[];
  attributes: KaprukaProductAttributes;
  shipping: KaprukaShipping;
  rating: null;
  url: string;
}

// kapruka_check_delivery JSON response.
export interface KaprukaDeliveryCheck {
  city: string;
  now: string;
  checked_date: string;
  available: boolean;
  rate: number;
  currency: string;
  reason: string | null;
  next_available_date: string | null;
  perishable_warning: string | null;
}

// One city from kapruka_list_delivery_cities.
export interface KaprukaCityItem {
  name: string;
  aliases: string[];
}

// kapruka_list_delivery_cities JSON response.
export interface KaprukaCitiesResponse {
  cities: KaprukaCityItem[];
  total_matched: number;
  showing: number;
}

// One category node from kapruka_list_categories.
export interface KaprukaCategoryNode {
  name: string;
  url: string;
  children?: KaprukaCategoryNode[];
}

// kapruka_list_categories JSON response.
export interface KaprukaCategoriesResponse {
  categories: KaprukaCategoryNode[];
}

// One item in kapruka_track_order.items array.
export interface KaprukaTrackingItem {
  product_id: string;
  name: string;
  quantity: number;
  selling_price: number;
}

// kapruka_track_order JSON response.
export interface KaprukaTrackingResponse {
  order_number: string;
  pnref: string;
  status: string;
  status_display: string;
  order_date: string;
  delivery_date: string;
  shipped_date: string | null;
  amount: string;
  payment_method: string;
  comments: string | null;
  recipient: { name: string; phone: string; address: string; city: string };
  greeting_message: string | null;
  special_instructions: string | null;
  progress: Array<{ step: string; timestamp: string }>;
  live_tracking_available: boolean;
  has_delivery_video: boolean;
  has_delivery_photo: boolean;
  items: KaprukaTrackingItem[];
}

// kapruka_create_order JSON response.
export interface KaprukaOrderResponse {
  checkout_url: string;
  order_ref: string;
  summary: {
    items_total: number;
    delivery_fee: number;
    addons_total: number;
    grand_total: number;
    currency: string;
  };
  expires_at: string;
}
