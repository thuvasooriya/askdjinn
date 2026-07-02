import { z } from "zod";
import { getLlmProvider } from "$lib/server/llm";
import { checkRateLimit } from "$lib/server/rate-limiter";
import { isAllowedOrigin, originErrorResponse } from "$lib/server/origin-guard";
import type { RequestHandler } from "./$types";
import { SUGGESTION_ICON_KEYS, SUGGESTION_ICON_HINTS, clampIconKey, type SuggestionIconKey } from "$lib/suggestion-icons";

const suggestionsSchema = z.object({
  liked: z.array(z.object({
    name: z.string(),
    price: z.number().optional().nullable(),
    inStock: z.boolean().optional().nullable(),
  })),
  watch: z.array(z.object({
    name: z.string(),
    targetPrice: z.number().optional().nullable(),
  })),
  orderHistory: z.array(z.string()),
  preferredCity: z.string().optional().nullable(),
  recentSearches: z.array(z.string()).optional().default([]),
  savedFacts: z.array(z.string()).optional().default([]),
});

export const POST: RequestHandler = async ({ request }) => {
  try {
    if (!isAllowedOrigin(request)) return originErrorResponse();
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";
    if (!(await checkRateLimit(ip, 10, 60_000))) {
      return Response.json({ error: "Too many requests" }, { status: 429 });
    }

    const parsed = suggestionsSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

    const body = parsed.data;
    // Helper agent: always cerebras/gemma-4-31b
    const llm = getLlmProvider("cerebras", "gemma-4-31b");

    const angles = [
      "price drops / watch-list alerts",
      "tracking or reordering an existing order",
      "gift ideas for an occasion",
      "delivery or city-specific checks",
      "new finds related to liked items",
    ];
    const angle = angles[Math.floor(Math.random() * angles.length)];
    const likedNames = body.liked.map(l => l.name);
    const watchNames = body.watch.map(w => w.name);
    const iconList = SUGGESTION_ICON_KEYS.map(k => `${k} (${SUGGESTION_ICON_HINTS[k]})`).join(", ");

    const prompt = `You are a shopping assistant for Kapruka.com (Sri Lankan gifts, cakes, electronics, delivery).
Generate 3 action cards for the user's home screen. Each must be something they can DO right now.

Return ONLY a JSON array (no markdown fences, no prose) of exactly 3 objects:
{"label": "max 36 chars, starting with an action verb", "query": "the full message to send to the chat agent", "icon": "one of the icon keys below"}

Each card's "icon" MUST be exactly one of these keys, picked to match the card's intent. Never invent or use any other value:
${iconList}

Rules:
- Ground every card in the user's real context below. Never invent products they never interacted with.
- The 3 cards must span DIFFERENT intents (track / search / gift / delivery / watch) -- not three of the same kind.
- Each label starts with an action verb (Track, Find, Check, Gift, Reorder, Watch...).
- If context is thin or empty, use broadly useful Kapruka actions, still varied across intents.
- Vary wording each call; avoid templated phrases.

Lean into this angle for at least one card: ${angle}

User context:
- Liked: ${JSON.stringify(likedNames)}
- Watching (price alerts): ${JSON.stringify(watchNames)}
- Orders tracked: ${JSON.stringify(body.orderHistory)}
- Preferred city: ${body.preferredCity ?? "not set"}
- Recent searches: ${JSON.stringify(body.recentSearches)}
- Known preferences: ${JSON.stringify(body.savedFacts)}`;

    const response = await llm.chat([{ role: "user", content: prompt }], { temperature: 0.85, maxOutputTokens: 300 });
    if (!response.ok) throw new Error("Suggestions failed");

    // Parse the JSON array from the response
    const content = response.content.trim();
    let suggestions: Array<{ label: string; query: string; icon: SuggestionIconKey }> = [];
    try {
      const parsedSuggestions = JSON.parse(content);
      if (Array.isArray(parsedSuggestions)) {
        suggestions = parsedSuggestions
          .filter((s): s is Record<string, unknown> =>
            typeof s?.label === "string" && typeof s?.query === "string")
          .slice(0, 3)
          .map((s) => ({
            // Clamp label length; coerce icon to a known key (defense vs hallucination).
            label: String(s.label).slice(0, 60),
            query: String(s.query),
            icon: clampIconKey(s.icon),
          }));
      }
    } catch {
      // JSON parse fail -> empty; client falls back to static hints.
    }

    return Response.json({ suggestions });
  } catch {
    return Response.json({ error: "Suggestions unavailable", suggestions: [] }, { status: 500 });
  }
};
