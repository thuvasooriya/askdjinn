import { z } from "zod";
import { getLlmProvider } from "$lib/server/llm";
import { checkRateLimit } from "$lib/server/rate-limiter";
import { isAllowedOrigin, originErrorResponse } from "$lib/server/origin-guard";
import type { RequestHandler } from "./$types";

const greetingSchema = z.object({
  agentName: z.string(),
  agentTagline: z.string(),
  isReturningUser: z.boolean().optional().default(false),
  userName: z.string().optional().nullable(),
  preferredCity: z.string().optional().nullable(),
  language: z.string().optional().default("english"),
});

export const POST: RequestHandler = async ({ request }) => {
  try {
    if (!isAllowedOrigin(request)) return originErrorResponse();
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";
    if (!(await checkRateLimit(ip, 10, 60_000))) {
      return Response.json({ error: "Too many requests" }, { status: 429 });
    }

    const parsed = greetingSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

    const body = parsed.data;
    // Helper agent: always cerebras/gemma-4-31b
    const llm = getLlmProvider("cerebras", "gemma-4-31b");

    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";

    const lang = (body.language || "english").toLowerCase();
    const allowRomanized = lang === "sinhala" || lang === "tamil" || lang === "sinhala/tamil" || lang === "si" || lang === "ta";
    const styleCues = [
      "remark on the time of day in an unhackneyed way",
      "notice one small specific detail about this user",
      "ask one short warm rhetorical question",
      "wish them something concrete for their day",
      "nod to their city or shopping intent subtly",
      "reference the day of the week or season lightly",
    ];
    const styleCue = styleCues[Math.floor(Math.random() * styleCues.length)];
    const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

    const prompt = `You are ${body.agentName}, a Sri Lankan AI shopping concierge for Kapruka.com.
Write ONE short greeting line for the home screen.

Hard rules:
- Write in ENGLISH. Never output native Sinhala or Tamil script.
- The user's language preference is "${lang}". ${allowRomanized
      ? "A romanized Sri Lankan word (e.g. ayubowan, vanakkam) is allowed as warmth, but use at most ONE, keep it optional, and keep the rest in English."
      : "The preference is English, so use PLAIN ENGLISH ONLY -- do not use ayubowan, vanakkam, or any Sinhala/Tamil word."}
- Minimal: 10 words or fewer.
- Personalize to this user and this exact moment.
- UNIQUE every call: vary wording and sentence structure. Never reuse generic openers like "Hi there", "Welcome back", "Hey", or "Good <time>".
- No emoji, no quotes, no labels, no markdown, no hashtags. Just the line.
- Personality: ${body.agentTagline}.

This user, right now:
- Time of day: ${timeOfDay}
- Date: ${today}
- Name: ${body.userName ?? "unknown"} (use it naturally only if it is a real name)
- Status: ${body.isReturningUser ? "returning" : "new here"}
- ${body.preferredCity ? `Delivery city: ${body.preferredCity}.` : "No city set."}

This call's opening angle (weave it in subtly, do not be mechanical): ${styleCue}

Return ONLY the greeting line.`;

    const response = await llm.chat([{ role: "user", content: prompt }], { temperature: 0.95, maxOutputTokens: 60 });
    if (!response.ok) throw new Error("Greeting failed");

    return Response.json({ greeting: response.content.trim() });
  } catch {
    return Response.json({ error: "Greeting unavailable", greeting: "" }, { status: 500 });
  }
};
