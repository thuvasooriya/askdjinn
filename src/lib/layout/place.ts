/**
 * Placement: decides which panels are visible (vs minimized) for a breakpoint
 * tier and produces the LayoutRegion tree. Implements the priority+recency
 * eviction policy from the spec:
 *   1. needs-input panels always win a slot (bypass cap if necessary)
 *   2. pinned panels claim remaining slots
 *   3. recency tiebreaker; within a tier, oldest is evicted first (FIFO)
 *
 * Mobile is special: no eviction — every open panel becomes a tab.
 */

import type { Panel } from "$lib/stores/panel-registry";
import { getContract } from "$lib/panel-contracts";
import type { LayoutRegion } from "./tree";
import { leafIds } from "./tree";
import { SLOTS_BY_TIER, buildPreset, pickDefaultPreset, type LayoutTier, type PresetName } from "./presets";
function priority(panel: Panel): number {
  if (panel.status === "needs-input") return 3;
  if (panel.pinned) return 2;
  return 1;
}

const DEFAULT_MIN_WIDTH = 280;
const DEFAULT_MIN_HEIGHT = 240;
const CANVAS_PADDING_X = 24; // CanvasGrid: 0.75rem left + right
const CANVAS_PADDING_Y = 24;
const SPLIT_GAP = 12; // Region split gap: 0.75rem

export interface ViewportSize {
  width: number;
  height: number;
}

function leafMinSize(panel: Panel | undefined): { width: number; height: number } {
  if (!panel) return { width: DEFAULT_MIN_WIDTH, height: DEFAULT_MIN_HEIGHT };
  const contract = getContract(panel.type);
  return {
    width: contract.minWidth ?? DEFAULT_MIN_WIDTH,
    height: contract.minHeight ?? DEFAULT_MIN_HEIGHT,
  };
}

function regionMinSize(region: LayoutRegion | null, panelById: Map<string, Panel>): { width: number; height: number } {
  if (!region) return { width: 0, height: 0 };
  if (region.kind === "leaf") return leafMinSize(panelById.get(region.panelId));
  const children = region.children.map(c => regionMinSize(c, panelById));
  if (region.orientation === "row") {
    return {
      width: children.reduce((sum, c) => sum + c.width, 0) + SPLIT_GAP * Math.max(0, children.length - 1),
      height: children.reduce((max, c) => Math.max(max, c.height), 0),
    };
  }
  return {
    width: children.reduce((max, c) => Math.max(max, c.width), 0),
    height: children.reduce((sum, c) => sum + c.height, 0) + SPLIT_GAP * Math.max(0, children.length - 1),
  };
}

function fitsRegion(region: LayoutRegion | null, panelById: Map<string, Panel>, viewport?: ViewportSize): boolean {
  if (!viewport || viewport.width <= 0 || viewport.height <= 0) return true;
  const usable = { width: Math.max(0, viewport.width - CANVAS_PADDING_X), height: Math.max(0, viewport.height - CANVAS_PADDING_Y) };
  const mins = regionMinSize(region, panelById);
  return mins.width <= usable.width && mins.height <= usable.height;
}

function preferredWidthForPanel(panel: Panel | undefined, preferredWidths?: Record<string, number>): number {
  if (!panel) return DEFAULT_MIN_WIDTH;
  const contract = getContract(panel.type);
  return preferredWidths?.[panel.id] ?? preferredWidths?.[panel.type] ?? contract.minWidth ?? DEFAULT_MIN_WIDTH;
}

function applyPreferredWeights(region: LayoutRegion | null, panelById: Map<string, Panel>, preferredWidths?: Record<string, number>): LayoutRegion | null {
  if (!region || region.kind === "leaf") return region;
  const children = region.children.map(c => applyPreferredWeights(c, panelById, preferredWidths)).filter((c): c is LayoutRegion => c !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  if (region.orientation === "row") {
    const weights = children.map(child =>
      leafIds(child).reduce((sum, id) => sum + preferredWidthForPanel(panelById.get(id), preferredWidths), 0)
    );
    return { ...region, children, weights };
  }
  return { ...region, children };
}

function presetCandidates(panels: Panel[], preferred?: PresetName): PresetName[] {
  if (preferred) {
    const base = preferred === "chat-browse" ? ["chat-browse", "compare", "browse", "focus"]
      : preferred === "compare" ? ["compare", "browse", "focus"]
      : preferred === "browse" ? ["browse", "focus"]
      : ["focus"];
    return [...new Set(base)] as PresetName[];
  }
  const base = pickDefaultPreset(panels);
  if (base === "chat-browse") return ["chat-browse", "compare", "browse", "focus"];
  if (base === "compare") return ["compare", "browse", "focus"];
  if (base === "browse") return panels.length >= 3 ? ["compare", "browse", "focus"] : ["browse", "focus"];
  return ["focus"];
}

/** Pick the panels that occupy visible slots for this tier. */
export function selectVisiblePanels(panels: Panel[], tier: LayoutTier): Panel[] {
  const cap = SLOTS_BY_TIER[tier];
  const nonMinimized = panels.filter(p => !p.minimized && p.status !== "expired");
  const needsInput = nonMinimized.filter(p => p.status === "needs-input");
  const rest = nonMinimized
    .filter(p => p.status !== "needs-input")
    .sort((a, b) => priority(b) - priority(a) || b.createdAt - a.createdAt);
  const remaining = Math.max(0, cap - needsInput.length);
  return [...needsInput, ...rest.slice(0, remaining)];
}

export interface Placement {
  tree: LayoutRegion | null;
  visible: Panel[];
  /** Panels not currently rendered — either explicitly minimized by the
   *  user/agent OR overflow (didn't win a slot under the cap). PURELY DERIVED:
   *  this must never mutate the panels. */
  minimized: Panel[];
  preset: PresetName;
}

/** Full placement: visible set + hidden set + tree. PURE — does not mutate
 *  panels. `panel.minimized` reflects only explicit user/agent intent; overflow
 *  (didn't fit the cap) is expressed purely via this Placement result so the
 *  store/getter never has to write state during a derived read. */
export function selectLayout(
  panels: Panel[],
  tier: LayoutTier,
  preset?: PresetName,
  viewport?: ViewportSize,
  preferredWidths?: Record<string, number>,
): Placement {
  const candidates = selectVisiblePanels(panels, tier);

  for (let count = candidates.length; count >= 1; count--) {
    const subset = candidates.slice(0, count);
    const subsetById = new Map(subset.map(p => [p.id, p]));

    for (const name of presetCandidates(subset, preset)) {
      const rawTree = buildPreset(name, subset.map(p => p.id));
      if (!rawTree) continue;
      // A preset that silently drops some ids (e.g. "browse" on a 3-panel subset)
      // is not a valid fit for THIS candidate count — try a smaller subset instead.
      if (leafIds(rawTree).length !== subset.length) continue;
      const tree = applyPreferredWeights(rawTree, subsetById, preferredWidths);
      if (fitsRegion(tree, subsetById, viewport)) {
        const visibleIds = new Set(subset.map(p => p.id));
        const hidden = panels.filter(p => !visibleIds.has(p.id) && p.status !== "expired");
        return { tree, visible: subset, minimized: hidden, preset: name };
      }
    }
  }

  const fallback = candidates[0] ? [candidates[0]] : [];
  const visibleIds = new Set(fallback.map(p => p.id));
  const hidden = panels.filter(p => !visibleIds.has(p.id) && p.status !== "expired");
  return { tree: fallback[0] ? buildPreset("focus", [fallback[0].id]) : null, visible: fallback, minimized: hidden, preset: "focus" };
}
