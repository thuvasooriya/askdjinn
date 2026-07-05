import { z } from "zod";
import { callMcpTool } from "$lib/server/mcp";
import { normalizeOrder, validateCreateOrderDraft } from "$lib/shopping-engine";
import type { CreateOrderDraft } from "$lib/shopping-engine";
import { todayISO } from "$lib/dates";
import { checkRateLimit } from "$lib/server/rate-limiter";
import { isAllowedOrigin, originErrorResponse } from "$lib/server/origin-guard";
import type { RequestHandler } from "./$types";

const phoneRegex = /^(?:\+94|0)(?:7\d{8}|\d{9})$/;

const createOrderSchema = z.object({
  cart: z.array(z.object({
    product_id: z.string().min(3).max(80),
    quantity: z.number().int().min(1).max(99).default(1),
    icing_text: z.string().max(120).nullable().optional(),
  })).min(1).max(30),
  recipient: z.object({
    name: z.string().min(1).max(80),
    phone: z.string().min(7).max(30).regex(phoneRegex, "Use a valid Sri Lankan phone number"),
  }),
  delivery: z.object({
    address: z.string().min(3).max(250),
    city: z.string().min(2).max(100),
    location_type: z.enum(["house", "apartment", "office", "other"]).default("house"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    instructions: z.string().max(250).nullable().optional(),
  }),
  sender: z.object({
    name: z.string().min(1).max(80),
    anonymous: z.boolean().default(false),
  }),
  gift_message: z.string().max(300).nullable().optional(),
  currency: z.string().default("LKR"),
});

export const POST: RequestHandler = async ({ request }) => {
  try {
    if (!isAllowedOrigin(request)) return originErrorResponse();
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";
    if (!(await checkRateLimit(ip, 30, 60_000))) {
      return Response.json({ error: "Too many requests." }, { status: 429 });
    }

    const parsed = createOrderSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid order details" }, { status: 400 });
    if (parsed.data.delivery.date < todayISO()) return Response.json({ error: "Delivery date cannot be in the past" }, { status: 400 });

    const body = parsed.data;
    const draft: CreateOrderDraft = {
      cartId: "active",
      cart: body.cart.map((item) => ({ productId: item.product_id, quantity: item.quantity, icingText: item.icing_text ?? undefined })),
      recipient: body.recipient,
      delivery: { address: body.delivery.address, city: body.delivery.city, date: body.delivery.date, locationType: body.delivery.location_type, instructions: body.delivery.instructions ?? undefined },
      sender: body.sender,
      giftMessage: body.gift_message ?? undefined,
      currency: body.currency,
    };
    const validated = validateCreateOrderDraft(draft);
    if (!validated.ok) return Response.json({ error: validated.error.message }, { status: 400 });

    const raw = await callMcpTool("kapruka_create_order", body, 30_000);
    const normalized = normalizeOrder(raw);
    if (!normalized.ok) return Response.json({ error: normalized.error.message }, { status: 502 });

    return Response.json(normalized.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Order creation failed";
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    return Response.json({ error: message }, { status: 500 });
  }
};
