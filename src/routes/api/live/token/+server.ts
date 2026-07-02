import { env } from "$env/dynamic/private";
import { GoogleGenAI } from "@google/genai";
import { checkRateLimit } from "$lib/server/rate-limiter";
import { isAllowedOrigin, originErrorResponse } from "$lib/server/origin-guard";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  try {
    if (!isAllowedOrigin(request)) return originErrorResponse();
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";
    if (!(await checkRateLimit(ip, 5, 60_000))) {
      return Response.json({ error: "Too many live session requests. Please wait a moment." }, { status: 429 });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "Gemini API key not configured (GEMINI_API_KEY)." }, { status: 503 });
    }

    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1alpha" } });

    const tokenResponse = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      },
    });

    if (!tokenResponse.name) {
      return Response.json({ error: "Token creation returned empty." }, { status: 500 });
    }

    return Response.json({
      token: tokenResponse.name,
      model: "gemini-3.1-flash-live-preview",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create token";
    return Response.json({ error: message }, { status: 500 });
  }
};
