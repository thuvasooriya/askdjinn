import { ShoppingValidationError } from "./errors";
import type { Product, ShoppingResult } from "./types";

/** Search request independent of any MCP or LLM provider. */
export interface ProductSearchQuery {
  q: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  sort?: "relevance" | "price_asc" | "price_desc" | "newest" | "bestseller";
  limit?: number;
  cursor?: string;
  currency?: string;
}

/** Validate and normalize a product search query. */
export function normalizeSearchQuery(query: ProductSearchQuery): ShoppingResult<ProductSearchQuery> {
  if (!query.q.trim() && !query.category?.trim()) return fail("Search query or category is required");
  if (query.minPrice != null && query.minPrice < 0) return fail("Minimum price cannot be negative");
  if (query.maxPrice != null && query.maxPrice < 0) return fail("Maximum price cannot be negative");
  if (query.minPrice != null && query.maxPrice != null && query.minPrice > query.maxPrice) return fail("Minimum price cannot exceed maximum price");
  return ok({ ...query, q: query.q.trim(), limit: clamp(query.limit ?? 8, 1, 12), currency: query.currency ?? "LKR", inStockOnly: query.inStockOnly ?? true, sort: query.sort ?? "relevance" });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function ok<T>(data: T): ShoppingResult<T> {
  return { ok: true, data };
}

function fail<T>(message: string): ShoppingResult<T> {
  return { ok: false, error: new ShoppingValidationError(message) };
}
