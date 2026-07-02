/**
 * Builds the layout/panel inventory injected into the agent's system prompt
 * (PromptContext.layoutContext). Pure — takes the panel registry + tier +
 * active id and returns a serializable snapshot the agent reasons about.
 */

import type { Panel } from "$lib/stores/panel-registry";
import { getContract } from "$lib/panel-contracts";
import { validatePanel } from "$lib/stores/panel-registry";
import type { LayoutTier } from "$lib/layout/presets";
import { SLOTS_BY_TIER } from "$lib/layout/presets";

export interface LayoutContextSnapshot {
  layout: string;
  slotsCap: number;
  slotsUsed: number;
  active: string | null;
  panels: Array<{
    id: string;
    type: string;
    status: string;
    fillable: boolean;
    minimized?: boolean;
    title: string;
    fields?: Array<{ key: string; label: string; required: boolean; filled: boolean; hint?: string; optionsRef?: string }>;
    validation?: { ok: boolean; missing?: string[]; invalid?: Array<{ key: string; error: string }> };
    actions?: string[];
  }>;
}

export function buildLayoutContext(
  panels: Panel[],
  tier: LayoutTier,
  activePanelId: string | null,
): LayoutContextSnapshot {
  const slotsCap = SLOTS_BY_TIER[tier];
  const nonMinimized = panels.filter(p => !p.minimized && p.status !== "expired");
  return {
    layout: tier,
    slotsCap,
    slotsUsed: tier === "mobile" ? panels.filter(p => p.status !== "expired").length : nonMinimized.length,
    active: activePanelId,
    panels: panels
      .filter(p => p.status !== "expired")
      .map(p => {
        const contract = getContract(p.type);
        const fields = contract.fields;
        return {
          id: p.id,
          type: p.type,
          status: p.status,
          fillable: contract.fillable,
          minimized: p.minimized,
          title: p.title,
          fields: fields?.map(f => ({
            key: f.key,
            label: f.label,
            required: f.required,
            filled: p.data[f.key] != null && p.data[f.key] !== "",
            hint: f.hint,
            optionsRef: f.optionsRef,
          })),
          validation: contract.fillable ? validatePanel(p) : undefined,
          actions: contract.actions ? Object.keys(contract.actions).filter(a => !contract.actions![a].destructive) : undefined,
        };
      }),
  };
}
