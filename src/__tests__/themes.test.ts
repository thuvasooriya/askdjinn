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
      expect(theme.shortName).toBeTruthy();
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
      "gruvbox-material-dark",
      "gruvbox-material-light",
      "catppuccin-frappe",
      "catppuccin-mocha",
    ];
    for (const id of expectedIds) {
      expect(THEMES[id], `missing theme ${id}`).toBeDefined();
      expect(THEMES[id].id).toBe(id);
    }
  });

  test("ships all 6 themes", () => {
    expect(THEME_LIST.length).toBe(6);
    const catppuccin = THEME_LIST.filter(t => t.id.startsWith("catppuccin-"));
    const gruvbox = THEME_LIST.filter(t => t.id.startsWith("gruvbox-"));
    expect(catppuccin.length).toBe(3); // latte, frappe, mocha
    expect(gruvbox.length).toBe(2); // material dark, material light
    expect(THEMES.chocolate).toBeDefined();
  });

  test("light themes are correctly marked", () => {
    const lightThemes = THEME_LIST.filter(t => t.mode === "light");
    const lightIds = lightThemes.map(t => t.id).sort();
    expect(lightIds).toEqual(["catppuccin-latte", "gruvbox-material-light"]);
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

  test("falls back to chocolate (Dawn) for an unknown id", () => {
    expect(getTheme("does-not-exist").id).toBe("chocolate");
  });

  test("falls back to chocolate (Dawn) for null/undefined", () => {
    expect(getTheme(null).id).toBe("chocolate");
    expect(getTheme(undefined).id).toBe("chocolate");
    expect(getTheme("").id).toBe("chocolate");
  });
});

describe("isThemeId", () => {
  test("returns true for all valid theme ids", () => {
    const validIds: ThemeId[] = [
      "chocolate",
      "catppuccin-latte",
      "gruvbox-material-dark",
      "gruvbox-material-light",
      "catppuccin-frappe",
      "catppuccin-mocha",
    ];
    for (const id of validIds) {
      expect(isThemeId(id), `${id} should be valid`).toBe(true);
    }
  });

  test("returns false for invalid values", () => {
    expect(isThemeId(null)).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
    expect(isThemeId(123)).toBe(false);
    expect(isThemeId({})).toBe(false);
  });
});
