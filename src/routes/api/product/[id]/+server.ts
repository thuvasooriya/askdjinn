import { callMcpTool } from "$lib/server/mcp";
import { normalizeProductDetail } from "$lib/shopping-engine";
import { checkRateLimit } from "$lib/server/rate-limiter";
import { isAllowedOrigin, originErrorResponse } from "$lib/server/origin-guard";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, request }) => {
  try {
    if (!isAllowedOrigin(request)) return originErrorResponse();
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";
    if (!(await checkRateLimit(ip, 60, 60_000))) {
      return Response.json({ error: "Too many requests." }, { status: 429 });
    }

    const productId = decodeURIComponent(params.id);
    if (!productId) return Response.json({ error: "Product ID is required" }, { status: 400 });

    const raw = await callMcpTool("kapruka_get_product", { product_id: productId });
    if (typeof raw === "object" && raw !== null) {
      console.log("[djinn] kapruka_get_product raw:", JSON.stringify(raw, null, 2));
    }
    const normalized = normalizeProductDetail(raw);
    return Response.json(normalized.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Product lookup failed";
    return Response.json({ error: message, product: null }, { status: 500 });
  }
};
