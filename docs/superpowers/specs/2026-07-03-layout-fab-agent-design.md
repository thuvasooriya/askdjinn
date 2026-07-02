# Design — Unified Panel System, FAB Dock, Layout Engine, and Agent Layout Tools

**Date:** 2026-07-03
**Status:** Approved (pending spec review)
**Scope:** Refactor of the canvas layout engine, the floating action buttons, and the agent's panel/layout control surface.

## Goals

1. **Unify the two parallel panel systems** (`openPanels: Set` + `panels: DynamicPanel[]`) into a single ordered registry.
2. **Replace the top-right FABs** with a bottom-right collapsible dock whose chips are salience-driven (panels jump out when they have content/need input; collapse back when idle).
3. **Cap visible tiles per breakpoint** with FIFO-priority eviction that *minimizes* (never destroys) the oldest panel.
4. **Fix the mobile stack** with a single-active-panel + tab-switcher model (today it's broken: overlapping sheets, no switcher, missing panels).
5. **Give the agent layout-management + gated-content-action tools** so it can curate the layout (open/close/focus/minimize) and drive panel forms, with destructive/financial actions gated to user-only.

## Decisions (locked from brainstorming)

| Decision | Choice |
|---|---|
| Panel model | Unify `openPanels` + `panels` into one registry |
| FAB auto-show/hide | Salience-driven (jump out when content/input, collapse when idle) |
| Layout cap behavior | Cap visible tiles per breakpoint; minimize (preserve state) the oldest |
| Mobile stack UX | Single active panel + horizontal tab switcher |
| Agent scope | Layout management + content actions, with destructive/financial gated |

---

## Section 1 — Unified Panel Registry

### Single source of truth

`ui.panels: Panel[]` replaces both `openPanels: Set<PanelId>` and the dynamic `panels: DynamicPanel[]`.

```ts
type PanelKind = "static" | "dynamic";
type PanelStatus = "idle" | "active" | "needs-input" | "has-update";

interface Panel {
  id: string;                    // stable for static ("cart","lists","sessions","product-detail"); UUID for dynamic
  type: PanelType;               // "cart" | "product-detail" | "checkout" | "address-select" | ...
  kind: PanelKind;               // static vs dynamic
  title: string;
  data: Record<string, unknown>; // payload (productId for detail, form fields for checkout, etc.)
  status: PanelStatus;           // drives FAB salience + badge
  badge?: number | string;       // count (cart: 3) or marker (delivery: "!")
  pinned?: boolean;              // never auto-evicted from grid
  minimized?: boolean;           // collapsed into dock (desktop)
  resolve?: (result: unknown) => void;  // dynamic panels only
  createdAt: number;             // FIFO ordering key
}
```

Array order = display order.

### Static vs dynamic IDs

- **Static panels** reuse fixed string ids: `"cart"`, `"product-detail"`, `"lists"`, `"sessions"`, plus a new explicit `"products"` and `"conversation"` so the products tile and conversation tile flow through the same registry (eliminates the separate `conversationVisible` boolean and `hasProducts` derived gate).
- **Dynamic panels** get `crypto.randomUUID()`.

### Migration of call sites

| Old | New |
|---|---|
| `openPanel("cart")` | `open("cart", { type:"cart", kind:"static", pinned:true })` |
| `openProductDetail(id)` | `open("product-detail", { data:{productId:id}, pinned:true })` |
| `showPanel({type:"checkout"})` | `open(uuid, { type:"checkout", kind:"dynamic", resolve })` |
| `isOpen("cart")` | `panels.some(p => p.id === "cart")` |
| `togglePanel("cart")` | `toggle("cart")` |

### Status model (salience engine)

| Status | Meaning | FAB behavior |
|---|---|---|
| `idle` | Open, no activity | Lives in dock chevron |
| `has-update` | Content changed while not active (new results, cart grew) | Auto-jumps out; badge shows; collapses after user views |
| `needs-input` | Dynamic panel awaiting user action (checkout form, address-select) | Auto-jumps out; cannot be minimized |
| `active` | Currently focused/visible | No badge |

Status transitions are derived from store mutations: `cart.addItem` → cart panel `status: "has-update"`, `badge: cart.count`. User opens it → `status: "active"`, badge clears.

**"Active" semantics across layouts:** On mobile, exactly one panel is `active` (= the rendered tab). On desktop, the most-recently-interacted visible panel is `active` (used for prompt context and as the recency tiebreaker in eviction); multiple panels remain visible simultaneously. A panel the user closes/switches away from returns to `idle` (or `has-update` if its content changed since last view).

### Persistence & reload safety

- Static panels persist as `{id, type, kind, minimized}` — reopened on reload.
- Dynamic panels persist with `resolve` stripped and a synthetic `"expired"` status so a checkout that survives reload shows "expired, ask the agent again" instead of hanging its promise (fixes the current rehydration hang bug).

---

## Section 2 — Bottom-Right FAB Dock

### Position

Move from top-right to **bottom-right**, above the agent bar (which stays bottom-center). Rationale: standard FAB location, thumb-reachable on mobile, no collision with the top-center order banner.

```
┌─────────────────────────────┐
│                             │
│        [canvas tiles]       │
│                             │
│                    ┌──────┐ │
│                    │ 🛒 2 │ │  salient chips (jumped out)
│                    │ 📍!  │ │
│                    ├──────┤ │
│              [agent bar]    │  bottom-center
└─────────────────────────────┘
```

### Structure: salient chips + chevron dock

- **Salient chips** — panels that jumped out (`needs-input`, `has-update`, `badge > 0`, pinned-while-open).
- **Chevron dock** — collapsed container of hidden panels with a `⌄` toggle. Expands a vertical fan-out of all hidden panels as icon chips; collapses on chip pick or outside-click.

### Salience rules (auto-show/hide)

Two orthogonal axes compose cleanly:
- **Layout axis**: a panel either has a grid slot (in-canvas) or is `minimized` (evicted to the dock).
- **Salience axis**: a panel's chip is either jumped-out (visible) or inside the chevron (collapsed).

| Panel state | Behavior |
|---|---|
| `minimized: true` | **Always a jumped-out chip** (it lost its grid slot, so it needs a chip to remain reachable; clicking un-minimizes it, evicting whatever is now oldest) |
| `status === "needs-input"` | Always jumped out; cannot be minimized |
| `status === "has-update"` | Auto-jumps out; collapses after user views |
| `badge > 0` | Stays jumped out while badge > 0; collapses when 0 |
| `status === "idle"` and no badge and in-grid | Lives in chevron (no chip needed — it's already in the canvas) |
| `pinned: true` and open and in-grid | Jumped out as a quiet chip (so it's reachable without taking a slot it doesn't need) |

Note: a pinned panel that gets evicted (minimized) follows the minimized rule above — it becomes a jumped-out chip. Pinning protects against eviction in normal operation, but an extreme flood of `needs-input` panels can still push a pinned panel out; in that case its chip stays visible.

### Existing FAB disposition

| Current | New |
|---|---|
| Top-right cart button + badge + flyToCart target | Cart chip in bottom-right dock; `flyToCart` target moves to chip |
| Top-right MoreVertical (options) | Splits: panel-opening actions (lists, sessions, chat) → dock chips; true options (settings, new convo, re-run onboarding, clear data) → small `⚙` button in dock footer |

### Corner radius global adjustment

Shift the app-wide default radius down one step for cohesion: cards/tiles/chips/dock use `--radius-md` (0.5rem) instead of `--radius-lg` (0.75rem). Pills/badges remain `--radius-full`. The Phase-6 literal sweep from the theming refactor makes this a low-risk token swap. Will be previewable before committing.

### z-index layering (revised)

| Layer | z |
|---|---|
| Canvas tiles | 0 |
| Floating agent bubble | 54 |
| Agent bar | 55 |
| Dock (collapsed + chips) | 58 |
| Dock expanded fan-out | 59 |
| Mobile sheet + overlay | 45 / 40 |
| Order banner | 40 |
| fly-clone | 100 |

---

## Section 3 — Layout Engine: Visible-Slot Cap + FIFO Eviction

### Slots vs panels

- **Open panels** (`ui.panels`) — uncapped; could be 10.
- **Visible slots** — capped per breakpoint. Overflow → oldest non-pinned visible panel is *minimized* (state preserved), never destroyed.

### Slot caps per breakpoint (resolves the 640px/1024px dead-zone)

| Tier | Trigger | Slot cap |
|---|---|---|
| mobile | `< 640px` | 1 rendered (tab switcher holds the rest — see §4) |
| split-small | `640px–1023px` | 2 |
| split-wide | `≥ 1024px` | 3 |

`canvas-layout.ts` gains `slotsForLayout(layout)`. `gridClass` becomes just grid-template selection (`grid-2`/`grid-3`); content selection is `selectVisiblePanels(panels, cap)`.

### Eviction priority (priority + recency, not pure FIFO)

Priority order (highest wins a slot):
1. `needs-input` dynamic panels — always visible, bypass cap if necessary
2. `pinned` static panels (cart, product-detail)
3. Most recently active (recency tiebreaker)

Within the same priority, oldest is evicted first. So cart (pinned) stays even if oldest; a 4th `needs-input` panel flexes the cap; Sessions (oldest, non-pinned) yields to a new search.

### Eviction action

- Panel record stays in `ui.panels` (state/data/resolve preserved).
- Marked `minimized: true`.
- Dock chip badge reflects `status`.
- Re-clicking chip → `minimized: false`, evicts whatever is now oldest.

### AppShell `{:#if}` chain replaced

Today's fragile `{:else if}` (which accidentally made cart/lists/sessions mutually exclusive) is replaced by one reactive computation:

```ts
const visiblePanels = $derived(selectVisiblePanels(ui.panels, slotsForLayout(ui.layout)));
```

Canvas renders `{#each visiblePanels as panel}` with one generic tile wrapper. Fixes the latent mutual-exclusion bug.

### Grid CSS cleanup

- `grid-2`: 2 cols, applies at ≥640px (split-small)
- `grid-3`: 3 cols, applies at ≥1024px (split-wide)
- Drop the `grid-1` max-width-800-centered rule (slot cap handles single-tile)
- `grid-mobile` handled by §4's switcher, not the grid

### Layout context for the agent

```ts
layoutContext: {
  layout: "split-wide" | "split-small" | "mobile",
  slots: { cap: 3, used: 2 },
  visible: [{ id, type, status }],
  minimized: [{ id, type, status }],
  active: "cart",
}
```

Replaces today's `activePanels: [...openPanels, ...panels.map(type)]`.

---

## Section 4 — Mobile Stack: Single Active + Tab Switcher

### Model

Mobile renders **one panel at a time** (full-screen sheet). A horizontal **tab bar** above the dock/agent bar shows every open panel as an icon-chip with badge. Tapping a tab activates that panel; others stay open and stateful, just not rendered.

```
┌─────────────────────────────┐
│      ACTIVE PANEL           │
├─────────────────────────────┤
│  [🛒2] [📋] [📍!] [⊘] [+]    │  tab bar (active = filled); + = dock chevron
├─────────────────────────────┤
│  [dock]            [agent]   │
└─────────────────────────────┘
```

### Tab bar composition

- One tab per open panel from `ui.panels`.
- Icon per type (cart→bag, lists→heart, checkout→credit-card — small icon map).
- Badge if `has-update`/`needs-input`/`badge > 0`.
- Active tab filled with accent.
- Trailing `+` is the dock chevron (minimized panels + options).
- Hidden when zero open panels (home hero shows).

### Active panel selection

- `ui.activePanelId: string | null`.
- Opening a panel sets it active.
- Closing active → auto-activate next tab, or home if none.
- Layout engine doesn't change `activePanelId` on mobile; every open panel gets a tab. **Mobile is unbounded open panels, 1 rendered.** No eviction pressure on mobile.

### Dismiss

- Swipe-down or X closes (removes from `ui.panels`).
- Dynamic panels resolve `null` (today's cancel behavior).
- Static panels close but keep their store state (cart contents live in cart store, not the panel record).

### What it replaces

The broken mobile rendering (overlapping independent `MobileSheet`s at `top:0, z:45`, no switcher, Conversation/Sessions missing) is fully replaced by one `MobileStack` component. All panel types now render on mobile — fixing the missing-panels bug.

### Conversation & live voice on mobile

Conversation becomes a normal tab. Live voice active → conversation tab shows live-indicator badge and auto-activates.

### Mobile FAB coexistence

- Salient panels become **tabs** on mobile (not separate chips). "Jumped out" = "is a tab."
- Chevron dock on mobile = only options menu + truly agent-minimized panels.
- Keeps mobile simple: tabs = open panels, chevron = options + minimized.

### Mobile-aware layout context

```ts
layoutContext: {
  layout: "mobile",
  active: "cart",
  openPanels: [{ id, type, status }],
  // no minimized/visible distinction — all open panels are tabs
}
```

---

## Section 5 — Agent Tools: Layout Management + Gated Content Actions

### Tier 1 — Layout management (safe, always available)

| Tool | Purpose | Maps to |
|---|---|---|
| `openPanel` | Open any panel by type; re-focus minimized | `ui.open({type, data?})` |
| `closePanel` | Close by id/type; dynamic resolves `null` | `ui.close(idOrType)` |
| `focusPanel` | Bring to front (mobile: switch tab; desktop: prioritize) | `ui.focus(id)` |
| `minimizePanel` | Collapse into dock (desktop); no-op on mobile | `ui.minimize(id)` |

### Tier 2 — Content actions (gated)

| Tool | Purpose | Safety |
|---|---|---|
| `fillPanelField` | Set a form value on panel data (recipient, address, date) | Safe — only mutates form state |
| `clickPanelAction` | Trigger a named registered action inside a panel | **Gated** — only non-destructive actions |

### The destructive-action gate

Panels declare their own safe actions via a registry:

```ts
registerPanelActions("checkout", {
  "select-saved-address": { run: (ctx, addressId) => {...}, destructive: false },
  "set-gift-message":     { run: (ctx, msg) => {...},     destructive: false },
  // "place-order" NOT registered — it's a real user-tapped <button>.
});
```

`clickPanelAction` can only invoke `destructive === false` actions. Place-order/pay are physically user-only. Agent pre-fills, then tells user to confirm. Mirrors today's `createOrder` confirmation model.

### Existing tool changes

| Tool | Change |
|---|---|
| `searchProducts` | None (opens products indirectly) |
| `openProductDetail` / `closeProductDetail` | Thin wrappers over `openPanel`/`closePanel` (kept for prompt clarity) |
| `trackOrder`, `selectAddress`, `showCheckoutPanel` | Unchanged internally; now flow through the unified registry |
| Cart/wishlist/fact tools | Unchanged |

No existing tool loses capability; new tools are additive.

### Prompt updates

The UI-control directive gains a LAYOUT AWARENESS section teaching the agent to reason about open/minimized/active panels, minimize-before-opening on full desktops, focus to direct attention, and the form-fill vs. user-confirm boundary for destructive actions. `layoutContext` (§3/§4) replaces the current `activePanels` injection.

### `summarizeToolCall` entries

Each new tool gets a one-line summary (e.g. `"Opened cart"`, `"Filled recipient_name in checkout"`, `"Clicked 'select-saved-address' in checkout"`) for the debug/conversation log.

### Mobile/desktop parity

All six tools operate on the registry, not the DOM, so behavior is identical regardless of viewport. `focusPanel` switches tabs on mobile; `minimizePanel` is a no-op on mobile (returns `{minimized:false, note:"mobile has no minimize"}`).

---

## Implementation footprint (summary)

| Area | Change |
|---|---|
| `src/lib/stores/ui.svelte.ts` | Major: unified `Panel[]` registry, `open`/`close`/`focus`/`minimize`/`activePanelId`, slot logic, status/salience derivation |
| `src/lib/components/shell/canvas-layout.ts` | `slotsForLayout`, `selectVisiblePanels`, priority sort |
| `src/lib/components/shell/CanvasGrid.svelte` | Grid CSS cleanup (640/1024 tier alignment) |
| `src/lib/components/AppShell.svelte` | Replace FAB markup + `{:#if}` chain; bottom-right dock |
| NEW `src/lib/components/shell/Dock.svelte` | Bottom-right FAB dock (chips + chevron fan-out) |
| NEW `src/lib/components/shell/MobileStack.svelte` | Mobile single-active + tab bar |
| NEW `src/lib/panel-actions.ts` | `registerPanelActions` registry + types |
| `src/lib/ai/tool-registry.ts` | 6 new tools + `summarizeToolCall` entries |
| `src/lib/ai/client-context.ts` | Wire `onOpenPanel`/`onClosePanel`/`onFocusPanel`/`onMinimizePanel`/`onFillPanelField`/`onClickPanelAction` |
| `src/lib/ai/prompt.ts` | `layoutContext` injection + LAYOUT AWARENESS directive |
| `src/lib/stores/chat.svelte.ts` + `live-voice.svelte.ts` | Replace `activePanels` with `layoutContext` |
| Panel components (`CartPanelContent`, `DynamicPanel`, etc.) | Register their safe actions via `registerPanelActions` |
| `src/app.css` | Global radius shift `--radius-lg` → `--radius-md` default |
| Tests | Registry behavior, FIFO eviction, status transitions, panel-action gating |

## Out of scope

- Spacing/density theming (Tailwind handles spacing).
- Animation system changes (reuse existing tokens).
- Agent-initiated payment/ordering (gated by design).
- Voice-mode-specific layout (live voice continues to use the conversation tab).
- Free-form drag-to-split UI (deferred — §6 ships the tree + presets + agent composition so drag can layer on later without re-architecting).

---

## Section 6 — Composable Layout Regions (refinement to §1 and §3)

### Problem with the flat grid (§3 as written)

`selectVisiblePanels()` drops each panel into an identical grid cell. Panels render the same regardless of slot shape — so `ProductDetailContent` (a forced-vertical image→details stack) wastes a wide side slot. Two needs the flat grid can't meet:
1. **Composability** — a slot can *itself* contain a split (e.g. `|products| [chat / detail]`).
2. **Adaptivity** — a panel reshapes its content to its slot's aspect.

### Core abstraction: layout becomes a tree of regions

Replace the flat visible-list with a recursive `LayoutRegion` tree:

```ts
type LayoutRegion =
  | { kind: "leaf"; panelId: string }
  | { kind: "split"; orientation: "row" | "column"; children: LayoutRegion[]; weights?: number[] };
```

The active layout is `ui.layoutTree`. Examples:
- `split(row, [products, split(col, [chat, detail])])` → the "chat above detail, beside products" shape the user asked for.
- Mobile: `leaf(activePanelId)` (tab switcher picks which leaf — §4 unchanged).

A recursive `<Region>` component renders splits as row/col flex containers; leaves render `<PanelHost>` which measures its slot and passes an `aspect: AspectTier` to the panel component.

### Panels declare layout preferences

```ts
type AspectTier = "compact" | "portrait" | "landscape" | "square";
interface PanelTypeConfig {
  layoutPreference: AspectTier[];   // best→worst; drives placement + eviction
  minWidth?: number; minHeight?: number;  // below these → minimize instead of cram
}
```

The placement function matches panel preferences to slot shapes. Eviction FIFO (§3) still applies, but "evict" can now mean "doesn't fit any remaining slot well → minimize."

### Adaptive `ProductDetailContent` (the flagged overhaul)

One component, three variants keyed off the slot `aspect`:
- **landscape** (wide side slot) — sticky image ~40% left, scrollable details right.
- **portrait** (tall/mobile) — current vertical stack (preserved).
- **compact** (tiny / chat-inline) — image thumb + title + price + add, no variants/attrs.

Same data, three presentations, no duplication.

### How splits get created (three paths)

1. **Presets per breakpoint** — named trees (`focus`, `browse`, `compare`, `chat-browse`) selectable from the dock; default picked by what's open.
2. **Agent composition** — `openPanel` gains optional `split: "right-of-chat" | "below" | "stack"`; the store mutates the tree via high-level helpers (`wrapInSplit`, `replaceLeaf`). Agent reasons in intent, not raw tree edits.
3. **User split affordance** — a "split" button on panel headers (lightweight, not full drag). *Deferred*; presets + agent cover most cases now.

### Tree hygiene

Every tree mutation runs through a `normalizeTree` pass that collapses empty splits and orphaned nodes (so closing a panel never leaves a one-child split wrapper). This is the main extra complexity vs. the flat grid.

### Spec changes to §1/§3

| Element | Was | Becomes |
|---|---|---|
| Layout state | flat `selectVisiblePanels(panels, cap)` | `ui.layoutTree: LayoutRegion` + `selectLayout(panels, breakpoint, preset)` |
| Slot cap | hard N-tile cap | leaf count in tree; presets encode per-shape caps |
| Panel model (§1) | status/pinned | adds `layoutPreference`, `minWidth/minHeight` |
| Rendering | `{#each visiblePanels}` identical cells | recursive `<Region>`; leaves → `<PanelHost>` → panel's `aspect` variant |
| Eviction | FIFO on flat list | FIFO + "doesn't fit slot" → minimize |

§2 (dock), §4 (mobile tabs), §5 (agent tools) unchanged; mobile is single-active+tabs regardless of the tree. `openPanel` (§5) gains the optional `split` param.

---

## Section 7 — Panel Contracts: Schemas, Constraints, Live Channel (refinement to §1 and §5)

### Two bugs this section solves

**Bug A — duplicate form panels.** `ui.showPanel()` always appends; nothing enforces "one checkout at a time." The agent in live mode opens a second checkout; two coexist with separate `data` and separate `resolve` promises; one hangs forever.

**Bug B — agent can't fill what it opened.** The live prompt sends only a flat type string (`"checkout"`): no schema, no constraints, no current values, no way to know what fields exist or whether data is valid. The agent hears "deliver to Galle tomorrow" but has no structured, validated path to write `deliveryCity`/`deliveryDate` into the right panel.

Both share one root cause: **panels have no declared contract.**

### The `PanelContract` (single source of truth per panel type)

```ts
interface PanelContract {
  type: PanelType;
  instances: "single" | "multiple";        // "single" = checkout, address-select
  fillable: boolean;                        // can fields be filled while open?
  fields?: PanelField[];                    // schema — UI renders, agent discovers, store validates
  layoutPreference: AspectTier[];           // from §6
  minWidth?: number; minHeight?: number;
  actions?: Record<string, PanelAction>;    // from §5 (folded in here)
}

interface PanelField {
  key: string; label: string;
  type: "text" | "tel" | "date" | "textarea" | "select" | "number";
  required: boolean;
  placeholder?: string;
  validate?: (value: unknown, allData: Record<string, unknown>) => string | null;
  options?: (allData: Record<string, unknown>) => Promise<{value: string; label: string}[]>;
}

interface PanelAction { run: (ctx, ...args) => unknown; destructive: boolean; }
```

Lives in **`src/lib/panel-contracts.ts`** keyed by type. `DynamicPanel.svelte` stops hardcoding `checkoutFields`/`addressFields` (current lines 23-40) and reads `CONTRACTS[type].fields` — UI, agent, and store share one definition.

### Bug A fix — single-instance enforcement

`ui.open()` consults the contract:

```ts
open(id, config) {
  const contract = CONTRACTS[config.type];
  if (contract.instances === "single") {
    const existing = this.panels.find(p => p.type === config.type);
    if (existing) { this.focus(existing.id); return existing; }  // reuse, never duplicate
  }
  // ... create
}
```

A second `showCheckoutPanel` returns the already-open checkout and binds the agent's promise to the original. No duplicates, no hanging promises.

### Bug B fix — discoverable, validated, live fillable fields

**Agent learns the schema.** Prompt context (both modes) replaces the flat `activePanels` array with a full inventory derived from contracts:

```ts
openPanels: [{
  id: "checkout-abc", type: "checkout", status: "needs-input", fillable: true,
  fields: [
    { key: "recipientName", required: true, filled: false },
    { key: "deliveryCity", required: true, filled: false, options: "ask listDeliveryCities" },
    { key: "deliveryDate", required: true, filled: false, hint: "YYYY-MM-DD, today or future, Asia/Colombo" },
    // ...
  ],
  validation: { ok: false, errors: ["recipientName is required", "deliveryCity is required"] },
  actions: ["set-gift-message", "select-saved-address"],
}]
```

**Validated writes.** `fillPanelField` runs `field.validate` before accepting — agent *and* user writes both validate. Returns `{ok, error?}` so the agent can react to a failure ("Galle isn't deliverable, want Colombo?") instead of silently writing wrong data.

**Live bidirectional channel.** In live mode the agent fills silently as the user speaks (validated writes via `fillPanelField`), and only *confirms* in voice ("Got it, delivering to Galle tomorrow"). The panel updates visibly in real time. Because writes validate, the agent can attempt from ambiguous speech and recover via clarifying questions.

### `verifyPanel` — agent self-check before acting

New tool so the agent never blindly calls `createOrder`:

```ts
verifyPanel("checkout-abc")
  → { ok: false, missing: ["recipientName"], invalid: [{key:"deliveryDate", error:"must be today or future"}] }
```

The agent responds: "I need the recipient's name — who's it for?" No unexpected/invalid state ever reaches a destructive action.

### What the contract replaces (cleanup)

| Today | With contracts |
|---|---|
| `DynamicPanel.svelte` hardcodes `checkoutFields`, `addressFields` | Reads `CONTRACTS[type].fields` |
| No validation — `bind:value={panel.data[field.key]}` writes anything | `validate` on agent + user writes |
| `showPanel` always creates (duplicates possible) | `instances: "single"` enforced |
| Live prompt sends `["checkout"]` | Full field inventory + validation state |
| Agent can't know what a panel needs | Field list + hints + option-sources in prompt |
| "Safe actions" (§5) a separate registry | Folded into the contract as `actions` |

### Spec changes to §1/§5

| Element | Change |
|---|---|
| §1 `Panel` | references its `PanelContract`; data writes go through validation |
| §1 `open()` | enforces `instances: "single"` |
| §5 tools | `fillPanelField` returns `{ok, error?}`; add `verifyPanel`; `openPanel` returns the (possibly pre-existing) handle |
| §5 prompt context | flat `activePanels` → full field-inventory + validation (above) |
| New file | `src/lib/panel-contracts.ts` |

---

## Implementation footprint (updated with §6/§7)

| Area | Change |
|---|---|
| `src/lib/stores/ui.svelte.ts` | Unified `Panel[]` registry; `open`/`close`/`focus`/`minimize`/`activePanelId`; `layoutTree` + tree mutation; status/salience; single-instance enforcement; validated `fillPanelField`; `verifyPanel` helper |
| NEW `src/lib/panel-contracts.ts` | `CONTRACTS` registry — fields, instances, layoutPreference, actions per panel type |
| NEW `src/lib/layout/tree.ts` | `LayoutRegion` types + `wrapInSplit`/`replaceLeaf`/`removeNode`/`normalizeTree` |
| NEW `src/lib/layout/presets.ts` | Named presets per breakpoint + `pickDefaultPreset(openPanels)` |
| NEW `src/lib/layout/place.ts` | `selectLayout(panels, breakpoint, preset)` — assigns panels to leaves by preference |
| `src/lib/components/shell/canvas-layout.ts` | Slimmed: delegates to `layout/` modules |
| NEW `src/lib/components/shell/Region.svelte` | Recursive split renderer |
| NEW `src/lib/components/shell/PanelHost.svelte` | Measures slot, computes `aspect`, renders panel |
| `src/lib/components/shell/CanvasGrid.svelte` | Grid CSS cleanup (640/1024 tier alignment) |
| `src/lib/components/AppShell.svelte` | Replace FAB markup + `{:#if}` chain; bottom-right dock; mount `<Region>` |
| NEW `src/lib/components/shell/Dock.svelte` | Bottom-right FAB dock (chips + chevron) |
| NEW `src/lib/components/shell/MobileStack.svelte` | Mobile single-active + tab bar |
| `src/lib/components/DynamicPanel.svelte` | Read fields from `CONTRACTS`; remove hardcoded field arrays |
| `src/lib/components/ProductDetailContent.svelte` | Adaptive: 3 variants keyed off `aspect` (landscape/portrait/compact) |
| `src/lib/ai/tool-registry.ts` | 7 new tools (`openPanel`, `closePanel`, `focusPanel`, `minimizePanel`, `fillPanelField`, `clickPanelAction`, `verifyPanel`) + `summarizeToolCall` entries |
| `src/lib/ai/client-context.ts` | Wire handlers incl. validated fill + verify |
| `src/lib/ai/prompt.ts` | `layoutContext` + panel-inventory injection; LAYOUT AWARENESS + PANEL CONTRACTS directives |
| `src/lib/stores/chat.svelte.ts` + `live-voice.svelte.ts` | Replace `activePanels` with the contract-derived inventory |
| `src/app.css` | Global radius shift `--radius-lg` → `--radius-md` default |
| Tests | registry behavior, single-instance enforcement, validation, FIFO+preference eviction, tree normalization, contract integrity |

## Out of scope (updated)

- Spacing/density theming.
- Animation system changes.
- Agent-initiated payment/ordering (gated by design).
- Voice-mode-specific layout.
- Free-form drag-to-split (tree + presets + agent composition ship now; drag layers on later).
