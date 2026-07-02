import { z } from 'zod';
import { fetchUrlAsMarkdown } from "$lib/server/web-tools";
import { checkRateLimit } from "$lib/server/rate-limiter";
import { isAllowedOrigin, originErrorResponse } from "$lib/server/origin-guard";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  try {
    if (!isAllowedOrigin(request)) return originErrorResponse();
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";
    if (!(await checkRateLimit(ip, 20, 60_000))) {
      return Response.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }
    const bodySchema = z.object({ url: z.string().min(1).max(2000).url() });
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Invalid request body" }, { status: 400 });
    const { url } = parsed.data;

    const result = await fetchUrlAsMarkdown(url.trim());
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fetch failed";
    return Response.json({ error: message }, { status: 500 });
  }
};
