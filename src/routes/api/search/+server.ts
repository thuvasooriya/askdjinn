import { z } from "zod";
import { callMcpTool } from "$lib/server/mcp";
import { normalizeProductSearch } from "$lib/shopping-engine";
import { checkRateLimit } from "$lib/server/rate-limiter";
import { isAllowedOrigin, originErrorResponse } from "$lib/server/origin-guard";
import type { RequestHandler } from "./$types";

const searchSchema = z.object({
  q: z.string().transform(val => val.trim()).refine(val => val.length >= 3, {
    message: "Search query is required and must be at least 3 characters",
  }),
  category: z.string().nullable().optional(),
  minPrice: z.number().min(0, "Minimum price cannot be negative").nullable().optional(),
  maxPrice: z.number().min(0, "Maximum price cannot be negative").nullable().optional(),
  limit: z.number().int().min(1).max(12).default(8),
  inStockOnly: z.boolean().default(true),
  sort: z.enum(["relevance", "price_asc", "price_desc", "newest", "bestseller"]).default("relevance"),
  currency: z.string().default("LKR"),
}).refine(data => {
  if (data.minPrice != null && data.maxPrice != null && data.minPrice > data.maxPrice) return false;
  return true;
}, {
  message: "Minimum price cannot exceed maximum price",
  path: ["minPrice"],
});

export const POST: RequestHandler = async ({ request }) => {
  try {
    if (!isAllowedOrigin(request)) return originErrorResponse();
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";
    if (!(await checkRateLimit(ip, 60, 60_000))) {
      return Response.json({ error: "Too many requests." }, { status: 429 });
    }

    const parsed = searchSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid search" }, { status: 400 });

    const body = parsed.data;
    const raw = await callMcpTool("kapruka_search_products", {
      q: body.q,
      category: body.category ?? null,
      min_price: body.minPrice ?? null,
      max_price: body.maxPrice ?? null,
      in_stock_only: body.inStockOnly,
      sort: body.sort,
      limit: body.limit,
      currency: body.currency,
    });
    const normalized = normalizeProductSearch(raw);
    if (!normalized.ok) return Response.json({ error: normalized.error.message, products: [] }, { status: 502 });
    return Response.json(normalized.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Product search failed";
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    return Response.json({ error: message, products: [] }, { status: 500 });
  }
};
