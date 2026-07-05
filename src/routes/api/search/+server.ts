import { z } from "zod";
import { callMcpTool } from "$lib/server/mcp";
import { normalizeProductSearch, normalizeSearchQuery } from "$lib/shopping-engine";
import { checkRateLimit } from "$lib/server/rate-limiter";
import { isAllowedOrigin, originErrorResponse } from "$lib/server/origin-guard";
import type { RequestHandler } from "./$types";

const searchSchema = z.object({
  q: z.string().max(160).optional().default(""),
  category: z.string().nullable().optional(),
  minPrice: z.number().min(0).nullable().optional(),
  maxPrice: z.number().min(0).nullable().optional(),
  limit: z.number().min(1).max(12).optional(),
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

    const query = normalizeSearchQuery({
      q: parsed.data.q,
      category: parsed.data.category ?? undefined,
      minPrice: parsed.data.minPrice ?? undefined,
      maxPrice: parsed.data.maxPrice ?? undefined,
      limit: parsed.data.limit,
    });
    if (!query.ok) return Response.json({ error: query.error.message }, { status: 400 });

    const raw = await callMcpTool("kapruka_search_products", {
      q: query.data.q || (query.data.category ?? ""),
      category: query.data.category ?? null,
      min_price: query.data.minPrice ?? null,
      max_price: query.data.maxPrice ?? null,
      in_stock_only: query.data.inStockOnly,
      sort: query.data.sort,
      limit: Math.max(query.data.limit ?? 8, 4),
      currency: query.data.currency,
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
