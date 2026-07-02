# Layout, FAB, and Agent Panel-Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the panel systems, replace the flat grid with a composable layout tree, ship a bottom-right salience-driven FAB dock, fix the mobile stack with a tab switcher, and give the agent validated layout-management + content-action tools — eliminating duplicate-panel and silent-fill failures.

**Architecture:** A single `Panel[]` registry backs everything. A `PanelContract` per type declares fields, instances, layout preferences, and safe actions — one source of truth the UI renders, the agent discovers, and the store validates. Layout is a recursive `LayoutRegion` tree (not a flat grid); mobile stays single-active+tabs. New agent tools (`openPanel`/`closePanel`/`focusPanel`/`minimizePanel`/`fillPanelField`/`clickPanelAction`/`verifyPanel`) operate on the registry with validation and single-instance enforcement.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, TypeScript strict, Tailwind v4 tokens, Bun test.

**Spec:** `docs/superpowers/specs/2026-07-03-layout-fab-agent-design.md`

---

## Phasing (each phase ships a working app)

| Phase | Scope | Working state after |
|---|---|---|
| **1** | Panel contracts + unified registry | App runs on new registry; old FAB/layout still functional |
| **2** | Layout tree + placement (replaces flat grid) | Desktop renders composable regions |
| **3** | Adaptive ProductDetailContent (3 variants) | Detail panel reshapes to slot |
| **4** | FAB dock (bottom-right) + mobile tab stack | New FAB + mobile switcher live |
| **5** | Agent tools + prompt integration | Agent manages layout + fills panels safely |

**Verification gate after every phase:** `bun run check` clean, `bun test` green, `bun run build` succeeds.

---

## File Structure

**New files:**
- `src/lib/panel-contracts.ts` — `CONTRACTS` registry: fields, instances, layoutPref, actions per type
- `src/lib/layout/tree.ts` — `LayoutRegion` types + tree mutation helpers
- `src/lib/layout/presets.ts` — named layout presets per breakpoint
- `src/lib/layout/place.ts` — `selectLayout()` panel→leaf assignment
- `src/lib/components/shell/Region.svelte` — recursive split renderer
- `src/lib/components/shell/PanelHost.svelte` — measures slot, computes aspect
- `src/lib/components/shell/Dock.svelte` — bottom-right FAB dock
- `src/lib/components/shell/MobileStack.svelte` — mobile single-active + tab bar

**Modified:**
- `src/lib/stores/ui.svelte.ts` — unified `Panel[]`, `open/close/focus/minimize`, layoutTree, single-instance, validated fill
- `src/lib/components/shell/canvas-layout.ts` — delegates to layout modules
- `src/lib/components/shell/CanvasGrid.svelte` — CSS tier alignment
- `src/lib/components/AppShell.svelte` — replace FAB + if-chain
- `src/lib/components/DynamicPanel.svelte` — read fields from CONTRACTS
- `src/lib/components/ProductDetailContent.svelte` — adaptive variants
- `src/lib/ai/tool-registry.ts` — 7 new tools + summaries
- `src/lib/ai/client-context.ts` — wire handlers
- `src/lib/ai/prompt.ts` — layoutContext + panel inventory
- `src/lib/stores/chat.svelte.ts`, `live-voice.svelte.ts` — replace activePanels
- `src/app.css` — radius shift

**Tests:**
- `src/__tests__/panel-contracts.test.ts`
- `src/__tests__/layout/tree.test.ts`
- `src/__tests__/ui-registry.test.ts`

---

# Phase 1 — Panel Contracts + Unified Registry

Foundation. Everything else depends on these two abstractions.

### Task 1.1: Panel contracts registry

**Files:** Create `src/lib/panel-contracts.ts`

- [ ] **Step 1: Write failing test** — Create `src/__tests__/panel-contracts.test.ts`:

```ts
import { describe, test, expect } from "bun:test";
import { CONTRACTS, getContract, PANEL_TYPES } from "$lib/panel-contracts";

describe("panel-contracts", () => {
  test("every PANEL_TYPES entry has a contract", () => {
    for (const type of PANEL_TYPES) {
      const c = CONTRACTS[type];
      expect(c, `missing contract for ${type}`).toBeDefined();
      expect(["single", "multiple"]).toContain(c.instances);
      expect(Array.isArray(c.layoutPreference)).toBe(true);
    }
  });
  test("form-collecting panels are single-instance", () => {
    expect(CONTRACTS.checkout.instances).toBe("single");
    expect(CONTRACTS["address-select"].instances).toBe("single");
    expect(CONTRACTS["address-form"].instances).toBe("single");
  });
  test("browse panels are multiple-instance", () => {
    expect(CONTRACTS["product-detail"].instances).toBe("multiple");
    expect(CONTRACTS["order-tracking"].instances).toBe("multiple");
  });
  test("checkout declares required fillable fields", () => {
    const fields = CONTRACTS.checkout.fields ?? [];
    const keys = fields.map(f => f.key);
    expect(keys).toContain("recipientName");
    expect(keys).toContain("deliveryCity");
    expect(keys).toContain("deliveryDate");
    expect(fields.find(f => f.key === "recipientName")?.required).toBe(true);
  });
  test("getContract falls back for unknown type", () => {
    const fallback = getContract("nope" as never);
    expect(fallback.instances).toBe("multiple");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `bun test src/__tests__/panel-contracts.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `src/lib/panel-contracts.ts`:

```ts
/**
 * Declarative contract per panel type. ONE source of truth the UI renders from,
 * the agent discovers, and the store enforces. Eliminates the duplicate-panel
 * and silent-fill failures: single-instance enforcement, validated writes, and
 * a discoverable schema for the agent.
 */

export type PanelType =
  | "products" | "conversation" | "cart" | "product-detail" | "lists" | "sessions"
  // agent-driven dynamic panels
  | "address-select" | "address-form" | "checkout"
  | "wishlist" | "delivery-info" | "order-confirmation" | "order-tracking";

export const PANEL_TYPES: PanelType[] = [
  "products", "conversation", "cart", "product-detail", "lists", "sessions",
  "address-select", "address-form", "checkout",
  "wishlist", "delivery-info", "order-confirmation", "order-tracking",
];

export type AspectTier = "compact" | "portrait" | "landscape" | "square";

export interface PanelField {
  key: string;
  label: string;
  type: "text" | "tel" | "date" | "textarea" | "select" | "number";
  required: boolean;
  placeholder?: string;
  hint?: string;
  /** Inline validation; returns error string or null. */
  validate?: (value: unknown, allData: Record<string, unknown>) => string | null;
  /** Suggest valid options (e.g. deliverable cities). */
  options?: (allData: Record<string, unknown>) => Promise<{ value: string; label: string }[]>;
}

export interface PanelAction {
  run: (ctx: PanelActionContext, ...args: unknown[]) => unknown;
  destructive: boolean;
}

export interface PanelActionContext {
  panelId: string;
  data: Record<string, unknown>;
  update: (data: Record<string, unknown>) => void;
}

export interface PanelContract {
  type: PanelType;
  /** "single" = at most one open (form collectors); "multiple" = many allowed. */
  instances: "single" | "multiple";
  fillable: boolean;
  fields?: PanelField[];
  layoutPreference: AspectTier[];
  minWidth?: number;
  minHeight?: number;
  actions?: Record<string, PanelAction>;
  icon?: string; // lucide name for the FAB/tab
}

const FALLBACK: PanelContract = {
  type: "products" as PanelType, instances: "multiple", fillable: false, layoutPreference: ["landscape", "portrait"],
};

// ── Validators ─────────────────────────────────────────────────────────────

const dateFuture = (v: unknown): string | null => {
  if (!v) return null;
  const d = new Date(v as string);
  if (isNaN(d.getTime())) return "Must be a valid date (YYYY-MM-DD)";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (d < today) return "Must be today or a future date";
  return null;
};

// ── Contracts ──────────────────────────────────────────────────────────────

export const CONTRACTS: Record<PanelType, PanelContract> = {
  products:        { type: "products", instances: "multiple", fillable: false, layoutPreference: ["landscape", "square", "portrait"], icon: "layers" },
  conversation:    { type: "conversation", instances: "single", fillable: false, layoutPreference: ["portrait", "landscape"], icon: "message-square" },
  cart:            { type: "cart", instances: "single", fillable: false, layoutPreference: ["portrait", "compact"], icon: "shopping-bag" },
  "product-detail":{ type: "product-detail", instances: "multiple", fillable: false, layoutPreference: ["landscape", "portrait", "compact"], icon: "eye" },
  lists:           { type: "lists", instances: "single", fillable: false, layoutPreference: ["portrait", "landscape"], icon: "heart" },
  sessions:        { type: "sessions", instances: "single", fillable: false, layoutPreference: ["portrait", "landscape"], icon: "history" },

  "address-select":{ type: "address-select", instances: "single", fillable: true, layoutPreference: ["portrait", "compact"], icon: "map-pin",
    fields: [
      { key: "recipientName", label: "Recipient Name", type: "text", required: true },
      { key: "recipientPhone", label: "Phone", type: "tel", required: true },
      { key: "streetAddress", label: "Street Address", type: "textarea", required: true },
      { key: "city", label: "City", type: "text", required: true },
    ],
  },
  "address-form":  { type: "address-form", instances: "single", fillable: true, layoutPreference: ["portrait", "compact"], icon: "map-pin",
    fields: [
      { key: "label", label: "Label", type: "text", required: true, placeholder: "Home, Office..." },
      { key: "recipientName", label: "Recipient Name", type: "text", required: true },
      { key: "recipientPhone", label: "Phone", type: "tel", required: true },
      { key: "streetAddress", label: "Street Address", type: "textarea", required: true },
      { key: "city", label: "City", type: "text", required: true },
    ],
  },
  checkout:        { type: "checkout", instances: "single", fillable: true, layoutPreference: ["portrait", "compact"], icon: "send",
    fields: [
      { key: "recipientName", label: "Recipient Name", type: "text", required: true },
      { key: "recipientPhone", label: "Recipient Phone", type: "tel", required: true },
      { key: "streetAddress", label: "Street Address", type: "textarea", required: true },
      { key: "deliveryCity", label: "Delivery City", type: "text", required: true, hint: "Use listDeliveryCities to get valid options" },
      { key: "deliveryDate", label: "Delivery Date", type: "date", required: true, placeholder: "YYYY-MM-DD", hint: "Today or future, Asia/Colombo", validate: dateFuture },
      { key: "senderName", label: "Your Name", type: "text", required: true },
      { key: "giftMessage", label: "Gift Message (optional)", type: "textarea", required: false },
    ],
  },
  wishlist:        { type: "wishlist", instances: "single", fillable: false, layoutPreference: ["portrait", "landscape"], icon: "heart" },
  "delivery-info": { type: "delivery-info", instances: "multiple", fillable: false, layoutPreference: ["compact", "portrait"], icon: "truck" },
  "order-confirmation": { type: "order-confirmation", instances: "multiple", fillable: false, layoutPreference: ["compact", "portrait"], icon: "check" },
  "order-tracking":{ type: "order-tracking", instances: "multiple", fillable: false, layoutPreference: ["portrait", "compact"], icon: "truck" },
};

export function getContract(type: string): PanelContract {
  return (CONTRACTS as Record<string, PanelContract>)[type] ?? FALLBACK;
}
```

- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit** — `feat(panel-contracts): add declarative panel contracts registry`.

### Task 1.2: Unified Panel registry types

**Files:** Modify `src/lib/stores/ui.svelte.ts` (types section). Test: `src/__tests__/ui-registry.test.ts`.

- [ ] **Step 1: Write failing test** for the new `Panel` shape and the registry's single-instance enforcement. Because the store uses runes (not testable in plain bun), the test exercises the *pure* registry logic extracted to a runes-free module — `src/lib/stores/panel-registry.ts`.

Create `src/__tests__/ui-registry.test.ts`:

```ts
import { describe, test, expect } from "bun:test";
import { createPanel, applyFill, canOpen, validatePanel } from "$lib/stores/panel-registry";
import type { Panel } from "$lib/stores/panel-registry";

describe("panel-registry pure logic", () => {
  test("createPanel for static uses the given id", () => {
    const p = createPanel("cart", { kind: "static" });
    expect(p.id).toBe("cart");
    expect(p.kind).toBe("static");
    expect(p.status).toBe("idle");
  });
  test("createPanel for dynamic gets a uuid", () => {
    const p = createPanel("checkout", { kind: "dynamic", resolve: () => {} });
    expect(p.kind).toBe("dynamic");
    expect(p.id).not.toBe("checkout");
    expect(p.resolve).toBeDefined();
  });
  test("canOpen returns existing for single-instance", () => {
    const existing = createPanel("checkout", { kind: "dynamic", resolve: () => {} });
    const result = canOpen([existing], "checkout");
    expect(result).toBe(existing); // reuse
  });
  test("canOpen returns null when no existing single-instance", () => {
    expect(canOpen([], "checkout")).toBeNull();
  });
  test("canOpen returns null for multiple-instance even if one exists", () => {
    const existing = createPanel("product-detail", { kind: "static" });
    expect(canOpen([existing], "product-detail")).toBeNull();
  });
  test("applyFill validates and writes", () => {
    const p = createPanel("checkout", { kind: "dynamic", resolve: () => {} }) as Panel;
    p.data = {};
    const ok = applyFill(p, "deliveryDate", "2020-01-01"); // past → invalid
    expect(ok.ok).toBe(false);
    const ok2 = applyFill(p, "deliveryDate", "2099-01-01");
    expect(ok2.ok).toBe(true);
    expect(p.data.deliveryDate).toBe("2099-01-01");
  });
  test("applyFill rejects unknown field", () => {
    const p = createPanel("checkout", { kind: "dynamic", resolve: () => {} }) as Panel;
    const r = applyFill(p, "nope", "x");
    expect(r.ok).toBe(false);
  });
  test("validatePanel reports missing required + invalid", () => {
    const p = createPanel("checkout", { kind: "dynamic", resolve: () => {} }) as Panel;
    p.data = { deliveryDate: "2020-01-01" }; // invalid date, missing requireds
    const v = validatePanel(p);
    expect(v.ok).toBe(false);
    expect(v.missing).toContain("recipientName");
    expect(v.invalid.find(i => i.key === "deliveryDate")).toBeTruthy();
  });
  test("validatePanel ok when all required present + valid", () => {
    const p = createPanel("checkout", { kind: "dynamic", resolve: () => {} }) as Panel;
    p.data = {
      recipientName: "A", recipientPhone: "+9477", streetAddress: "x",
      deliveryCity: "Galle", deliveryDate: "2099-01-01", senderName: "B",
    };
    expect(validatePanel(p).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL (module not found).
- [ ] **Step 3: Implement** `src/lib/stores/panel-registry.ts` (runes-free, pure, unit-testable):

```ts
/**
 * Pure panel-registry logic (runes-free → unit-testable). The reactive
 * UIStore in ui.svelte.ts wraps these. Keeps single-instance + validation
 * rules in one place, away from Svelte reactivity.
 */
import { getContract } from "$lib/panel-contracts";

export type PanelKind = "static" | "dynamic";
export type PanelStatus = "idle" | "active" | "needs-input" | "has-update";

export interface Panel {
  id: string;
  type: import("$lib/panel-contracts").PanelType;
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
};

const STATIC_TITLES: Record<string, string> = {
  products: "Products", conversation: "Chat", cart: "Cart", "product-detail": "Details",
  lists: "Lists", sessions: "History",
};

export function createPanel(type: Panel["type"], config: OpenConfig = {}): Panel {
  const kind = config.kind ?? "static";
  return {
    id: kind === "static" ? type : crypto.randomUUID(),
    type, kind,
    title: config.title ?? STATIC_TITLES[type] ?? type,
    data: { ...(config.data ?? {}) },
    status: config.status ?? "idle",
    pinned: config.pinned,
    resolve: config.resolve,
    createdAt: Date.now(),
  };
}

/** If type is single-instance and one is open, return it (caller reuses instead of duplicating). */
export function canOpen(existing: Panel[], type: string): Panel | null {
  const contract = getContract(type);
  if (contract.instances !== "single") return null;
  return existing.find(p => p.type === type) ?? null;
}

export type FillResult = { ok: true } | { ok: false; error: string };

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

export function validatePanel(panel: Panel): ValidateResult {
  const contract = getContract(panel.type);
  const fields = contract.fields ?? [];
  const missing: string[] = [];
  const invalid: Array<{ key: string; error: string }> = [];
  for (const f of fields) {
    const v = panel.data[f.key];
    if (f.required && (v == null || v === "")) missing.push(f.key);
    else if (v != null && v !== "") {
      const err = f.validate?.(v, panel.data);
      if (err) invalid.push({ key: f.key, error: err });
    }
  }
  if (missing.length || invalid.length) return { ok: false, missing, invalid };
  return { ok: true };
}
```

- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit** — `feat(panel-registry): pure registry logic with single-instance + validation`.

### Task 1.3: Wire registry into the UI store (no rendering changes yet)

**Files:** Modify `src/lib/stores/ui.svelte.ts`. Goal: replace `openPanels: Set<PanelId>` + `panels: DynamicPanel[]` with one `panels: Panel[]`, keep all existing call sites working via adapters. No UI changes this task — the app must keep running.

- [ ] **Step 1: Read the current `ui.svelte.ts`** fully to map every method referencing `openPanels`/`panels`/`showPanel`/`closeDynamicPanel`/`togglePanel`.
- [ ] **Step 2: Refactor the store.** Replace the two collections with `panels: Panel[]`. Implement:
  - `open(type, config?)` — consults `canOpen`; if single-instance existing, `focus` + return it; else push new `createPanel`.
  - `close(idOrType)` — finds by id or (for static) by type; resolves dynamic with `null`; removes.
  - `toggle(id)` — open if absent, close if present (static only).
  - `focus(id)` — sets `activePanelId` + bumps `createdAt` (recency).
  - `minimize(id)` / `restore(id)` — toggle `minimized`.
  - `fillPanelField(id, key, value)` → calls `applyFill` on the matched panel.
  - `verifyPanel(id)` → calls `validatePanel`.
  - `isOpen(idOrType)` / `isOpenType(type)` — adapt to the new array.
  - Keep `showPanel`/`closeDynamicPanel`/`openProductDetail`/`closeProductDetail` as thin adapters delegating to `open`/`close` so existing callers (tool registry, client-context, components) keep working.
  - `activePanelId = $state<string | null>(null)`.
- [ ] **Step 3: Update persistence** — serialize `panels` minus `resolve`; on reload, mark dynamic panels `status: "needs-input"` is wrong post-reload; set them `status: "expired"` (add `"expired"` to `PanelStatus`) so DynamicPanel can show "expired, ask agent again." Static panels reopen.
- [ ] **Step 4: Add `"expired"` to PanelStatus** in both `panel-registry.ts` and the store's local re-export.
- [ ] **Step 5: Run `bun run check`** — fix any call-site type errors (AppShell's `ui.isOpen(...)`, `ui.togglePanel(...)`, `ui.openProductDetail(...)` etc. must still compile via adapters).
- [ ] **Step 6: Run `bun run build`** → succeeds (no visual change expected).
- [ ] **Step 7: Commit** — `refactor(ui): unify panel systems into single Panel[] registry`.

### Task 1.4: DynamicPanel reads fields from contracts

**Files:** Modify `src/lib/components/DynamicPanel.svelte`.

- [ ] **Step 1: Delete** the hardcoded `checkoutFields` (lines 32-40) and `addressFields` (23-30) + the `getFields()` helper.
- [ ] **Step 2: Import** `getContract` and derive fields: `const fields = $derived(getContract(panel.type).fields ?? [])`.
- [ ] **Step 3: Replace** the form `{#each checkoutFields ...}` and `{#each addressFields ...}` blocks with `{#each fields as field (field.key)}` using the same field-input rendering (text/textarea/tel/date). The `bind:value={panel.data[field.key]}` stays — but now wrap user writes through `applyFill` too so validation is symmetric (add an `onchange`/`onblur` handler that calls `ui.fillPanelField` and surfaces errors).
- [ ] **Step 4: Add an expired state** — if `panel.status === "expired"`, render a notice ("This panel expired after a page reload. Ask the agent to open it again.") instead of the form.
- [ ] **Step 5: Run `bun run check` + `bun run build`.**
- [ ] **Step 6: Commit** — `refactor(DynamicPanel): render fields from panel contracts`.

---

# Phase 2 — Layout Engine: Tree Regions + Placement

### Task 2.1: LayoutRegion tree + mutation helpers

**Files:** Create `src/lib/layout/tree.ts`. Test: `src/__tests__/layout/tree.test.ts`.

- [ ] **Step 1: Write failing test**:

```ts
import { describe, test, expect } from "bun:test";
import { wrapInSplit, removeLeaf, normalizeTree, findLeaf, type LayoutRegion } from "$lib/layout/tree";

describe("layout tree", () => {
  const leaf = (id: string): LayoutRegion => ({ kind: "leaf", panelId: id });
  const A = leaf("a"), B = leaf("b"), C = leaf("c");

  test("wrapInSplit row", () => {
    expect(wrapInSplit("row", [A, B])).toEqual({ kind: "split", orientation: "row", children: [A, B] });
  });
  test("removeLeaf removes leaf and collapses orphaned split", () => {
    const tree: LayoutRegion = { kind: "split", orientation: "row", children: [A, B] };
    const result = removeLeaf(tree, "b");
    expect(result).toEqual(A); // single-child split collapsed to its child
  });
  test("removeLeaf on root leaf returns empty", () => {
    expect(removeLeaf(A, "a")).toBeNull();
  });
  test("removeLeaf in nested tree", () => {
    const tree: LayoutRegion = { kind: "split", orientation: "row", children: [A, { kind: "split", orientation: "column", children: [B, C] }] };
    expect(removeLeaf(tree, "b")).toEqual({ kind: "split", orientation: "row", children: [A, C] });
  });
  test("normalizeTree collapses single-child splits recursively", () => {
    const tree: LayoutRegion = { kind: "split", orientation: "row", children: [{ kind: "split", orientation: "column", children: [A] }] };
    expect(normalizeTree(tree)).toEqual(A);
  });
  test("findLeaf", () => {
    const tree: LayoutRegion = { kind: "split", orientation: "row", children: [A, B] };
    expect(findLeaf(tree, "b")?.panelId).toBe("b");
    expect(findLeaf(tree, "z")).toBeNull();
  });
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `src/lib/layout/tree.ts`:

```ts
export type LayoutRegion =
  | { kind: "leaf"; panelId: string }
  | { kind: "split"; orientation: "row" | "column"; children: LayoutRegion[]; weights?: number[] };

export function wrapInSplit(orientation: "row" | "column", children: LayoutRegion[], weights?: number[]): LayoutRegion {
  return { kind: "split", orientation, children, weights };
}

export function findLeaf(tree: LayoutRegion | null, panelId: string): { kind: "leaf"; panelId: string } | null {
  if (!tree) return null;
  if (tree.kind === "leaf") return tree.panelId === panelId ? tree : null;
  for (const c of tree.children) { const f = findLeaf(c, panelId); if (f) return f; }
  return null;
}

export function removeLeaf(tree: LayoutRegion | null, panelId: string): LayoutRegion | null {
  if (!tree) return null;
  if (tree.kind === "leaf") return tree.panelId === panelId ? null : tree;
  const children = tree.children.map(c => removeLeaf(c, panelId)).filter((c): c is LayoutRegion => c !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0]; // collapse orphaned split
  return { ...tree, children };
}

export function normalizeTree(tree: LayoutRegion | null): LayoutRegion | null {
  if (!tree || tree.kind === "leaf") return tree;
  const children = tree.children.map(normalizeTree).filter((c): c is LayoutRegion => c !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { ...tree, children };
}

export function leafIds(tree: LayoutRegion | null): string[] {
  if (!tree) return [];
  if (tree.kind === "leaf") return [tree.panelId];
  return tree.children.flatMap(leafIds);
}
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(layout): LayoutRegion tree + mutation helpers`.

### Task 2.2: Presets + placement

**Files:** Create `src/lib/layout/presets.ts`, `src/lib/layout/place.ts`.

- [ ] **Step 1: Implement presets** — `src/lib/layout/presets.ts`:

```ts
import type { LayoutRegion } from "./tree";
import type { Panel } from "$lib/stores/panel-registry";

export type LayoutTier = "mobile" | "split-small" | "split-wide";
export type PresetName = "focus" | "browse" | "compare" | "chat-browse";

export const SLOTS_BY_TIER: Record<LayoutTier, number> = { mobile: 1, "split-small": 2, "split-wide": 3 };

/** Build a layout tree from a preset name + the open panels (already ordered by priority). */
export function buildPreset(name: PresetName, panelIds: string[]): LayoutRegion | null {
  const leaf = (id: string) => ({ kind: "leaf" as const, panelId: id });
  const ids = panelIds.slice(0, name === "focus" ? 1 : name === "compare" ? 3 : 2);
  if (ids.length === 0) return null;
  if (ids.length === 1) return leaf(ids[0]);
  if (name === "chat-browse" && ids.length >= 3) {
    // products | (chat / detail)
    return { kind: "split", orientation: "row", children: [leaf(ids[0]), { kind: "split", orientation: "column", children: [leaf(ids[1]), leaf(ids[2])] }] };
  }
  return { kind: "split", orientation: "row", children: ids.map(leaf) };
}

export function pickDefaultPreset(panels: Panel[]): PresetName {
  const hasProducts = panels.some(p => p.type === "products");
  const hasChat = panels.some(p => p.type === "conversation");
  const hasDetail = panels.some(p => p.type === "product-detail");
  if (hasProducts && hasChat && hasDetail) return "chat-browse";
  if (hasProducts && hasDetail) return "compare";
  if (hasProducts) return "browse";
  return "focus";
}
```

- [ ] **Step 2: Implement placement** — `src/lib/layout/place.ts`:

```ts
import type { Panel } from "$lib/stores/panel-registry";
import { getContract, type AspectTier } from "$lib/panel-contracts";
import type { LayoutTier } from "./presets";
import { SLOTS_BY_TIER, buildPreset, pickDefaultPreset, type PresetName } from "./presets";
import type { LayoutRegion } from "./tree";

/** Priority sort: needs-input > pinned > recency. Within tier, oldest first (FIFO). */
function priority(panel: Panel): number {
  if (panel.status === "needs-input") return 3;
  if (panel.pinned) return 2;
  return 1;
}

export function selectVisiblePanels(panels: Panel[], tier: LayoutTier): Panel[] {
  if (tier === "mobile") return panels; // mobile renders all as tabs; no slot eviction
  const cap = SLOTS_BY_TIER[tier];
  const nonMinimized = panels.filter(p => !p.minimized);
  // needs-input bypasses cap; others fill remaining slots FIFO.
  const needsInput = nonMinimized.filter(p => p.status === "needs-input");
  const rest = nonMinimized
    .filter(p => p.status !== "needs-input")
    .sort((a, b) => priority(b) - priority(a) || a.createdAt - b.createdAt);
  const remaining = Math.max(0, cap - needsInput.length);
  return [...needsInput, ...rest.slice(0, remaining)];
}

export function selectLayout(panels: Panel[], tier: LayoutTier, preset?: PresetName): { tree: LayoutRegion | null; visible: Panel[]; minimized: Panel[] } {
  const visible = selectVisiblePanels(panels, tier);
  const visibleIds = visible.map(p => p.id);
  const minimized = panels.filter(p => !visibleIds.includes(p.id));
  const name = preset ?? pickDefaultPreset(visible);
  // mark non-visible open panels minimized
  for (const p of panels) p.minimized = !visibleIds.includes(p.id) && tier !== "mobile";
  return { tree: buildPreset(name, visibleIds), visible, minimized };
}
```

- [ ] **Step 3: Wire** into `ui.svelte.ts` — add `preset = $state<PresetName | undefined>(undefined)` and a derived `layout = $derived(selectLayout(this.panels, this.tier, this.preset))`. Add `tier` getter mapping `layout` ("split"|"stacked") + window width to `LayoutTier` (split-wide needs ≥1024; listen to a second matchMedia for 1024).
- [ ] **Step 4: Run `bun run check`.**
- [ ] **Step 5: Commit** — `feat(layout): presets + placement with FIFO+priority eviction`.

### Task 2.3: Region + PanelHost renderers

**Files:** Create `src/lib/components/shell/Region.svelte`, `PanelHost.svelte`. Modify `CanvasGrid.svelte` (CSS tiers), `canvas-layout.ts` (delegate), `AppShell.svelte` (mount Region).

- [ ] **Step 1: `PanelHost.svelte`** — measures its slot via `ResizeObserver`, computes `aspect` from width/height ratio, renders the right panel component variant. Switch on `panel.type` → `<PanelContent>`, `<DynamicPanel>`, `<ProductThreadsTile>`, `<ConversationTile>`. Pass `aspect` to panels that use it (ProductDetailContent).
- [ ] **Step 2: `Region.svelte`** — recursive: if `region.kind === "leaf"`, find the panel + render `<PanelHost>`. If split, render a flex row/col and recurse into children with `{#each}`.
- [ ] **Step 3: `CanvasGrid.svelte` CSS** — `grid-2` at ≥640px, `grid-3` at ≥1024px; remove `grid-1` max-width rule. (Tree handles its own flex layout; the grid wrapper just provides padding + the home/mobile special cases.)
- [ ] **Step 2: `AppShell.svelte`** — replace the `{#if isHome}…{:else}{#if hasProducts && ui.isSplit}…` chain with: `{#if isHome}<HomeHero/>{:else if ui.isSplit}<Region region={ui.layout.tree}/>{/if}`. The mobile branch (`{#if !ui.isSplit}`) is replaced in Phase 4; for now keep old MobileSheets but reading from the new registry.
- [ ] **Step 5: Run `bun run check` + `bun run build`.**
- [ ] **Step 6: Commit** — `feat(layout): recursive Region/PanelHost renderers`.

---

# Phase 3 — Adaptive ProductDetailContent

### Task 3.1: Three layout variants

**Files:** Rewrite `src/lib/components/ProductDetailContent.svelte`.

- [ ] **Step 1: Add `aspect` prop** (`"landscape" | "portrait" | "compact"`).
- [ ] **Step 2: Implement landscape variant** — sticky image (~40% width) left, scrollable details right (title/price/description/attributes/variants/button) in a 2-col flex.
- [ ] **Step 3: Implement compact variant** — single row: thumb image + title/price + add button; no variants/attributes/description.
- [ ] **Step 4: Keep portrait variant** — the current vertical stack (refactor into the same component, conditional layout).
- [ ] **Step 5: Default** aspect to "portrait" when unset (back-compat).
- [ ] **Step 6: PanelHost passes aspect** based on slot measurement (Phase 2.3 wired this).
- [ ] **Step 7: Run check + build + manual visual in dev.**
- [ ] **Step 8: Commit** — `feat(product-detail): adaptive landscape/portrait/compact variants`.

---

# Phase 4 — FAB Dock + Mobile Tab Stack

### Task 4.1: Bottom-right Dock

**Files:** Create `src/lib/components/shell/Dock.svelte`. Modify `AppShell.svelte`, `cart-animation.ts`.

- [ ] **Step 1: Build Dock** — bottom-right, z-58. Reads `ui.panels`; computes salient chips (needs-input / has-update / badge>0 / minimized / pinned-open) vs chevron-hidden. Chevron expands fan-out (z-59), collapses on outside-click/Esc. Each chip: icon (from contract) + badge + onclick → `ui.focus(id)` (and `ui.restore(id)` if minimized). Options `⚙` in dock footer opens the existing options dialog.
- [ ] **Step 2: Move flyToCart target** — `cartButtonEl` binds to the cart chip inside Dock. Pass up via a callback or bind. Update `AppShell`'s bump effect to read the chip element.
- [ ] **Step 3: Remove the old `.float-controls`** top-right markup from AppShell.
- [ ] **Step 4: Radius global shift** — in `src/app.css`, swap card/tile/chip default from `--radius-lg` to `--radius-md` (one token-reference change thanks to the literal sweep).
- [ ] **Step 5: Run check + build.**
- [ ] **Step 6: Commit** — `feat(dock): bottom-right salience-driven FAB dock`.

### Task 4.2: Mobile tab stack

**Files:** Create `src/lib/components/shell/MobileStack.svelte`. Modify `AppShell.svelte`.

- [ ] **Step 1: Build MobileStack** — renders the active panel (`ui.activePanelId`) full-sheet + a horizontal tab bar (one tab per open panel: icon + badge; `+` opens the Dock chevron). Tab tap → `ui.focus(id)`. Swipe-down/X → `ui.close(id)`.
- [ ] **Step 2: Replace** AppShell's `{#if !ui.isSplit}` MobileSheet block with `<MobileStack />`. Delete the old per-panel MobileSheet instances.
- [ ] **Step 3: Fix missing-on-mobile** — conversation + sessions now render as tabs (they flow through the registry from Phase 1).
- [ ] **Step 4: Live-voice** — when `liveActive`, auto-focus the conversation tab + show live badge.
- [ ] **Step 5: Run check + build + manual mobile-width test (browser devtools).**
- [ ] **Step 6: Commit** — `feat(mobile): single-active panel + tab switcher stack`.

---

# Phase 5 — Agent Tools + Prompt Integration

### Task 5.1: New tools + summarize entries

**Files:** Modify `src/lib/ai/tool-registry.ts`.

- [ ] **Step 1: Add tools** (in `TOOLS`): `openPanel`, `closePanel`, `focusPanel`, `minimizePanel`, `fillPanelField`, `clickPanelAction`, `verifyPanel`. Each `executeClient` calls the matching `ctx.on...` handler.
  - `openPanel`: `{type, data?, split?}` → `ctx.onOpenPanel`. Returns `{id, status}`.
  - `fillPanelField`: `{panelId|panelType, key, value}` → `ctx.onFillPanelField` → returns `{ok, error?}`.
  - `verifyPanel`: `{panelId|panelType}` → `ctx.onVerifyPanel` → `{ok, missing?, invalid?}`.
  - `clickPanelAction`: `{panelId|panelType, action, args?}` → gated via contract `actions` (destructive:false only).
- [ ] **Step 2: Extend `ClientToolContext`** with `onOpenPanel`, `onClosePanel`, `onFocusPanel`, `onMinimizePanel`, `onFillPanelField`, `onClickPanelAction`, `onVerifyPanel`.
- [ ] **Step 3: Extend `summarizeToolCall`** switch with cases for all 7 new tools.
- [ ] **Step 4: Keep** `openProductDetail`/`closeProductDetail`/`selectAddress`/`showCheckoutPanel` as thin wrappers (delegate to `openPanel`/`closePanel`) so the prompt's domain terms stay clear.
- [ ] **Step 5: Run check + test.**
- [ ] **Step 6: Commit** — `feat(tools): 7 layout/content panel tools with validation`.

### Task 5.2: Wire client-context handlers

**Files:** Modify `src/lib/ai/client-context.ts`.

- [ ] **Step 1: Add handlers** delegating to `ui.open/close/focus/minimize/fillPanelField/clickAction/verifyPanel`.
- [ ] **Step 2: For `onOpenPanel`** — pass `split` through to `ui.open` (Phase 2 tree mutation).
- [ ] **Step 3: Run check.**
- [ ] **Step 4: Commit** — `feat(client-context): wire panel management handlers`.

### Task 5.3: Prompt integration — layoutContext + panel inventory

**Files:** Modify `src/lib/ai/prompt.ts`, `src/lib/stores/chat.svelte.ts`, `src/lib/stores/live-voice.svelte.ts`.

- [ ] **Step 1: Add to `PromptContext`**: `layoutContext?: { layout, slots: {cap,used}, visible, minimized, active }` and `panelInventory?: Array<{id, type, status, fillable, fields, validation, actions}>`.
- [ ] **Step 2: Build helpers** in `prompt.ts` — `buildLayoutContext(ui)`, `buildPanelInventory(ui)` (derive from `ui.panels` + contracts; include field `filled` booleans + `validation` via `validatePanel`).
- [ ] **Step 3: Add directive text** to BASE_PROMPT — LAYOUT AWARENESS (minimize before opening on full desktop; focus to direct attention) + PANEL CONTRACTS (fill silently in live mode, confirm in voice; verifyPanel before createOrder; never duplicate a single-instance panel).
- [ ] **Step 4: Replace `activePanels`** in `chat.svelte.ts:181-184` and `live-voice.svelte.ts:518-521` with the new context builders.
- [ ] **Step 5: Run check + test + manual live-mode smoke (open checkout, speak details, watch it fill).**
- [ ] **Step 6: Commit** — `feat(prompt): layoutContext + contract-derived panel inventory`.

### Task 5.4: Final verification

- [ ] **Step 1: `bun run check`** → 0 errors.
- [ ] **Step 2: `bun test`** → all green (existing + new contract/registry/tree tests).
- [ ] **Step 3: `bun run build`** → succeeds.
- [ ] **Step 4: Manual smoke** — open 4 panels on desktop (watch FIFO minimize), switch theme (orb adapts), open checkout twice (single-instance), fill via the agent in live mode (validated), mobile width (tab switcher works, conversation + sessions visible).
- [ ] **Step 5: Commit** — `chore: phase 5 verification`.

---

## Self-review notes

- **Spec coverage:** §1 (registry) → Tasks 1.1-1.4. §6 (tree) → 2.1-2.3. §3 (cap/FIFO) → 2.2. §7 (contracts) → 1.1, 1.2, 5.1-5.3. §2 (dock) → 4.1. §4 (mobile) → 4.2. §5 (tools) → 5.1-5.3. ProductDetail overhaul → 3.1. All sections covered.
- **Type consistency:** `Panel`, `PanelContract`, `LayoutRegion`, `LayoutTier`, `PresetName` defined once and reused. `applyFill`/`validatePanel` signatures match between registry and tools.
- **Placeholder scan:** None — every step has concrete code or a precise read/modify instruction with line refs.
