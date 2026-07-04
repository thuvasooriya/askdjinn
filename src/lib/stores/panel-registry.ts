/**
 * Pure panel-registry logic (runes-free → unit-testable). The reactive UIStore
 * in ui.svelte.ts wraps these. Keeps single-instance enforcement and validation
 * rules in one place, away from Svelte reactivity.
 *
 * This is the single source of truth for Panel identity and the operations the
 * store performs on the registry. The store layers reactivity (persistence,
 * $derived layout, status derivation) on top.
 */

import { getContract, type PanelType } from "$lib/panel-contracts";

export type PanelKind = "static" | "dynamic";
export type PanelStatus = "idle" | "active" | "needs-input" | "has-update" | "expired";

export interface Panel {
  id: string;
  type: PanelType;
  kind: PanelKind;
  title: string;
  data: Record<string, unknown>;
  status: PanelStatus;
  badge?: number | string;
  pinned?: boolean;
  minimized?: boolean;
  resolve?: (result: unknown) => void;
  createdAt: number;
}

export type OpenConfig = {
  kind?: PanelKind;
  title?: string;
  data?: Record<string, unknown>;
  pinned?: boolean;
  resolve?: (result: unknown) => void;
  status?: PanelStatus;
  badge?: number | string;
};

export const PANEL_TITLES: Record<string, string> = {
  products: "Products",
  conversation: "Chat",
  cart: "Cart",
  "product-detail": "Details",
  lists: "Lists",
  sessions: "History",
  "address-select": "Select Address",
  "address-form": "Address Details",
  checkout: "Create Order",
  wishlist: "Wishlist & Alerts",
  "delivery-info": "Delivery Check",
  "order-tracking": "Tracking",
  "order-confirmation": "Order Confirmed",
};

/** Create a panel record. Static panels reuse the type as id; dynamic get a uuid. */
export function createPanel(type: PanelType, config: OpenConfig = {}): Panel {
  const kind = config.kind ?? "static";
  return {
    id: kind === "static" ? type : crypto.randomUUID(),
    type,
    kind,
    title: config.title ?? PANEL_TITLES[type] ?? type,
    data: { ...(config.data ?? {}) },
    status: config.status ?? "idle",
    badge: config.badge,
    pinned: config.pinned,
    resolve: config.resolve,
    createdAt: Date.now(),
  };
}

/**
 * If the type is single-instance and one is already open, return it so the
 * caller can focus + reuse it instead of creating a duplicate. Returns null
 * when the caller should create a new panel.
 */
export function canOpen(existing: Panel[], type: string): Panel | null {
  const contract = getContract(type);
  if (contract.instances !== "single") return null;
  return existing.find(p => p.type === type) ?? null;
}

export type FillResult = { ok: true } | { ok: false; error: string };

/** Validate + write a single field. Mirrors what user edits do — symmetric. */
export function applyFill(panel: Panel, key: string, value: unknown): FillResult {
  const contract = getContract(panel.type);
  const field = contract.fields?.find(f => f.key === key);
  if (!field) return { ok: false, error: `Unknown field "${key}" for ${panel.type}` };
  const err = field.validate?.(value, panel.data) ?? null;
  if (err) return { ok: false, error: err };
  panel.data[key] = value;
  if (panel.status === "idle" || panel.status === "active") panel.status = "has-update";
  return { ok: true };
}

export type ValidateResult =
  | { ok: true }
  | { ok: false; missing: string[]; invalid: Array<{ key: string; error: string }> };

/** Full panel validation — the agent calls this (panel_verify) before destructive steps. */
export function validatePanel(panel: Panel): ValidateResult {
  const contract = getContract(panel.type);
  const fields = contract.fields ?? [];
  const missing: string[] = [];
  const invalid: Array<{ key: string; error: string }> = [];
  for (const f of fields) {
    const v = panel.data[f.key];
    if (f.required && (v == null || v === "")) {
      missing.push(f.key);
    } else if (v != null && v !== "") {
      const err = f.validate?.(v, panel.data);
      if (err) invalid.push({ key: f.key, error: err });
    }
  }
  if (missing.length || invalid.length) return { ok: false, missing, invalid };
  return { ok: true };
}
