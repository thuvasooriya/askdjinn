import { describe, test, expect } from "bun:test";
import {
  THEMES,
  THEME_LIST,
  getTheme,
  isThemeId,
  type ThemeId,
  type ThemeMode,
} from "$lib/themes";

// ── Theme Registry Tests ────────────────────────────────────────────────────

describe("themes registry", () => {
  test("every theme has the required metadata fields", () => {
    for (const theme of THEME_LIST) {
      expect(theme.id).toBeTruthy();
      expect(theme.name).toBeTruthy();
      expect(theme.description).toBeTruthy();
      expect(["light", "dark"]).toContain(theme.mode);
      expect(Array.isArray(theme.swatch)).toBe(true);
      expect(theme.swatch.length).toBe(4);
      // Swatch colors must be valid hex strings
      for (const color of theme.swatch) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  test("theme ids are unique", () => {
    const ids = THEME_LIST.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every ThemeId key exists in the registry", () => {
    const expectedIds: ThemeId[] = [
      "chocolate",
      "catppuccin-latte",
      "catppuccin-frappe",
      "catppuccin-macchiato",
      "catppuccin-mocha",
      "tokyonight-night",
      "tokyonight-day",
    ];
    for (const id of expectedIds) {
      expect(THEMES[id], `missing theme ${id}`).toBeDefined();
      expect(THEMES[id].id).toBe(id);
    }
  });

  test("ships all 7 themes (Chocolate + 4 Catppuccin + 2 TokyoNight)", () => {
    expect(THEME_LIST.length).toBe(7);
    const catppuccin = THEME_LIST.filter(t => t.id.startsWith("catppuccin-"));
    const tokyonight = THEME_LIST.filter(t => t.id.startsWith("tokyonight-"));
    expect(catppuccin.length).toBe(4); // latte, frappe, macchiato, mocha
    expect(tokyonight.length).toBe(2); // night, day
    expect(THEMES.chocolate).toBeDefined();
  });

  test("light themes are correctly marked", () => {
    const lightThemes = THEME_LIST.filter(t => t.mode === "light");
    const lightIds = lightThemes.map(t => t.id).sort();
    expect(lightIds).toEqual(["catppuccin-latte", "tokyonight-day"]);
  });

  test("chocolate is the default theme and is dark", () => {
    expect(THEMES.chocolate.mode).toBe("dark");
  });
});

describe("getTheme", () => {
  test("returns the correct theme for a valid id", () => {
    const mocha = getTheme("catppuccin-mocha");
    expect(mocha.id).toBe("catppuccin-mocha");
    expect(mocha.name).toBe("Catppuccin Mocha");
  });

  test("falls back to tokyonight-night for an unknown id", () => {
    expect(getTheme("does-not-exist").id).toBe("tokyonight-night");
  });

  test("falls back to tokyonight-night for null/undefined", () => {
    expect(getTheme(null).id).toBe("tokyonight-night");
    expect(getTheme(undefined).id).toBe("tokyonight-night");
    expect(getTheme("").id).toBe("tokyonight-night");
  });
});

describe("isThemeId", () => {
  test("returns true for all valid theme ids", () => {
    const validIds: ThemeId[] = [
      "chocolate",
      "catppuccin-latte",
      "catppuccin-frappe",
      "catppuccin-macchiato",
      "catppuccin-mocha",
      "tokyonight-night",
      "tokyonight-day",
    ];
    for (const id of validIds) {
      expect(isThemeId(id), `${id} should be valid`).toBe(true);
    }
  });

  test("returns false for invalid values", () => {
    expect(isThemeId("chocolate-light")).toBe(false);
    expect(isThemeId("mocha")).toBe(false); // partial name, not full id
    expect(isThemeId(null)).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
    expect(isThemeId(123)).toBe(false);
    expect(isThemeId({})).toBe(false);
  });
});
