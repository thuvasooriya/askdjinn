/**
 * Profile schema: pure data types, defaults, and migration logic.
 *
 * Kept in a runes-free module so it can be unit-tested in isolation (the
 * ProfileStore in profile.svelte.ts uses Svelte 5 runes, which can't run
 * in a plain bun:test environment). The store imports these and wires the
 * migration into persist.load().
 */

import { type Language, type AgentId, getAgent } from "$lib/agents";
import { type ThemeId, isThemeId } from "$lib/themes";

export type { Language, AgentId, ThemeId };

export type SavedFact = {
  id: string;
  text: string;
  category: "preference" | "address" | "size" | "allergy" | "date" | "other";
  createdAt: number;
  confirmed: boolean;
};

export type UserProfile = {
  language: Language;
  agentId: AgentId;
  themeId: ThemeId;
  onboarded: boolean;
  micTested: boolean;
  preferredCity: string | null;
  savedFacts: SavedFact[];
};

export const PROFILE_STORE_ID = "profile";
export const PROFILE_VERSION = 2;

export const defaultProfile: UserProfile = {
  language: "english",
  agentId: "ruka",
  themeId: "tokyonight-night",
  onboarded: false,
  micTested: false,
  preferredCity: null,
  savedFacts: [],
};

/**
 * Pure profile migration (v0/v1 → v2). Handles legacy `personality` field and
 * the dead v1 `theme: { primaryOverride, accentOverride }` struct (those
 * overrides were never applied at runtime).
 */
export function migrateProfile(raw: unknown, _fromVersion: number): UserProfile {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const validAgents: AgentId[] = ["ruka", "mithu", "kavi", "neel"];
  const validLangs: Language[] = ["english", "sinhala", "tamil"];

  const language = validLangs.includes(obj.language as Language) ? (obj.language as Language) : "english";
  const agentId = validAgents.includes(obj.agentId as AgentId)
    ? (obj.agentId as AgentId)
    : obj.personality === "bold" ? "ruka" : obj.personality === "professional" ? "neel" : "ruka";

  const themeId: ThemeId = isThemeId(obj.themeId) ? (obj.themeId as ThemeId) : "tokyonight-night";

  const factsRaw = Array.isArray(obj.savedFacts) ? obj.savedFacts : [];
  const savedFacts: SavedFact[] = factsRaw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({
      id: typeof f.id === "string" ? f.id : crypto.randomUUID(),
      text: typeof f.text === "string" ? f.text : "",
      category: ["preference", "address", "size", "allergy", "date", "other"].includes(f.category as string)
        ? (f.category as SavedFact["category"]) : "other",
      createdAt: typeof f.createdAt === "number" ? f.createdAt : Date.now(),
      confirmed: f.confirmed !== false,
    }))
    .filter((f) => f.text.length > 0);

  return {
    language,
    agentId,
    themeId,
    onboarded: obj.onboarded === true,
    micTested: obj.micTested === true,
    preferredCity: typeof obj.preferredCity === "string" ? obj.preferredCity : null,
    savedFacts,
  };
}

/** Re-export getAgent so the store can reach it without a second import site. */
export { getAgent };
