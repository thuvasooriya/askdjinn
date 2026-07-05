// Image-loading helpers.
//
// Kapruka's image CDN (static2.kapruka.com / www.kapruka.com) intermittently
// closes connections and ships a Permissions-Policy header that spams the
// console with unrecognized-feature warnings. Routing those images through our
// own /api/proxy-image endpoint fixes both: the proxy retries transient
// failures server-side, serves a clean header set, and tells the browser to
// cache the result immutably. Non-Kapruka / data: / blob: sources pass through.

const PROXIED_HOSTS = [
  "kapruka.com",
  "www.kapruka.com",
  "static.kapruka.com",
  "static2.kapruka.com",
];

/** Rewrite an image URL to go through the proxy when it's served from Kapruka's
 *  CDN. Data/blob URLs and other hosts are returned unchanged. */
export function proxiedSrc(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("/")) {
    return url;
  }
  try {
    const parsed = new URL(url);
    const proxied = PROXIED_HOSTS.some(
      (h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`),
    );
    if (proxied) return `/api/proxy-image?url=${encodeURIComponent(url)}`;
  } catch {
    // Not a valid absolute URL — return as-is and let the <img> decide.
  }
  return url;
}
