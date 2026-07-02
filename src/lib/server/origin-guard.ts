import { env } from "$env/dynamic/private";

const ALLOWED_ORIGINS = (() => {
  const raw = env.ALLOWED_ORIGINS ?? env.ORIGIN ?? "";
  const origins = raw.split(",").map((o: string) => o.trim()).filter(Boolean);
  if (origins.length === 0 && env.NODE_ENV !== "production") {
    origins.push("http://localhost:5173", "http://localhost:5174", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:5174");
  }
  return origins;
})();

const isProduction = env.NODE_ENV === "production";

export function isAllowedOrigin(request: Request): boolean {
  // Allow same-origin requests: compare the request URL host with origin/referer
  const requestHost = new URL(request.url).host;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  // Same-origin check (always safe, covers all deployment URLs automatically)
  if (origin) {
    try { if (new URL(origin).host === requestHost) return true; } catch { /* ignore */ }
  }
  if (referer) {
    try { if (new URL(referer).host === requestHost) return true; } catch { /* ignore */ }
  }

  // No origin/referer = server-to-server (health checks, internal calls)
  if (!origin && !referer) return true;

  // Explicitly allowed origins (if configured)
  if (ALLOWED_ORIGINS.length > 0) {
    if (origin && ALLOWED_ORIGINS.includes(origin)) return true;
    if (referer) {
      try {
        const refUrl = new URL(referer);
        if (ALLOWED_ORIGINS.includes(`${refUrl.protocol}//${refUrl.host}`)) return true;
      } catch { /* ignore */ }
    }
  }

  // Dev mode: allow localhost
  if (!isProduction && (origin?.includes("localhost") || referer?.includes("localhost"))) return true;

  return false;
}

export function originErrorResponse(): Response {
  return Response.json({ error: "Forbidden: origin not allowed" }, { status: 403 });
}
