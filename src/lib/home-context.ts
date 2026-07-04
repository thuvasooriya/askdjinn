// Pure helpers for the unified /api/home-context endpoint.
//
// Kept out of the route module so they can be unit-tested without crypto or
// network. The route composes these with server-only bits (createHash, the
// LLM call, the in-memory cache). Nothing here imports server-only or Svelte
// code -- it is isomorphic.

import { clampIconKey, type SuggestionIconKey } from "./suggestion-icons";

export interface HomeSuggestion {
  label: string;
  query: string;
  icon: SuggestionIconKey;
}

export interface ParsedHomeContext {
  greeting: string;
  summary: string;
  suggestions: HomeSuggestion[];
}

// What we persist in the server cache (greeting is never cached -- it must
// stay unique on every call).
export interface CachedHomeContext {
  summary: string;
  suggestions: HomeSuggestion[];
  checkedAt: string;
}

// Greeting opening angles -- picked at random per call so the line varies.
export const GREETING_STYLE_CUES = [
  "remark on the time of day in an unhackneyed way",
  "notice one small specific detail about this user",
  "ask one short warm rhetorical question",
  "wish them something concrete for their day",
  "nod to their city or shopping intent subtly",
  "reference the day of the week or season lightly",
];

// Suggestion intent angles -- at least one card leans into the day's angle.
export const SUGGESTION_ANGLES = [
  "price drops / watch-list alerts",
  "tracking or reordering an existing order",
  "gift ideas for an occasion",
  "delivery or city-specific checks",
  "new finds related to liked items",
];

export function timeOfDayFor(hour: number): string {
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";
}

// Deterministic canonicalization: recursively sorts object keys so two
// semantically-equal bodies (built in different key order) hash to the same
// cache key. Array order is preserved -- it is meaningful for context.
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj).sort().reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = canonicalize(obj[k]);
      return acc;
    }, {});
  }
  return value;
}

// Stable string used to derive the cache key. `force` is excluded so a refresh
// request hits/overwrites the same slot as a normal mount for the same context.
export function stableContextKey(body: Record<string, unknown>): string {
  const { force: _force, ...rest } = body;
  void _force;
  return JSON.stringify(canonicalize(rest));
}

// Strip a single ```json ... ``` / ``` ... ``` fence if present.
export function stripFences(content: string): string {
  let s = content.trim();
  const fence = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  if (fence) s = fence[1].trim();
  return s;
}

// Defensive parse of the unified LLM JSON response. Never throws; each field
// falls back independently so a half-bad response still yields what it can.
export function parseHomeContextJson(content: string): ParsedHomeContext {
  const cleaned = stripFences(content);
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    return { greeting: "", summary: "", suggestions: [] };
  }
  const o = obj && typeof obj === "object" ? (obj as Record<string, unknown>) : {};
  const greeting = typeof o.greeting === "string" ? o.greeting.trim().slice(0, 120) : "";
  const summary = typeof o.summary === "string" ? o.summary.trim() : "";
  let suggestions: HomeSuggestion[] = [];
  if (Array.isArray(o.suggestions)) {
    suggestions = o.suggestions
      .filter(
        (s): s is Record<string, unknown> =>
          !!s && typeof s === "object" && typeof (s as Record<string, unknown>).label === "string" && typeof (s as Record<string, unknown>).query === "string",
      )
      .slice(0, 3)
      .map((s) => ({
        label: String(s.label).slice(0, 60),
        query: String(s.query),
        icon: clampIconKey(s.icon),
      }));
  }
  return { greeting, summary, suggestions };
}
