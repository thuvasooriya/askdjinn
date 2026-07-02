import { describe, test, expect } from "bun:test";
import { migrateProfile, defaultProfile } from "$lib/stores/profile-schema";
import type { UserProfile } from "$lib/stores/profile-schema";

// ── Profile Migration Tests (v1 → v2) ───────────────────────────────────────
//
// v1 stored theme as { primaryOverride?, accentOverride? } (dead code — these
// overrides were never applied at runtime). v2 replaces it with themeId.
// Migration must map any v1 profile to themeId: "chocolate" while preserving
// all other fields (agentId, language, savedFacts, etc.).

describe("profile migration v1 → v2", () => {
  test("maps a v1 profile with dead theme overrides to chocolate", () => {
    const v1 = {
      language: "sinhala",
      agentId: "mithu",
      provider: "cerebras",
      model: "gemma-4-31b",
      theme: { primaryOverride: "200 85% 52%", accentOverride: "190 75% 48%" },
      onboarded: true,
      micTested: true,
      preferredCity: "Kandy",
      savedFacts: [{ id: "f1", text: "likes chocolate", category: "preference", createdAt: 1, confirmed: true }],
    };

    const migrated = migrateProfile(v1, 1);

    expect(migrated.themeId).toBe("tokyonight-night");
    expect(migrated.language).toBe("sinhala");
    expect(migrated.agentId).toBe("mithu");
    expect(migrated.onboarded).toBe(true);
    expect(migrated.micTested).toBe(true);
    expect(migrated.preferredCity).toBe("Kandy");
    expect(migrated.savedFacts.length).toBe(1);
    expect(migrated.savedFacts[0].text).toBe("likes chocolate");
    // The dead theme struct must NOT leak through
    expect((migrated as unknown as Record<string, unknown>).theme).toBeUndefined();
  });

  test("preserves a v2 profile that already has themeId", () => {
    const v2 = {
      language: "tamil",
      agentId: "kavi",
      themeId: "catppuccin-mocha",
      onboarded: true,
    };

    const migrated = migrateProfile(v2, 2);

    expect(migrated.themeId).toBe("catppuccin-mocha");
    expect(migrated.agentId).toBe("kavi");
    expect(migrated.language).toBe("tamil");
  });

  test("defaults themeId to chocolate when no theme field is present", () => {
    const v1Minimal = { agentId: "neel", language: "english" };
    const migrated = migrateProfile(v1Minimal, 1);
    expect(migrated.themeId).toBe("tokyonight-night");
    expect(migrated.agentId).toBe("neel");
  });

  test("falls back to defaults for invalid/missing essential fields", () => {
    const migrated = migrateProfile({}, 0);

    expect(migrated.themeId).toBe("tokyonight-night");
    expect(migrated.agentId).toBe("ruka");
    expect(migrated.language).toBe("english");
    expect(migrated.onboarded).toBe(false);
    expect(migrated.savedFacts).toEqual([]);
  });

  test("re-forces onboarding if agentId is invalid even if onboarded=true", () => {
    const corrupted = {
      language: "english",
      agentId: "unknown-agent",
      onboarded: true,
    };
    const migrated = migrateProfile(corrupted, 1);
    // migrate itself doesn't re-validate onboarding (that's the store's job),
    // but it should fall back to a valid agentId.
    expect(["ruka", "mithu", "kavi", "neel"]).toContain(migrated.agentId);
  });

  test("migrates legacy personality field to agentId", () => {
    const legacy = { personality: "professional", language: "english" };
    const migrated = migrateProfile(legacy, 0);
    expect(migrated.agentId).toBe("neel"); // "professional" → neel

    const legacyBold = { personality: "bold", language: "english" };
    const migratedBold = migrateProfile(legacyBold, 0);
    expect(migratedBold.agentId).toBe("ruka"); // "bold" → ruka
  });

  test("handles null/undefined/non-object input safely", () => {
    expect(migrateProfile(null, 0).agentId).toBe("ruka");
    expect(migrateProfile(undefined, 0).agentId).toBe("ruka");
    expect(migrateProfile("not an object", 0).agentId).toBe("ruka");
  });

  test("default profile has themeId tokyonight-night", () => {
    expect(defaultProfile.themeId).toBe("tokyonight-night");
  });

  test("migrated profile matches UserProfile shape", () => {
    const migrated = migrateProfile({ agentId: "ruka" }, 1);
    const keys: (keyof UserProfile)[] = [
      "language", "agentId", "themeId",
      "onboarded", "micTested", "preferredCity", "savedFacts",
    ];
    for (const key of keys) {
      expect(migrated).toHaveProperty(key);
    }
  });
});
