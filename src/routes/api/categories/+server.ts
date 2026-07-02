import { callMcpTool } from "$lib/server/mcp";
import { normalizeCategories } from "$lib/shopping-engine";
import { checkRateLimit } from "$lib/server/rate-limiter";
import { isAllowedOrigin, originErrorResponse } from "$lib/server/origin-guard";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ request, url }) => {
  if (!isAllowedOrigin(request)) return originErrorResponse();
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";
  if (!(await checkRateLimit(ip, 30, 60_000))) {
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }

  const depth = Number(url.searchParams.get("depth") ?? 1);

  try {
    const raw = await callMcpTool("kapruka_list_categories", {
      depth: Number.isFinite(depth) ? Math.min(Math.max(depth, 1), 2) : 1,
    });
    const normalized = normalizeCategories(raw);
    if (!normalized.ok) return Response.json({ error: normalized.error.message, categories: [] }, { status: 502 });
    return Response.json({ categories: normalized.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Kapruka categories";
    return Response.json({ error: message, categories: [] }, { status: 500 });
  }
};
