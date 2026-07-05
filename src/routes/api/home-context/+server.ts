// Unified home-screen context endpoint.
//
// Replaces the former /api/home-greeting, /api/home-summary, and
// /api/home-suggestions routes. One Cerebras/Gemma call produces greeting +
// summary + suggestions together, so we send one set of system instructions
// and pay one round-trip instead of three.
//
// Caching: the summary + suggestions are cached server-side keyed by a stable
// hash of the context (any change to liked/watch/orders/searches busts it
// automatically). The greeting is NEVER cached -- it must stay unique on every
// call, so on a cache hit we still make one tiny greeting-only LLM call.
//
// Client passes { force: true } on a hold-to-refresh to skip the cache.

import { createHash } from "node:crypto";
import { z } from "zod";
import { getLlmProvider } from "$lib/server/llm";
import { checkRateLimit } from "$lib/server/rate-limiter";
import { isAllowedOrigin, originErrorResponse } from "$lib/server/origin-guard";
import { pickCache } from "$lib/server/cache";
import { SUGGESTION_ICON_KEYS, SUGGESTION_ICON_HINTS } from "$lib/suggestion-icons";
import {
  GREETING_STYLE_CUES,
  SUGGESTION_ANGLES,
  parseHomeContextJson,
  stableContextKey,
  timeOfDayFor,
  type CachedHomeContext,
  type HomeSuggestion,
} from "$lib/home-context";
import type { RequestHandler } from "./$types";

// Cache lives 5 minutes; greeting is always fresh regardless.
const HOME_CONTEXT_TTL_MS = 5 * 60_000;
const CACHE_PREFIX = "home-context:v1";

const likedItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number().optional().nullable(),
  currency: z.string().optional().nullable(),
  inStock: z.boolean().optional().nullable(),
});

const watchItemSchema = likedItemSchema.extend({
  targetPrice: z.number().optional().nullable(),
});

const orderSummarySchema = z.object({
  itemsTotal: z.number().optional(),
  deliveryFee: z.number().optional(),
  addonsTotal: z.number().optional(),
  grandTotal: z.number().optional(),
  currency: z.string().optional(),
}).partial();

const createdOrderSchema = z.object({
  orderRef: z.string(),
  status: z.string().optional(),
  statusDisplay: z.string().optional(),
  expiresAt: z.string().optional(),
  summary: orderSummarySchema.optional(),
});

const completedOrderSchema = z.object({
  orderNumber: z.string(),
  status: z.string().optional(),
  statusDisplay: z.string().optional(),
  deliveryDate: z.string().optional(),
});

const homeContextSchema = z.object({
  // Greeting inputs.
  agentName: z.string(),
  agentTagline: z.string(),
  isReturningUser: z.boolean().optional().default(false),
  userName: z.string().optional().nullable(),
  language: z.string().optional().default("english"),
  // Shared shopping context.
  liked: z.array(likedItemSchema).default([]),
  watch: z.array(watchItemSchema).default([]),
  createdOrders: z.array(createdOrderSchema).default([]),
  completedOrders: z.array(completedOrderSchema).default([]),
  savedFacts: z.array(z.string()).default([]),
  city: z.string().optional().nullable(),
  recentSearches: z.array(z.string()).optional().default([]),
  // Cache control.
  force: z.boolean().optional().default(false),
});

type HomeContextInput = z.infer<typeof homeContextSchema>;

function contextCacheKey(body: HomeContextInput): string {
  const stable = stableContextKey(body as Record<string, unknown>);
  const hash = createHash("sha256").update(stable).digest("hex").slice(0, 32);
  return `${CACHE_PREFIX}:${hash}`;
}

function allowRomanizedWord(lang: string): boolean {
  return lang === "sinhala" || lang === "tamil" || lang === "sinhala/tamil" || lang === "si" || lang === "ta";
}

function greetingRulesBlock(body: HomeContextInput): string {
  const lang = (body.language || "english").toLowerCase();
  const romanized = allowRomanizedWord(lang)
    ? 'A romanized Sri Lankan word (e.g. ayubowan, vanakkam) is allowed as warmth, but use at most ONE, keep it optional, and keep the rest in English.'
    : 'The preference is English, so use PLAIN ENGLISH ONLY -- do not use ayubowan, vanakkam, or any Sinhala/Tamil word.';
  return `=== GREETING RULES ===
- Write ONE short greeting line, in ENGLISH. Never output native Sinhala or Tamil script.
- The user's language preference is "${lang}". ${romanized}
- Minimal: 10 words or fewer.
- Personalize to this user and this exact moment.
- UNIQUE every call: vary wording and sentence structure. Never reuse generic openers like "Hi there", "Welcome back", "Hey", or "Good <time>".
- No emoji, no quotes, no labels, no markdown, no hashtags. Just the line.
- Personality: ${body.agentTagline}.`;
}

// Greeting-only prompt (used on cache hit, when summary + suggestions are
// already cached). Mirrors the former /api/home-greeting contract exactly.
function buildGreetingOnlyPrompt(body: HomeContextInput, styleCue: string, timeOfDay: string, today: string): string {
  return `You are ${body.agentName}, an AI shopping concierge working inside Djinn — Sri Lanka's full-featured shopping app. You connect users with products from Kapruka's catalog.
Write ONE short greeting line for the home screen.

${greetingRulesBlock(body)}

This user, right now:
- Time of day: ${timeOfDay}
- Date: ${today}
- Name: ${body.userName ?? "unknown"} (use it naturally only if it is a real name)
- Status: ${body.isReturningUser ? "returning" : "new here"}
- ${body.city ? `Delivery city: ${body.city}.` : "No city set."}

This call's opening angle (weave it in subtly, do not be mechanical): ${styleCue}

Return ONLY the greeting line.`;
}

// Full prompt (used on cache miss / force). Produces all three fields in one
// JSON object.
function buildFullPrompt(body: HomeContextInput, styleCue: string, angle: string, timeOfDay: string, today: string): string {
  const iconList = SUGGESTION_ICON_KEYS.map((k) => `${k} (${SUGGESTION_ICON_HINTS[k]})`).join(", ");
  return `You are ${body.agentName}, an AI shopping concierge working inside Djinn — Sri Lanka's full-featured shopping app. You connect users with products from Kapruka's catalog.
Personality: ${body.agentTagline}.

Generate the home screen content as ONE JSON object. Return ONLY the JSON object -- no markdown fences, no prose before or after.

Exact shape:
{
  "greeting": "<=10 word English greeting line",
  "summary": "2-3 sentence friendly summary, **bold** for key terms only",
  "suggestions": [
    { "label": "max 36 chars, starts with an action verb", "query": "the full message to send to the chat agent", "icon": "one of the icon keys" }
  ]
}

${greetingRulesBlock(body)}

=== SUMMARY RULES ===
- 2-3 sentences, friendly, conversational daily summary.
- Highlight if liked items are in stock, created orders need payment, completed orders have tracking updates, or recommendations fit the delivery city.
- CRITICAL: DO NOT include any greetings (no "Hi", "Hello", "Good morning"). Start directly with the summary content.
- Formatting: you may use **bold** for key terms only (product names, order IDs, prices, cities). No headers, no links, no images, no bullet/numbered lists, no code blocks.

=== SUGGESTIONS RULES ===
- Exactly 3 action cards, each something the user can DO right now.
- Each card's "icon" MUST be exactly one of these keys, picked to match the card's intent. Never invent any other value:
${iconList}
- Ground every card in the user's real context below. Never invent products they never interacted with.
- The 3 cards must span DIFFERENT intents (track / search / gift / delivery / watch) -- not three of the same kind.
- Each label starts with an action verb (Track, Find, Check, Gift, Reorder, Watch...).
- If context is thin or empty, use broadly useful Kapruka actions, still varied across intents.
- Vary wording each call; avoid templated phrases.

=== USER CONTEXT (right now) ===
- Time of day: ${timeOfDay}
- Date: ${today}
- Name: ${body.userName ?? "unknown"} (use naturally only if it is a real name)
- Status: ${body.isReturningUser ? "returning" : "new here"}
- ${body.city ? `Delivery city: ${body.city}.` : "No city set."}
- Liked items: ${JSON.stringify(body.liked)}
- Watching (price/stock alerts): ${JSON.stringify(body.watch)}
- Created click-to-pay orders (not trackable until paid): ${JSON.stringify(body.createdOrders)}
- Completed trackable orders: ${JSON.stringify(body.completedOrders)}
- Recent searches: ${JSON.stringify(body.recentSearches)}
- Saved facts / preferences: ${JSON.stringify(body.savedFacts)}

Opening angle for the greeting (weave in subtly): ${styleCue}
Angle to lean into for at least one suggestion card: ${angle}

Return ONLY the JSON object.`;
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    if (!isAllowedOrigin(request)) return originErrorResponse();
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";
    // One call replaces three, so the budget is per mount, not per field.
    if (!(await checkRateLimit(ip, 20, 60_000))) {
      return Response.json({ error: "Too many requests" }, { status: 429 });
    }

    const parsed = homeContextSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

    const body = parsed.data;
    const llm = getLlmProvider("cerebras", "gemma-4-31b");
    const cache = await pickCache();
    const key = contextCacheKey(body);

    const now = new Date();
    const checkedAt = now.toISOString();
    const timeOfDay = timeOfDayFor(now.getHours());
    const today = now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    const styleCue = pickRandom(GREETING_STYLE_CUES);

    // summary + suggestions come from cache when fresh; greeting is always live.
    const cached = body.force ? null : await cache.get<CachedHomeContext>(key);

    if (cached) {
      // CACHE HIT: one small greeting-only call (~60 tokens).
      const resp = await llm.chat([{ role: "user", content: buildGreetingOnlyPrompt(body, styleCue, timeOfDay, today) }], {
        temperature: 0.95,
        maxOutputTokens: 60,
      });
      const greeting = resp.ok ? resp.content.trim() : "";
      return Response.json({
        greeting,
        summary: cached.summary,
        suggestions: cached.suggestions,
        checkedAt: cached.checkedAt,
      });
    }

    // CACHE MISS / FORCE: one full call producing all three fields.
    const angle = pickRandom(SUGGESTION_ANGLES);
    const resp = await llm.chat([{ role: "user", content: buildFullPrompt(body, styleCue, angle, timeOfDay, today) }], {
      temperature: 0.9,
      maxOutputTokens: 600,
    });
    if (!resp.ok) throw new Error("home-context failed");

    const parsed2 = parseHomeContextJson(resp.content);
    const cachedValue: CachedHomeContext = {
      summary: parsed2.summary,
      suggestions: parsed2.suggestions,
      checkedAt,
    };
    // Only cache when we actually got summary/suggestions -- avoids caching an
    // empty miss that would shadow the next attempt for the TTL window.
    if (parsed2.summary || parsed2.suggestions.length) {
      await cache.set(key, cachedValue, HOME_CONTEXT_TTL_MS);
    }
    return Response.json({
      greeting: parsed2.greeting,
      summary: parsed2.summary,
      suggestions: parsed2.suggestions satisfies HomeSuggestion[],
      checkedAt,
    });
  } catch {
    // Sanitized: never leak env/internal details. Empty fields let the client
    // fall back to its static hints and default greeting.
    return Response.json(
      { error: "Home context unavailable", greeting: "", summary: "", suggestions: [], checkedAt: null },
      { status: 500 },
    );
  }
};
