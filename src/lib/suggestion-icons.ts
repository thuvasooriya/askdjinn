// Source-of-truth for suggestion card icons.
//
// The key list is shared between three places, keeping the contract tight and
// non-leaky:
//   1. the gemma prompt (so it only ever picks from known keys),
//   2. the server validation (we never trust the LLM's string past the enum),
//   3. the client key->component map in HomeHero.
//
// To add an icon: append its key here, then map it to a lucide component in
// HomeHero's SUGGESTION_ICONS. SSR-safe -- no Svelte imports in this file.

export const SUGGESTION_ICON_KEYS = [
  "track", "search", "gift", "delivery", "cake",
  "star", "heart", "bell", "refresh", "cart",
] as const;

export type SuggestionIconKey = (typeof SUGGESTION_ICON_KEYS)[number];

export const DEFAULT_SUGGESTION_ICON: SuggestionIconKey = "search";

// One-line intent hint per key, surfaced to gemma so it picks a fitting icon.
export const SUGGESTION_ICON_HINTS: Record<SuggestionIconKey, string> = {
  track: "tracking / checking an order status",
  search: "searching or browsing products",
  gift: "gifting ideas for an occasion",
  delivery: "delivery or city-specific checks",
  cake: "cakes / food / bakery",
  star: "featured / highlights / favorites",
  heart: "liked items / wishlist",
  bell: "alerts / reminders / restocks",
  refresh: "refresh / retry / update",
  cart: "cart / create-order / reorder",
};

// Defensive clamp: coerce any unknown value to a valid key. Used server-side
// after parsing gemma's JSON and client-side as a final guard.
export function clampIconKey(raw: unknown): SuggestionIconKey {
  return typeof raw === "string" && (SUGGESTION_ICON_KEYS as readonly string[]).includes(raw)
    ? (raw as SuggestionIconKey)
    : DEFAULT_SUGGESTION_ICON;
}
