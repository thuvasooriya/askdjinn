/**
 * Server-side web tools: Brave Search + URL fetch.
 * - web_search uses the Brave Search API (key: BRAVE_SEARCH_API_KEY).
 * - fetchUrlAsMarkdown fetches a page and extracts main content via turndown.
 *
 * Google Custom Search JSON API was rejected: it is closed to new customers and
 * sunsets 2027-01-01 (100 free queries/day, then $5/1k, 10k/day hard cap).
 * DuckDuckGo HTML scraping was removed (fragile, no SLA).
 *
 * Server-only (imports $env/dynamic/private). Browser reaches these via routes.
 */

import { env } from "$env/dynamic/private";
import TurndownService from "turndown";

const MAX_RESULTS = 8;
const MAX_FETCH_LENGTH = 8000;
const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** Search the web via the Brave Search API. Throws if no API key is configured. */
export async function webSearch(query: string): Promise<SearchResult[]> {
  const key = env.BRAVE_SEARCH_API_KEY;
  if (!key) throw new Error("Brave Search API key not configured (BRAVE_SEARCH_API_KEY).");

  const url = new URL(BRAVE_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(MAX_RESULTS));
  url.searchParams.set("safesearch", "moderate");

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": key,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Brave Search failed (${res.status}): ${detail || res.statusText}`);
  }

  const data = await res.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  return (data.web?.results ?? [])
    .filter((r): r is { title: string; url: string; description?: string } => Boolean(r.title && r.url))
    .slice(0, MAX_RESULTS)
    .map(r => ({ title: r.title, url: r.url, snippet: r.description ?? "" }));
}

/** Strip HTML tags to get text content. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract the main content from an HTML page using heuristics (no jsdom needed). */
function extractMainContent(html: string): { title: string; content: string } {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
  const title = titleMatch ? stripHtml(titleMatch[1]) : "Untitled";

  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  const mainMatch =
    cleaned.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i) ||
    cleaned.match(/<div[^>]*role="main"[^>]*>([\s\S]*?)<\/div>/i);
  const bodyContent = mainMatch?.[1] ?? cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? cleaned;

  const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  const markdown = turndown.turndown(bodyContent).slice(0, MAX_FETCH_LENGTH);
  return { title, content: markdown };
}

// Block requests to internal/private IPs and cloud metadata endpoints.
function isSsrfUrl(raw: string): boolean {
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = u.hostname.toLowerCase();
    // Block localhost variants
    if (host === "localhost" || host === "[::1]") return true;
    // Block IP ranges: private, loopback, link-local, metadata
    const ipMatch = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipMatch) {
      const [, a, b] = ipMatch.map(Number);
      if (a === 127) return true;                     // 127.0.0.0/8
      if (a === 10) return true;                       // 10.0.0.0/8
      if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
      if (a === 192 && b === 168) return true;         // 192.168.0.0/16
      if (a === 169 && b === 254) return true;         // link-local + AWS metadata
      if (a === 0) return true;                        // 0.0.0.0/8
    }
    // Block cloud metadata hostnames
    if (host === "metadata.google.internal") return true;
    return false;
  } catch {
    return true;
  }
}

/** Fetch a web page and convert its main content to markdown. */
export async function fetchUrlAsMarkdown(url: string): Promise<{ title: string; content: string; url: string }> {
  if (isSsrfUrl(url)) throw new Error("URL not allowed: internal or private address");
  const normalized = url.startsWith("http") ? url : `https://${url}`;
  const res = await fetch(normalized, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; DjinnBot/1.0)" },
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);

  const html = await res.text();
  const { title, content } = extractMainContent(html);
  return { title, content, url: normalized };
}

/** Format search results as a markdown document for the LLM. */
export function formatSearchResults(query: string, results: SearchResult[]): string {
  if (!results.length) return `No web results found for: ${query}`;
  const lines = [`# Web Search: ${query}`, ""];
  results.forEach((r, i) => {
    lines.push(`## ${i + 1}. ${r.title}`);
    lines.push(`> ${r.snippet}`);
    lines.push(`URL: ${r.url}`);
    lines.push("");
  });
  return lines.join("\n");
}
