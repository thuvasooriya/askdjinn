/**
 * User profile store: language, agent selection, theme, saved facts, and onboarding state.
 *
 * Uses the unified persistence layer with versioned schema.
 * If essential preferences (language, agent) are missing, onboarded is
 * forced to false so the onboarding flow re-triggers.
 *
 * Theme (UI color) and agent (personality + orb motion) are independent
 * orthogonal choices. Theme is applied by setting <html data-theme="...">,
 * which the CSS cascade picks up — no per-property JS writes needed.
 *
 * Pure types/defaults/migration live in profile-schema.ts (runes-free, unit-
 * testable). This module holds the reactive Svelte 5 store only.
 */

import {
  type Language,
  type AgentId,
  type ThemeId,
  type UserProfile,
  type SavedFact,
  defaultProfile,
  migrateProfile,
  PROFILE_STORE_ID,
  PROFILE_VERSION,
  getAgent,
} from "$lib/stores/profile-schema";
import { getTheme, type ThemeConfig } from "$lib/themes";
import * as persist from "$lib/stores/persistence";
import { untrack } from "svelte";

export type { Language, AgentId, ThemeId, ThemeConfig, UserProfile, SavedFact };
export { defaultProfile, migrateProfile, PROFILE_STORE_ID, PROFILE_VERSION };

class ProfileStore {
  profile = $state<UserProfile>(defaultProfile);
  hydrated = $state(false);

  constructor() {
    // Always start with defaults for SSR
    this.profile = { ...defaultProfile };

    // Hydrate synchronously in the browser
    if (typeof window !== "undefined") {
      this.hydrate();
    }
  }

  private hydrate() {
    const loaded = persist.load(PROFILE_STORE_ID, PROFILE_VERSION, defaultProfile, migrateProfile);

    // CRITICAL: Validate that essential fields are present.
    // If the user has "completed onboarding" but we lost their language
    // or agent preference, force re-onboarding.
    if (loaded.onboarded) {
      const validAgents: AgentId[] = ["ruka", "mithu", "kavi", "neel"];
      const validLangs: Language[] = ["english", "sinhala", "tamil"];
      if (!validAgents.includes(loaded.agentId) || !validLangs.includes(loaded.language)) {
        loaded.onboarded = false;
      }
    }

    this.profile = loaded;
    this.hydrated = true;
    this.applyTheme();
  }

  // ── Queries ───────────────────────────────────────

  get language() { return this.profile.language; }
  get agentId() { return this.profile.agentId; }
  get themeId() { return this.profile.themeId; }
  get theme(): ThemeConfig { return getTheme(this.profile.themeId); }
  get agent() { return getAgent(this.profile.agentId); }
  get onboarded() { return this.profile.onboarded; }
  get micTested() { return this.profile.micTested; }
  get preferredCity() { return this.profile.preferredCity; }
  get savedFacts() { return this.profile.savedFacts; }

  private commit() {
    persist.save(PROFILE_STORE_ID, PROFILE_VERSION, this.profile);
  }

  // ── Theme application ─────────────────────────────
  //
  // One line: set <html data-theme="id">. The CSS cascade handles the rest
  // — every color, gradient, and glow derives from the active theme's
  // [data-theme] block. Runs on hydrate and whenever themeId changes.

  applyTheme() {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = this.profile.themeId;
  }

  // ── Mutations ─────────────────────────────────────

  setLanguage(lang: Language) {
    this.profile = { ...this.profile, language: lang };
    this.commit();
  }


  setAgent(id: AgentId) {
    this.profile = { ...this.profile, agentId: id };
    this.commit();
    // Orb motion changes with the agent; the AgentOrb component re-reads
    // shape on agentId change. Theme (color) is unaffected.
  }

  setTheme(id: ThemeId) {
    this.profile = { ...this.profile, themeId: id };
    this.commit();
    this.applyTheme();
  }

  /** Preview theme without persisting (used during onboarding live-preview). */
  previewTheme(id: ThemeId) {
    untrack(() => {
      this.profile = { ...this.profile, themeId: id };
      this.applyTheme();
    });
  }

  /** Preview agent without persisting (used during onboarding live-preview). */
  previewAgent(id: AgentId) {
    untrack(() => {
      this.profile = { ...this.profile, agentId: id };
    });
  }

  completeOnboarding() {
    this.profile = { ...this.profile, onboarded: true };
    this.commit();
  }

  setMicTested(tested: boolean) {
    this.profile = { ...this.profile, micTested: tested };
    this.commit();
  }
  setPreferredCity(city: string | null) {
    this.profile = { ...this.profile, preferredCity: city };
    this.commit();
  }
  resetOnboarding() {
    this.profile = { ...this.profile, onboarded: false };
    this.commit();
  }

  addFact(text: string, category: SavedFact["category"] = "other"): string {
    const id = crypto.randomUUID();
    const fact: SavedFact = { id, text, category, createdAt: Date.now(), confirmed: true };
    this.profile = { ...this.profile, savedFacts: [...this.profile.savedFacts, fact] };
    this.commit();
    return id;
  }

  removeFact(id: string) {
    this.profile = { ...this.profile, savedFacts: this.profile.savedFacts.filter(f => f.id !== id) };
    this.commit();
  }
}

const instance = new ProfileStore();
export function useProfile() { return instance; }
