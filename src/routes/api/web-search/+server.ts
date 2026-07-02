import { z } from "zod";
import { webSearch, formatSearchResults } from "$lib/server/web-tools";
import { checkRateLimit } from "$lib/server/rate-limiter";
import { isAllowedOrigin, originErrorResponse } from "$lib/server/origin-guard";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  try {
    if (!isAllowedOrigin(request)) return originErrorResponse();
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";
    if (!(await checkRateLimit(ip, 30, 60_000))) {
      return Response.json({ error: "Too many requests." }, { status: 429 });
    }

    const bodySchema = z.object({ query: z.string().min(1).max(500) });
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Invalid request body" }, { status: 400 });
    const { query } = parsed.data;

    const results = await webSearch(query.trim());
    return Response.json({ query, results, formatted: formatSearchResults(query, results) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Web search failed";
    const status = message.includes("not configured") ? 503 : 500;
    return Response.json({ error: message }, { status });
  }
};
