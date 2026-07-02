/**
 * Layout presets + placement. Translates the open-panel registry into a
 * LayoutRegion tree, applying the per-breakpoint slot cap and the
 * priority+recency eviction policy (needs-input > pinned > recency, FIFO
 * within a tier).
 *
 * Mobile never evicts — every open panel becomes a tab (handled by
 * MobileStack, not the tree). Only split-small/split-wide cap visible slots.
 */

import type { LayoutRegion } from "./tree";
import type { Panel } from "$lib/stores/panel-registry";

export type LayoutTier = "mobile" | "split-small" | "split-wide";
export type PresetName = "focus" | "browse" | "compare" | "chat-browse";

/** Max visible leaves per breakpoint tier. */
export const SLOTS_BY_TIER: Record<LayoutTier, number> = {
  mobile: 1,
  "split-small": 2,
  "split-wide": 3,
};

function leaf(id: string): LayoutRegion {
  return { kind: "leaf", panelId: id };
}

/** Build a layout tree from a preset name + the ordered visible panel ids. */
export function buildPreset(name: PresetName, panelIds: string[]): LayoutRegion | null {
  const cap = name === "focus" ? 1 : name === "compare" || name === "chat-browse" ? 3 : 2;
  const ids = panelIds.slice(0, cap);
  if (ids.length === 0) return null;
  if (ids.length === 1) return leaf(ids[0]);
  if (name === "chat-browse" && ids.length >= 3) {
    // products | (chat / detail) — the compositional shape the user asked for.
    return {
      kind: "split",
      orientation: "row",
      children: [leaf(ids[0]), { kind: "split", orientation: "column", children: [leaf(ids[1]), leaf(ids[2])] }],
    };
  }
  return { kind: "split", orientation: "row", children: ids.map(leaf) };
}

/** Pick a sensible default preset from what's open.
 *  The key rule: 2+ visible panels → at least a side-by-side split ("browse"),
 *  never "focus" (which caps to 1 and makes extra panels phantom). */
export function pickDefaultPreset(panels: Panel[]): PresetName {
  if (panels.length <= 1) return "focus";
  const hasProducts = panels.some(p => p.type === "products");
  const hasChat = panels.some(p => p.type === "conversation");
  const hasDetail = panels.some(p => p.type === "product-detail");
  if (hasProducts && hasChat && hasDetail) return "chat-browse";
  if (hasProducts && hasDetail) return "compare";
  return "browse";
}
