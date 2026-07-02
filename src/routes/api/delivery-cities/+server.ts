import { callMcpTool } from "$lib/server/mcp";
import { extractData } from "$lib/shopping-engine";
import { checkRateLimit } from "$lib/server/rate-limiter";
import { isAllowedOrigin, originErrorResponse } from "$lib/server/origin-guard";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ request, url }) => {
  if (!isAllowedOrigin(request)) return originErrorResponse();
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";
  if (!(await checkRateLimit(ip, 30, 60_000))) {
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }

  const query = url.searchParams.get("q")?.trim() || null;
  const limit = Number(url.searchParams.get("limit") ?? 10);

  try {
    const raw = await callMcpTool("kapruka_list_delivery_cities", {
      query,
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 10,
    });
    const extracted = extractData(raw);
    if (!extracted.ok) return Response.json({ error: extracted.error.message, cities: [] }, { status: 502 });
    const data = extracted.data as { cities?: unknown[] };
    return Response.json({ cities: Array.isArray(data.cities) ? data.cities : [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load delivery cities";
    return Response.json({ error: message, cities: [] }, { status: 500 });
  }
};
