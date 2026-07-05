import { z } from "zod";
import { callMcpTool } from "$lib/server/mcp";
import { normalizeTracking } from "$lib/shopping-engine";
import { isAllowedOrigin, originErrorResponse } from "$lib/server/origin-guard";
import type { RequestHandler } from "./$types";

const trackOrderSchema = z.object({
  order_number: z.string().min(4).max(40),
});

export const POST: RequestHandler = async ({ request }) => {
  try {
    if (!isAllowedOrigin(request)) return originErrorResponse();
    const parsed = trackOrderSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid order number" }, { status: 400 });
    const orderNumber = parsed.data.order_number.trim();

    const raw = await callMcpTool("kapruka_track_order", { order_number: orderNumber });
    const normalized = normalizeTracking(raw);
    if (!normalized.ok) return Response.json({ error: normalized.error.message }, { status: 502 });
    return Response.json(normalized.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Order tracking failed";
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    return Response.json({ error: message }, { status: 500 });
  }
};
