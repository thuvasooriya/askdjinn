import { z } from "zod";
import { callMcpTool } from "$lib/server/mcp";
import { normalizeDeliveryCheck, validateDeliveryCheckRequest } from "$lib/shopping-engine";
import { isAllowedOrigin, originErrorResponse } from "$lib/server/origin-guard";
import type { RequestHandler } from "./$types";

const checkDeliverySchema = z.object({
  city: z.string().min(2).max(100),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  product_id: z.string().min(3).max(80).nullable().optional(),
});

export const POST: RequestHandler = async ({ request }) => {
  try {
    if (!isAllowedOrigin(request)) return originErrorResponse();
    const parsed = checkDeliverySchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid delivery check" }, { status: 400 });

    const body = parsed.data;
    const validated = validateDeliveryCheckRequest({ city: body.city, deliveryDate: body.delivery_date ?? undefined, productId: body.product_id ?? undefined });
    if (!validated.ok) return Response.json({ error: validated.error.message }, { status: 400 });

    const raw = await callMcpTool("kapruka_check_delivery", {
      city: body.city,
      delivery_date: body.delivery_date,
      product_id: body.product_id ?? null,
    });
    const normalized = normalizeDeliveryCheck(raw);
    if (!normalized.ok) return Response.json({ error: normalized.error.message }, { status: 502 });

    return Response.json(normalized.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delivery check failed";
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    return Response.json({ error: message }, { status: 500 });
  }
};
