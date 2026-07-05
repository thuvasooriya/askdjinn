// Image proxy for Kapruka's CDN.
//
// Kapruka's image server (static2.kapruka.com / www.kapruka.com) intermittently
// closes connections (net::ERR_CONNECTION_CLOSED) and returns a Permissions-
// Policy header full of Privacy-Sandbox ad features the browser doesn't
// recognize, spamming the console. Loading the images through this endpoint:
//   - retries transient failures server-side (the real fix for "works on reload"),
//   - serves a clean header set (no Permissions-Policy warnings),
//   - tells the browser to cache the bytes immutably (7 days), so repeat views
//     never re-hit Kapruka.
// Hardened with a Kapruka-only host allowlist (no open proxy) + size cap.

import { checkRateLimit } from "$lib/server/rate-limiter";
import type { RequestHandler } from "./$types";

const ALLOWED_HOSTS = [
  "kapruka.com",
  "www.kapruka.com",
  "static.kapruka.com",
  "static2.kapruka.com",
];
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB — anything bigger isn't a product thumb.
const FETCH_TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 3;

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

export const GET: RequestHandler = async ({ url, request }) => {
  // Images are high-frequency and same-origin; rate-limit generously, no origin
  // guard (the host allowlist is the abuse barrier).
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";
  if (!(await checkRateLimit(ip, 240, 60_000))) {
    return new Response("Too many requests", { status: 429 });
  }

  const target = url.searchParams.get("url");
  if (!target) return new Response("Missing url parameter", { status: 400 });

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }
  const allowed = ALLOWED_HOSTS.some(
    (h) => targetUrl.hostname === h || targetUrl.hostname.endsWith(`.${h}`),
  );
  if (!allowed) return new Response("Host not allowed", { status: 403 });

  // Retry with backoff — ERR_CONNECTION_CLOSED is transient on Kapruka's CDN.
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await delay(150 * attempt);
    try {
      const upstream = await fetch(targetUrl, {
        headers: { Accept: "image/*", "User-Agent": "askdjinn/1.0 (+https://askdjinn.app)" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!upstream.ok || upstream.status === 0) {
        lastError = new Error(`upstream ${upstream.status || "no-response"}`);
        continue;
      }
      const type = upstream.headers.get("content-type") ?? "image/jpeg";
      if (!type.startsWith("image/")) {
        return new Response("Not an image", { status: 400 });
      }
      const buf = await upstream.arrayBuffer();
      if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) {
        lastError = new Error(buf.byteLength > MAX_BYTES ? "too large" : "empty");
        continue;
      }
      return new Response(buf, {
        status: 200,
        headers: {
          "Content-Type": type,
          // Immutable: the URL is the cache key, so the bytes never change.
          "Cache-Control": "public, max-age=604800, immutable",
        },
      });
    } catch (err) {
      lastError = err;
    }
  }
  const message = lastError instanceof Error ? lastError.message : "image fetch failed";
  return new Response(`Image unavailable: ${message}`, { status: 502 });
};
