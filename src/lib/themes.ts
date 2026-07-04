/**
 * Theme registry.
 *
 * Single source of truth for theme *identity* — id, display name, mode
 * (light/dark), and a small swatch for picker previews. The actual color
 * VALUES live in CSS ([data-theme="..."] blocks in app.css) — this file
 * carries no color values, only metadata, so there is no risk of the
 * registry drifting out of sync with the CSS.
 *
 * Themes are orthogonal to agents: a theme controls ALL UI color; an agent
 * controls personality + orb motion. The two are chosen independently.
 *
 * Mirrors the AGENTS registry pattern in agents.ts.
 */

export type ThemeId =
  | "tokyonight-night"
  | "tokyonight-day"
  | "chocolate"
  | "catppuccin-latte"
  | "catppuccin-frappe"
  | "catppuccin-mocha"
  | "gruvbox-material-dark"
  | "gruvbox-material-light"
  | "dusty-rose";

export type ThemeMode = "light" | "dark";

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  /** Short label for compact UI surfaces (onboarding grid, picker). */
  shortName: string;
  description: string;
  mode: ThemeMode;
  /** Four representative hex colors [background, surface, primary, accent]
   *  for the picker swatch preview. Purely cosmetic — the real colors
   *  come from the CSS [data-theme] block. */
  swatch: [string, string, string, string];
}

export const THEMES: Record<ThemeId, ThemeConfig> = {
  "tokyonight-night": {
    id: "tokyonight-night",
    name: "TokyoNight Night",
    shortName: "Tokyo Night",
    description: "Deep blue-black, neon accents. The classic TokyoNight.",
    mode: "dark",
    swatch: ["#16161e", "#1a1b26", "#7aa2f7", "#bb9af7"],
  },
  "tokyonight-day": {
    id: "tokyonight-day",
    name: "TokyoNight Day",
    shortName: "Tokyo Day",
    description: "Light, airy, with TokyoNight's signature blue.",
    mode: "light",
    swatch: ["#e1e2e7", "#d4d7e2", "#2e7de9", "#9854f1"],
  },
  chocolate: {
    id: "chocolate",
    name: "Dawn",
    shortName: "Dawn",
    description: "Warm twilight dawn. The default djinn palette.",
    mode: "dark",
    swatch: ["#131210", "#1e1c1a", "#f97316", "#ebbc37"],
  },
  "catppuccin-latte": {
    id: "catppuccin-latte",
    name: "Catppuccin Latte",
    shortName: "Latte",
    description: "Light, creamy, balanced. The light Catppuccin.",
    mode: "light",
    swatch: ["#eff1f5", "#e6e9ef", "#8839ef", "#1e66f5"],
  },
  "catppuccin-frappe": {
    id: "catppuccin-frappe",
    name: "Catppuccin Frappé",
    shortName: "Frappé",
    description: "Soft, muted dark. The lightest dark Catppuccin.",
    mode: "dark",
    swatch: ["#292c3c", "#303446", "#ca9ee6", "#8caaee"],
  },
  "catppuccin-mocha": {
    id: "catppuccin-mocha",
    name: "Catppuccin Mocha",
    shortName: "Mocha",
    description: "The darkest, most popular Catppuccin.",
    mode: "dark",
    swatch: ["#181825", "#1e1e2e", "#cba6f6", "#89b4fa"],
  },
  "gruvbox-material-dark": {
    id: "gruvbox-material-dark",
    name: "Gruvbox Material Dark",
    shortName: "Gruvbox Dark",
    description: "Warm, earthy dark. Material-softened Gruvbox.",
    mode: "dark",
    swatch: ["#282828", "#32302f", "#e78a4e", "#7daea3"],
  },
  "gruvbox-material-light": {
    id: "gruvbox-material-light",
    name: "Gruvbox Material Light",
    shortName: "Gruvbox Light",
    description: "Warm parchment light. Material-softened Gruvbox.",
    mode: "light",
    swatch: ["#fbf1c7", "#f4e8be", "#c35e0a", "#45707a"],
  },
  "dusty-rose": {
    id: "dusty-rose",
    name: "Dusty Rose",
    shortName: "Dusty Rose",
    description: "Muted mauve, dusty rose, and taupe. Soft and elegant.",
    mode: "light",
    swatch: ["#d6cfcb", "#ccb7ae", "#a6808c", "#706677"],
  },
};

export const THEME_LIST = Object.values(THEMES);

const VALID_THEME_IDS = new Set<ThemeId>(Object.keys(THEMES) as ThemeId[]);

/** Resolve a theme id with a safe fallback to Dawn (chocolate). */
export function getTheme(id: string | undefined | null): ThemeConfig {
  if (id && VALID_THEME_IDS.has(id as ThemeId)) return THEMES[id as ThemeId];
  return THEMES["chocolate"];
}

/** Type guard for validating raw persisted values. */
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && VALID_THEME_IDS.has(value as ThemeId);
}
