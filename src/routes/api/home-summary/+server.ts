import { z } from "zod";
import { getLlmProvider } from "$lib/server/llm";
import { checkRateLimit } from "$lib/server/rate-limiter";
import { isAllowedOrigin, originErrorResponse } from "$lib/server/origin-guard";
import type { RequestHandler } from "./$types";

const homeSummarySchema = z.object({
  liked: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price: z.number().optional().nullable(),
    currency: z.string(),
    inStock: z.boolean().optional().nullable(),
  })),
  watch: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price: z.number().optional().nullable(),
    currency: z.string(),
    inStock: z.boolean().optional().nullable(),
    targetPrice: z.number().optional().nullable(),
  })),
  orderHistory: z.array(z.string()),
  preferences: z.array(z.object({
    label: z.string(),
    value: z.string(),
    category: z.string(),
  })),
  city: z.string().optional().nullable(),
});

export const POST: RequestHandler = async ({ request }) => {
  try {
    if (!isAllowedOrigin(request)) return originErrorResponse();
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";
    if (!(await checkRateLimit(ip, 20, 60_000))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    const jsonBody: unknown = await request.json();
    const parsed = homeSummarySchema.safeParse(jsonBody);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request body" }, { status: 400 });
    }

    const body = parsed.data;
    // Helper agent always uses cerebras/gemma-4-31b — NOT the user's chat
    // provider. This is a background task, not a user-driven chat.
    const llm = getLlmProvider("cerebras", "gemma-4-31b");

    const prompt = `You are a helpful personal shopping assistant.
Given the user's shopping context, write a very short, friendly, conversational daily summary update (maximum 2-3 sentences).
Highlight if liked items are in stock, any order numbers they are tracking, or recommendations based on their delivery city.
- Formatting: you may use **bold** for key terms only (product names, order IDs, prices, cities). No headers, no links, no images, no bullet/numbered lists, no code blocks. Keep it 2-3 warm, natural sentences.

Here is the user's context:
- Delivery City: ${body.city ?? "Not specified"}
- Liked Items: ${JSON.stringify(body.liked)}
- Watched Items (price/stock alerts): ${JSON.stringify(body.watch)}
- Order History (IDs): ${JSON.stringify(body.orderHistory)}
- Saved Facts / Preferences: ${JSON.stringify(body.preferences)}
`;

    const response = await llm.chat([{ role: "user", content: prompt }]);
    if (!response.ok) {
      throw new Error(response.error.message);
    }

    return Response.json({
      summary: response.content.trim(),
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    // Sanitized error — never expose env var names or internal details to client
    return Response.json({ error: "Summary temporarily unavailable", summary: "" }, { status: 500 });
  }
};
