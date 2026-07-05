/**
 * Declarative contract per panel type. ONE source of truth the UI renders from,
 * the agent discovers, and the store enforces. Eliminates the duplicate-panel
 * and silent-fill failures: single-instance enforcement, validated writes, and
 * a discoverable schema for the agent.
 *
 * Used by:
 *  - DynamicPanel.svelte (renders fields from CONTRACTS, not hardcoded arrays)
 *  - panel-registry.ts (single-instance + applyFill + validatePanel)
 *  - prompt.ts (builds the panel inventory the agent sees)
 *  - tool-registry.ts (describes fillable fields + safe actions)
 */

export type PanelType =
  | "products" | "conversation" | "cart" | "product-detail" | "sessions"
  | "orders" | "address-book" | "memories"
  // agent-driven dynamic panels
  | "address-select" | "address-form" | "create-order"
  | "wishlist" | "delivery-info" | "order-tracking";

export const PANEL_TYPES: PanelType[] = [
  "products", "conversation", "cart", "product-detail", "sessions",
  "orders", "address-book", "memories",
  "address-select", "address-form", "create-order",
  "wishlist", "delivery-info", "order-tracking",
];

export function normalizePanelType(type: string): PanelType | null {
  return PANEL_TYPES.includes(type as PanelType) ? type as PanelType : null;
}

export type AspectTier = "compact" | "portrait" | "landscape" | "square";

export interface PanelField {
  key: string;
  label: string;
  type: "text" | "tel" | "date" | "textarea" | "select" | "number";
  required: boolean;
  placeholder?: string;
  hint?: string;
  /** Inline validation; returns error string or null when valid. */
  validate?: (value: unknown, allData: Record<string, unknown>) => string | null;
  /** Suggest valid options (e.g. deliverable cities). Async — agent invokes a tool to fetch. */
  optionsRef?: string; // e.g. "delivery_list_cities" — tells agent which tool supplies options
}

export interface PanelActionContext {
  panelId: string;
  data: Record<string, unknown>;
  update: (data: Record<string, unknown>) => void;
}

export interface PanelAction {
  run: (ctx: PanelActionContext, ...args: unknown[]) => unknown;
  destructive: boolean;
}

export interface PanelContract {
  type: PanelType;
  /** "single" = at most one open at a time (form collectors: create-order, address-select).
   *  "multiple" = many allowed (browse: product-detail, tracking). */
  instances: "single" | "multiple";
  /** Can fields be filled while open (drives `fillable` flag in the prompt + panel_fill_field). */
  fillable: boolean;
  fields?: PanelField[];
  /** Slot shapes this panel renders well in, best→worst. Drives placement + eviction. */
  layoutPreference: AspectTier[];
  minWidth?: number;
  minHeight?: number;
  /** Safe (non-destructive) actions the agent can invoke via panel_click_action. */
  actions?: Record<string, PanelAction>;
  /** Lucide icon name for FAB/tab display. */
  icon?: string;
}

const FALLBACK: PanelContract = {
  type: "products" as PanelType,
  instances: "multiple",
  fillable: false,
  layoutPreference: ["landscape", "portrait"],
};

// ── Validators ─────────────────────────────────────────────────────────────

const dateFuture = (v: unknown): string | null => {
  if (!v || (v as string).length === 0) return null;
  const d = new Date(v as string);
  if (isNaN(d.getTime())) return "Must be a valid date (YYYY-MM-DD)";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d < today) return "Must be today or a future date";
  return null;
};

// ── Contracts ──────────────────────────────────────────────────────────────

export const CONTRACTS: Record<PanelType, PanelContract> = {
  products:         { type: "products", instances: "multiple", fillable: false, layoutPreference: ["landscape", "square", "portrait"], minWidth: 420, minHeight: 320, icon: "layers" },
  conversation:     { type: "conversation", instances: "single", fillable: false, layoutPreference: ["portrait", "landscape"], minWidth: 360, minHeight: 320, icon: "message-square" },
  cart:             { type: "cart", instances: "single", fillable: false, layoutPreference: ["portrait", "compact"], minWidth: 320, minHeight: 260, icon: "shopping-bag" },
  "product-detail": { type: "product-detail", instances: "multiple", fillable: false, layoutPreference: ["landscape", "portrait", "compact"], minWidth: 320, minHeight: 280, icon: "eye" },
  sessions:         { type: "sessions", instances: "single", fillable: false, layoutPreference: ["portrait", "landscape"], minWidth: 320, minHeight: 280, icon: "history" },
  orders:           { type: "orders", instances: "single", fillable: false, layoutPreference: ["portrait", "landscape", "compact"], minWidth: 340, minHeight: 280, icon: "package", actions: { "refresh-status": { run: (_ctx) => { /* wired in component via panel_click_action */ return { refreshing: true }; }, destructive: false } } },
  "address-book":   { type: "address-book", instances: "single", fillable: true, layoutPreference: ["portrait", "compact", "landscape"], minWidth: 320, minHeight: 280, icon: "map-pin", fields: [
    { key: "label", label: "Label", type: "text", required: true, placeholder: "Home, Office..." },
    { key: "recipientName", label: "Recipient Name", type: "text", required: true },
    { key: "recipientPhone", label: "Phone", type: "tel", required: true },
    { key: "streetAddress", label: "Street Address", type: "textarea", required: true },
    { key: "city", label: "City", type: "text", required: true, optionsRef: "delivery_list_cities" },
    { key: "notes", label: "Notes", type: "textarea", required: false },
  ], actions: { "set-default": { run: (_ctx) => { /* wired in component */ return { ok: true }; }, destructive: false } } },
  memories:         { type: "memories", instances: "single", fillable: true, layoutPreference: ["portrait", "landscape", "compact"], minWidth: 300, minHeight: 260, icon: "brain", fields: [
    { key: "text", label: "Memory", type: "textarea", required: true, placeholder: "e.g. Shoe size is 42" },
    { key: "category", label: "Category", type: "select", required: true, placeholder: "preference" },
  ] },
  "address-select": {
    type: "address-select", instances: "single", fillable: true,
    layoutPreference: ["portrait", "compact"], minWidth: 320, minHeight: 320, icon: "map-pin",
    fields: [
      { key: "recipientName", label: "Recipient Name", type: "text", required: true },
      { key: "recipientPhone", label: "Phone", type: "tel", required: true },
      { key: "streetAddress", label: "Street Address", type: "textarea", required: true },
      { key: "city", label: "City", type: "text", required: true },
    ],
  },
  "address-form": {
    type: "address-form", instances: "single", fillable: true,
    layoutPreference: ["portrait", "compact"], minWidth: 320, minHeight: 340, icon: "map-pin",
    fields: [
      { key: "label", label: "Label", type: "text", required: true, placeholder: "Home, Office..." },
      { key: "recipientName", label: "Recipient Name", type: "text", required: true },
      { key: "recipientPhone", label: "Phone", type: "tel", required: true },
      { key: "streetAddress", label: "Street Address", type: "textarea", required: true },
      { key: "city", label: "City", type: "text", required: true },
    ],
  },
  "create-order": {
    type: "create-order", instances: "single", fillable: true,
    layoutPreference: ["portrait", "compact"], minWidth: 360, minHeight: 360, icon: "send",
    fields: [
      { key: "recipientName", label: "Recipient Name", type: "text", required: true },
      { key: "recipientPhone", label: "Recipient Phone", type: "tel", required: true },
      { key: "streetAddress", label: "Street Address", type: "textarea", required: true },
      { key: "deliveryCity", label: "Delivery City", type: "text", required: true, hint: "Use delivery_list_cities to fetch valid options", optionsRef: "delivery_list_cities" },
      { key: "deliveryDate", label: "Delivery Date", type: "date", required: true, placeholder: "YYYY-MM-DD", hint: "Today or future, Asia/Colombo", validate: dateFuture },
      { key: "senderName", label: "Your Name", type: "text", required: true },
      { key: "giftMessage", label: "Gift Message (optional)", type: "textarea", required: false },
    ],
  },
  wishlist:           { type: "wishlist", instances: "single", fillable: false, layoutPreference: ["portrait", "landscape"], minWidth: 320, minHeight: 280, icon: "heart" },
  "delivery-info":    { type: "delivery-info", instances: "multiple", fillable: false, layoutPreference: ["compact", "portrait"], minWidth: 300, minHeight: 220, icon: "truck" },
  "order-tracking":   { type: "order-tracking", instances: "multiple", fillable: false, layoutPreference: ["portrait", "compact"], minWidth: 320, minHeight: 300, icon: "truck" },
};

/** Resolve a contract with a safe fallback for unknown types. */
export function getContract(type: string): PanelContract {
  return (CONTRACTS as Record<string, PanelContract>)[type] ?? FALLBACK;
}
