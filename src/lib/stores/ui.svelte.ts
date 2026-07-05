/**
 * Unified UI store for agent-controllable views.
 *
 * The agent can open, close, and configure panels via tool calls.
 * This is the single reactive source for what the user sees on screen.
 *
 * Panels:
 * - products: product grid/search results
 * - cart: shopping cart
 * - delivery: delivery checker with calendar view
 * - lists: liked/watch/preferences
 * - product-detail: single product modal
 * - settings: profile/preferences
 *
 * - On desktop: conversation left, products center, detail right
 * - On small screens: conversation full, panels slide in as overlays
 */

import type { Product } from "$lib/shopping-engine";
import * as persist from "$lib/stores/persistence";
import {
  createPanel, canOpen, applyFill, validatePanel, PANEL_TITLES,
  type Panel, type PanelKind, type PanelStatus, type OpenConfig,
  type FillResult, type ValidateResult,
} from "$lib/stores/panel-registry";
import { getContract, PANEL_TYPES, type PanelType } from "$lib/panel-contracts";
import { selectLayout } from "$lib/layout/place";
import type { Placement } from "$lib/layout/place";
import type { LayoutTier, PresetName } from "$lib/layout/presets";

// Re-export the unified panel types so consumers import from one place.
export type { Panel, PanelKind, PanelStatus, FillResult, ValidateResult } from "$lib/stores/panel-registry";
export type { PanelType } from "$lib/panel-contracts";

/** Legacy static-panel id union — kept for back-compat with call sites that
 *  pass string literals. The unified registry accepts any of these. */
export type PanelId =
  | "products" | "cart" | "delivery-info" | "delivery" | "wishlist" | "product-detail"
  | "settings" | "sessions" | "debug-chat" | "chat-history"
  | "orders" | "address-book" | "memories";

export type ViewportLayout = "split" | "stacked";

/** Legacy alias: dynamic panels are now regular Panels in the registry. */
export type DynamicPanel = Panel;


export interface SearchCriteria {
  q: string;
  category: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  inStockOnly: boolean;
  sort: string;
  limit: number;
}

const SEARCH_STORE_ID = "search-criteria";
const THREADS_STORE_ID = "search-threads";
const PRODUCT_CACHE_STORE_ID = "product-cache";
const OPEN_PANELS_STORE_ID = "open-panels";     // legacy static-panel ids (v1)
const DYNAMIC_PANELS_STORE_ID = "dynamic-panels"; // legacy dynamic panels (v1)
const PANELS_STORE_ID = "panels";                // unified registry (v2)
const ORDER_RESULT_STORE_ID = "order-result";
const PRODUCT_DETAIL_STORE_ID = "product-detail-target";
const PRODUCT_HIGHLIGHTS_STORE_ID = "product-highlights";
const VERSION = 1;

type ProductHighlightState = {
  agent: Array<{ id: string; reason?: string }>;
};

export const defaultSearchCriteria: SearchCriteria = {
  q: "",
  category: null,
  minPrice: null,
  maxPrice: null,
  inStockOnly: false,
  sort: "relevance",
  limit: 8,
};

class UIStore {
  /** UNIFIED PANEL REGISTRY — single source of truth for every open panel,
   *  static (cart, lists, …) or dynamic (agent-created create-order, …).
   *  Replaces the old `openPanels: Set<PanelId>` + `panels: DynamicPanel[]`. */
  panels = $state<Panel[]>([]);
  activePanelId = $state<string | null>(null);
  agentInputOpen = $state(false);
  /** Show transcript text bubbles during voice mode (default on — tool
   *  bubbles always show; text bubbles show when enabled). */
  voiceTranscript = $state(true);

  /** Back-compat view of static open-panel ids (derived from the registry). */
  get openPanels(): Set<string> {
    return new Set(this.panels.filter(p => p.kind === "static").map(p => p.id));
  }

  /** Panel widths (user-resizable) */
  panelWidths = $state<Record<string, number>>({
    "products": 440,
    "product-detail": 380,
    "cart": 360,
    "settings": 340,
    "delivery": 320,
    "sessions": 340,
    "orders": 360,
    "address-book": 340,
    "memories": 320,
    "wishlist": 320,
  });

  viewportWidth = $state(0);
  viewportHeight = $state(0);

  /** Product detail target */
  productDetailId = $state<string | null>(null);

  /** Search/highlight state */
  highlightedIds = $state<Set<string>>(new Set());
  annotations = $state<Map<string, string>>(new Map());
  scrollToId = $state<string | null>(null);
  /** Gallery modal state */
  galleryState = $state<{
    open: boolean;
    images: string[];
    activeIndex: number;
    productId: string | null;
  } | null>(null);


  lastDeliveryCheck = $state<{ city: string; date?: string; available: boolean; rate?: number } | null>(null);
  searchThreads = $state<Array<{ id: string; query: string; products: Product[]; searchedAt?: number }>>([]);

  get searchResults(): Product[] {
    return this.searchThreads.flatMap(t => t.products);
  }

  /** Registry of all products we've ever seen (for cart/wishlist lookups by ID) */
  productRegistry = $state<Map<string, Product>>(new Map());

  // Telemetry state for Ambient Agent
  focusedPanelId = $state<string | null>(null);
  focusedItemId = $state<string | null>(null);

  searchCriteria = $state<SearchCriteria>({ ...defaultSearchCriteria });
  searchIsLoading = $state(false);

  askUser = $state<{ question: string; options: string[]; resolve: (answer: string) => void } | null>(null);
  debugChatOpen = $state(false);
  searchError = $state<string | null>(null);

  /** Query that last returned zero results — shown as a transient hint, never as a thread. */
  noResultsQuery = $state<string | null>(null);
  lastOrder = $state<{ orderNumber?: string; orderRef?: string; paymentUrl?: string; expiresAt?: string } | null>(null);

  // Chat is visible only when the conversation panel is actively rendered.
  // If the panel is closed or minimized, AppShell shows the floating AgentBar.
  get conversationVisible(): boolean {
    const evictedIds = new Set(this.placement.minimized.map(p => p.id));
    return this.panels.some(p =>
      p.type === "conversation" && p.status !== "expired" && !p.minimized && !evictedIds.has(p.id)
    );
  }

  /** Show an agent-driven dynamic panel. Returns a Promise that resolves on
   *  submit/close. Single-instance enforcement: if the type is "single" and one
   *  is already open, the existing panel is focused + returned (its promise
   *  is reused) — never duplicated. */
  private assertValidType(type: string): void {
    if (!PANEL_TYPES.includes(type as PanelType)) {
      throw new Error(`Unknown panel type "${type}". Valid types: ${PANEL_TYPES.join(", ")}`);
    }
  }
  showPanel(config: { type: PanelType; title?: string; data?: Record<string, unknown> }): Promise<unknown> {
    this.assertValidType(config.type);
    const existing = canOpen(this.panels, config.type);
    if (existing) {
      if (config.data) existing.data = { ...existing.data, ...config.data };
      if (config.title) existing.title = config.title;
      this.focus(existing.id);
      this.savePanels();
      return new Promise((resolve) => {
        const orig = existing.resolve;
        existing.resolve = (r: unknown) => { orig?.(r); resolve(r); };
      });
    }
    return new Promise((resolve) => {
      const panel = createPanel(config.type, {
        kind: "dynamic",
        title: config.title ?? PANEL_TITLES[config.type] ?? config.type,
        data: config.data,
        status: "needs-input",
        resolve: resolve as (result: unknown) => void,
      });
      this.panels = [...this.panels, panel];
      this.activePanelId = panel.id;
      this.savePanels();
    });
  }

  closeDynamicPanel(id: string, result?: unknown) {
    const panel = this.panels.find((p) => p.id === id);
    if (panel) {
      panel.resolve?.(result);
      this.panels = this.panels.filter((p) => p.id !== id);
      if (this.activePanelId === id) this.activePanelId = this.panels.at(-1)?.id ?? null;
      this.savePanels();
    }
  }

  updatePanelData(id: string, patch: Record<string, unknown>) {
    const panel = this.panels.find((p) => p.id === id);
    if (panel) {
      Object.assign(panel.data, patch);
      this.savePanels();
    }
  }

  replacePanelData(id: string, data: Record<string, unknown>) {
    const panel = this.panels.find((p) => p.id === id);
    if (panel) {
      panel.data = { ...data };
      if (panel.status === "idle" || panel.status === "active") panel.status = "has-update";
      this.savePanels();
    }
  }

  /** Validated field fill — used by both agent (panel_fill_field tool) and user
   *  edits. Returns the validation result so callers can surface errors. */
  fillPanelField(id: string, key: string, value: unknown): FillResult {
    const panel = this.panels.find((p) => p.id === id);
    if (!panel) return { ok: false, error: `Panel ${id} not found` };
    const result = applyFill(panel, key, value);
    if (result.ok) this.savePanels();
    return result;
  }

  verifyPanel(id: string): ValidateResult {
    const panel = this.panels.find((p) => p.id === id);
    if (!panel) return { ok: false, missing: [], invalid: [{ key: "_", error: "Panel not found" }] };
    return validatePanel(panel);
  }

  private savePanels() {
    // Strip resolve (not serializable) before persisting.
    const serialized = this.panels.map(({ resolve, ...rest }) => rest);
    persist.save(PANELS_STORE_ID, VERSION, serialized);
  }

  getPanelData(id: string): Record<string, unknown> | undefined {
    return this.panels.find((p) => p.id === id)?.data;
  }

  toggleConversation() {
    if (this.isOpen("conversation")) {
      this.close("conversation");
    } else {
      this.open("conversation" as PanelType, { kind: "static" });
    }
  }

  /** Reactive viewport flag. Updated by a matchMedia listener so the layout
   *  re-renders on resize/orientation change, not just on first paint. */
  isSplit = $state(true);

  constructor() {
    if (typeof window === "undefined") return;
    this.searchCriteria = persist.load<SearchCriteria>(SEARCH_STORE_ID, VERSION, { ...defaultSearchCriteria });
    this.searchThreads = persist.load<Array<{ id: string; query: string; products: Product[]; searchedAt?: number }>>(THREADS_STORE_ID, VERSION, []);
    const cachedProducts = persist.load<Product[]>(PRODUCT_CACHE_STORE_ID, VERSION, []);
    this.lastOrder = persist.load<{ orderNumber?: string; orderRef?: string; paymentUrl?: string; expiresAt?: string } | null>(ORDER_RESULT_STORE_ID, VERSION, null);
    const reg = new Map<string, Product>();
    for (const product of cachedProducts) reg.set(product.id, product);
    for (const thread of this.searchThreads) {
      for (const product of thread.products) reg.set(product.id, product);
    }
    this.productRegistry = reg;
    this.loadHighlights();

    // Hydrate the unified registry. Prefer the v2 unified key; fall back to
    // legacy split keys (open-panels + dynamic-panels) and migrate once.
    let hydrated = persist.load<Array<Omit<Panel, "resolve">>>(PANELS_STORE_ID, VERSION, []);
    if (hydrated.length === 0) {
      // Legacy migration: merge the two old keys into the unified format.
      const savedStatic = persist.load<string[]>(OPEN_PANELS_STORE_ID, VERSION, []);
      const savedDynamic = persist.load<Array<Record<string, unknown>>>(DYNAMIC_PANELS_STORE_ID, VERSION, []);
      const staticPanels: Panel[] = savedStatic
        .filter(id => id !== "delivery" && id !== "settings" && id !== "debug-chat" && id !== "chat-history")
        .map(id => createPanel(id as PanelType, { kind: "static" }));
      const dynamicPanels: Panel[] = savedDynamic.map(p => ({
        ...createPanel(p.type as PanelType, { kind: "dynamic", title: p.title as string, data: p.data as Record<string, unknown> }),
        status: "expired" as PanelStatus,
        createdAt: (p.createdAt as number) ?? Date.now(),
      }));
      hydrated = [...staticPanels, ...dynamicPanels];
      // Clean up legacy keys after migration.
      persist.clear(OPEN_PANELS_STORE_ID);
      persist.clear(DYNAMIC_PANELS_STORE_ID);
    }
    // Drop expired panels on reload — they can never resolve and just clutter the UI.
    this.panels = hydrated
      .filter(p => p.status !== "expired" && PANEL_TYPES.includes(p.type))
      .map(p => ({ ...p, resolve: undefined }));
    this.savePanels();
    // Restore the product-detail target only when its panel survived reload,
    // so reopening the panel doesn't land on "Product details are unavailable".
    this.productDetailId = this.panels.some(p => p.id === "product-detail")
      ? persist.load<string | null>(PRODUCT_DETAIL_STORE_ID, VERSION, null)
      : null;

    if (typeof window.matchMedia !== "function") return;
    const syncViewport = () => {
      this.viewportWidth = window.innerWidth;
      this.viewportHeight = window.innerHeight;
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    // Split at sm (640px) and up: tablets and large phones have room to split
    // horizontally; only small phones (<640px, mostly portrait) use stacked mode.
    const mq = window.matchMedia("(min-width: 640px)");
    this.isSplit = mq.matches;
    mq.addEventListener("change", () => { this.isSplit = mq.matches; syncViewport(); });
    // Wide tier (≥1024px) unlocks the 3-slot desktop grid.
    const mqWide = window.matchMedia("(min-width: 1024px)");
    this.isWide = mqWide.matches;
    mqWide.addEventListener("change", () => { this.isWide = mqWide.matches; syncViewport(); });
  }

  get layout(): ViewportLayout {
    return this.isSplit ? "split" : "stacked";
  }

  /** Three-tier layout classification driving slot caps + preset selection.
   *  mobile (<640px), split-small (640–1023px), split-wide (≥1024px). */
  isWide = $state(false);
  get tier(): LayoutTier {
    if (!this.isSplit) return "mobile";
    return this.isWide ? "split-wide" : "split-small";
  }

  /** Active layout preset (undefined = auto-pick). */
  preset = $state<PresetName | undefined>(undefined);

  /** Computed placement: visible/minimized split + the LayoutRegion tree.
   *  Drives the recursive <Region> renderer on desktop/tablet. */
  get placement(): Placement {
    return selectLayout(this.panels, this.tier, this.preset, { width: this.viewportWidth, height: this.viewportHeight }, this.panelWidths);
  }

  isOpen(id: string): boolean { return this.panels.some(p => p.id === id || (p.kind === "static" && p.type === id)); }
  isOpenType(type: string): boolean { return this.panels.some(p => p.type === type); }
  isVisible(idOrType: string): boolean {
    const panel = this.panels.find(p => p.id === idOrType)
      ?? this.panels.toReversed().find(p => p.type === idOrType);
    if (!panel || panel.status === "expired") return false;
    return this.placement.visible.some(p => p.id === panel.id);
  }


  /** Open a STATIC panel by id (cart, lists, …). Single-instance: if already
   *  open, focus it. Mirrors the registry's open() for the static case. */
  openPanel(id: PanelId) {
    const type = id as PanelType;
    if (this.panels.some(p => p.id === id)) { this.focus(id); return; }
    // Static panels reuse the id as both id and type (e.g. "cart"). For legacy
    // ids like "delivery"/"settings" that aren't real PanelTypes, cast is safe —
    // the registry only uses the type for contract lookup + title.
    this.panels = [...this.panels, createPanel(type, { kind: "static" })];
    this.activePanelId = id;
    this.savePanels();
  }

  closePanel(id: PanelId) {
    this.close(id);
  }

  /** Unified open: works for any type. Enforces single-instance + returns the
   *  (possibly pre-existing) panel. Used by the agent's panel_open tool. */
  open(type: PanelType, config: OpenConfig = {}): Panel {
    this.assertValidType(type);
    const existing = canOpen(this.panels, type);
    if (existing) {
      if (config.data) existing.data = { ...existing.data, ...config.data };
      if (config.title) existing.title = config.title;
      this.focus(existing.id);
      this.savePanels();
      return existing;
    }
    const isStatic = getContract(type).instances === "single" && !getContract(type).fillable;
    const kind = config.kind ?? (isStatic ? "static" : "dynamic");
    const panel = createPanel(type, { ...config, kind });
    this.panels = [...this.panels, panel];
    this.activePanelId = panel.id;
    this.savePanels();
    return panel;
  }

  /** Close by id. Resolves dynamic panels with the given result (default null). */
  close(idOrType: string, result: unknown = null) {
    const panel = this.panels.find(p => p.id === idOrType)
      ?? this.panels.toReversed().find(p => p.type === idOrType);
    if (!panel) return;
    panel.resolve?.(result);
    this.panels = this.panels.filter(p => p.id !== panel.id);
    if (this.activePanelId === panel.id) this.activePanelId = this.panels.at(-1)?.id ?? null;
    this.savePanels();
  }

  focus(idOrType: string) {
    const panel = this.panels.find(p => p.id === idOrType)
      ?? this.panels.toReversed().find(p => p.type === idOrType);
    if (!panel) return;
    panel.minimized = false; // restore if minimized — focus implies "make visible"
    this.activePanelId = panel.id;
    panel.createdAt = Date.now();
    this.savePanels();
  }

  minimize(idOrType: string) {
    const panel = this.panels.find(p => p.id === idOrType)
      ?? this.panels.toReversed().find(p => p.type === idOrType);
    if (panel) { panel.minimized = true; this.savePanels(); }
  }

  restore(id: string) {
    const panel = this.panels.find(p => p.id === id);
    if (panel) { panel.minimized = false; this.focus(id); this.savePanels(); }
  }

  get canRestoreLastLayout(): boolean {
    return this.panels.some(p => p.status !== "expired" && p.minimized);
  }

  restoreLastLayout() {
    const restorable = this.panels.filter(p => p.status !== "expired" && p.minimized);
    if (restorable.length === 0) return;
    this.panels = this.panels.map(p => p.status !== "expired" ? { ...p, minimized: false } : p);
    const latest = restorable.toSorted((a, b) => b.createdAt - a.createdAt)[0];
    if (latest) this.focus(latest.id);
    this.savePanels();
  }

  togglePanel(id: PanelId) {
    if (this.isOpen(id)) this.closePanel(id);
    else this.openPanel(id);
  }

  /** Menu/collector visibility toggle. Existing panels are never closed here:
   *  visible -> minimized, minimized/overflow -> focused/restored, absent -> open.
   *  Closing is reserved for panel close controls and agent-invoked close tools. */
  togglePanelVisibility(id: PanelId) {
    const panel = this.panels.find(p => p.id === id)
      ?? this.panels.toReversed().find(p => p.type === id);
    if (!panel) {
      this.openPanel(id);
      return;
    }
    if (this.isVisible(panel.id)) this.minimize(panel.id);
    else this.focus(panel.id);
  }

  setPanelWidth(id: string, width: number) {
    this.panelWidths = { ...this.panelWidths, [id]: Math.max(280, Math.min(600, width)) };
  }

  addHighlights(items: Array<{ id: string; reason?: string }>) {
    // IDs may arrive from the LLM as numbers; normalize to strings so they
    // match the string keys used everywhere else.
    const ids = new Set(this.highlightedIds);
    const annotations = new Map(this.annotations);
    for (const item of items) {
      const id = String(item.id);
      ids.add(id);
      if (item.reason) annotations.set(id, item.reason);
    }
    // Keep the store capped at 20 highlights
    const sorted = Array.from(ids);
    if (sorted.length > 20) {
      const excess = sorted.slice(0, sorted.length - 20);
      for (const id of excess) annotations.delete(id);
      this.highlightedIds = new Set(sorted.slice(sorted.length - 20));
    } else {
      this.highlightedIds = ids;
    }
    this.annotations = annotations;
    this.saveHighlights();
  }

  removeHighlights(ids: string[]) {
    const next = new Set(this.highlightedIds);
    const annotations = new Map(this.annotations);
    for (const id of ids) {
      next.delete(String(id));
      annotations.delete(String(id));
    }
    this.highlightedIds = next;
    this.annotations = annotations;
    this.saveHighlights();
  }

  getHighlights(): Array<{ id: string; reason?: string }> {
    return Array.from(this.highlightedIds).map(id => ({
      id,
      reason: this.annotations.get(id),
    }));
  }

  setAskUser(question: string, options: string[], resolve: (answer: string) => void) {
    this.askUser = { question, options, resolve };
  }

  resolveAskUser(answer: string) {
    this.askUser?.resolve(answer);
    this.askUser = null;
  }

  dismissAskUser() {
    this.askUser?.resolve("");
    this.askUser = null;
  }

  /** Dismiss the question without resolving — used when the model moves on
   *  (auto-detect from voice) or when the model calls ui_dismiss_ask_user. */
  autoDismissAskUser() {
    this.askUser = null;
  }

  toggleDebugChat() {
    this.debugChatOpen = !this.debugChatOpen;
  }
  setOrderResult(order: { orderNumber?: string; orderRef?: string; paymentUrl?: string; expiresAt?: string }) {
    this.lastOrder = order;
    persist.save(ORDER_RESULT_STORE_ID, VERSION, order);
  }

  clearOrderResult() {
    this.lastOrder = null;
    persist.clear(ORDER_RESULT_STORE_ID);
  }

  scrollTo(productId: string) {
    this.scrollToId = String(productId);
  }

  openProductDetail(productId: string) {
    this.productDetailId = String(productId);
    persist.save(PRODUCT_DETAIL_STORE_ID, VERSION, String(productId));
    this.openPanel("product-detail");
  }

  closeProductDetail() {
    this.productDetailId = null;
    persist.clear(PRODUCT_DETAIL_STORE_ID);
    this.closePanel("product-detail");
  }
  openGallery(images: string[], activeIndex: number = 0, productId: string | null = null) {
    this.galleryState = { open: true, images, activeIndex, productId };
  }

  closeGallery() {
    this.galleryState = null;
  }

  navigateGallery(index: number) {
    if (!this.galleryState) return;
    const clamped = Math.max(0, Math.min(index, this.galleryState.images.length - 1));
    this.galleryState = { ...this.galleryState, activeIndex: clamped };
  }


  setDeliveryCheck(info: { city: string; date?: string; available: boolean; rate?: number }) {
    this.lastDeliveryCheck = info;
    this.openPanel("delivery-info");
  }

  setSearchResults(products: Product[], query: string = "") {
    if (products.length === 0) {
      // Don't pollute the threads list with an empty result; surface it as a
      // transient no-results hint instead. The tool result carries the signal.
      this.noResultsQuery = query || null;
      return;
    }
    this.noResultsQuery = null;
    const searchedAt = Date.now();
    const existing = this.searchThreads.find(t => t.query === query);
    const nextThread = { id: existing?.id ?? crypto.randomUUID(), query, products, searchedAt };
    this.searchThreads = [
      nextThread,
      ...this.searchThreads.filter(t => t.query !== query),
    ].slice(0, 3);
    persist.save(THREADS_STORE_ID, VERSION, this.searchThreads);

    const reg = new Map(this.productRegistry);
    for (const p of products) reg.set(p.id, p);
    this.productRegistry = reg;
    this.saveProductCache();
    this.openPanel("products");
  }

  removeSearchThread(id: string) {
    this.searchThreads = this.searchThreads.filter(t => t.id !== id);
    persist.save(THREADS_STORE_ID, VERSION, this.searchThreads);
    if (this.searchThreads.length === 0) {
      this.closePanel("products");
    }
  }

  setTelemetryFocus(panelId: string | null, itemId: string | null = null) {
    this.focusedPanelId = panelId;
    this.focusedItemId = itemId;
  }

  registerProduct(product: Product) {
    const reg = new Map(this.productRegistry);
    reg.set(product.id, product);
    this.productRegistry = reg;
    this.saveProductCache();
  }

  private saveProductCache() {
    persist.save(PRODUCT_CACHE_STORE_ID, VERSION, Array.from(this.productRegistry.values()).slice(-120));
  }

  private loadHighlights() {
    const stored = persist.load<ProductHighlightState>(PRODUCT_HIGHLIGHTS_STORE_ID, VERSION, { agent: [] });
    const known = (id: string) => this.productRegistry.has(String(id));
    const agent = stored.agent.filter(item => known(item.id));
    this.highlightedIds = new Set(agent.map(item => String(item.id)));
    this.annotations = new Map(agent.flatMap(item => item.reason ? [[String(item.id), item.reason] as const] : []));
  }

  private saveHighlights() {
    const agent = Array.from(this.highlightedIds)
      .filter(id => this.productRegistry.has(id))
      .map(id => ({ id, reason: this.annotations.get(id) }))
      .slice(0, 20);
    persist.save(PRODUCT_HIGHLIGHTS_STORE_ID, VERSION, { agent });
  }

  getProduct(id: string): Product | undefined {
    // Tolerant lookup: the agent (LLM) often emits purely-numeric product IDs
    // as JSON numbers even though the schema declares them strings. Normalize
    // so a number id still resolves to the string-keyed registry entry.
    return this.productRegistry.get(String(id));
  }

  async runSearch(criteria: Partial<SearchCriteria>): Promise<Product[]> {
    this.searchCriteria = {
      ...this.searchCriteria,
      ...criteria,
      q: criteria.q ?? this.searchCriteria.q,
      category: criteria.category ?? null,
      minPrice: criteria.minPrice ?? null,
      maxPrice: criteria.maxPrice ?? null,
      inStockOnly: criteria.inStockOnly ?? false,
      limit: criteria.limit ?? this.searchCriteria.limit,
    };
    this.searchError = null;
    this.noResultsQuery = null;
    const products = await this.triggerSearch();
    if (this.searchError) throw new Error(this.searchError);
    return products;
  }

  commitSearch() {
    persist.save(SEARCH_STORE_ID, VERSION, this.searchCriteria);
  }

  async triggerSearch(): Promise<Product[]> {
    this.searchIsLoading = true;
    this.commitSearch();
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: this.searchCriteria.q || (this.searchCriteria.category ? "" : "gift"),
          category: this.searchCriteria.category,
          minPrice: this.searchCriteria.minPrice,
          maxPrice: this.searchCriteria.maxPrice,
          inStockOnly: this.searchCriteria.inStockOnly,
          sort: this.searchCriteria.sort === "relevance" ? "relevance" :
                this.searchCriteria.sort === "price-low" ? "price_asc" :
                this.searchCriteria.sort === "price-high" ? "price_desc" : "relevance",
          limit: this.searchCriteria.limit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      const products = (data.products ?? []) as Product[];
      this.setSearchResults(products, this.searchCriteria.q || this.searchCriteria.category || "gift");
      return products;
    } catch (err) {
      console.error("Search failed:", err);
      this.searchError = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      this.searchIsLoading = false;
    }
  }

  goHome() {
    this.panels = this.panels.map(p => ({ ...p, minimized: true }));
    this.activePanelId = null;
    this.savePanels();
  }

  resetView() {
    this.highlightedIds = new Set();
    this.annotations = new Map();

    persist.clear(PRODUCT_HIGHLIGHTS_STORE_ID);
    this.scrollToId = null;
    this.galleryState = null;
    this.searchThreads = [];
    persist.save(THREADS_STORE_ID, VERSION, this.searchThreads);
    // Clear the unified registry (replaces the old openPanels Set + panels array).
    this.panels = [];
    this.activePanelId = null;
    persist.save(PANELS_STORE_ID, VERSION, []);
    this.searchCriteria = { ...defaultSearchCriteria };
    this.commitSearch();
  }
}

const instance = new UIStore();
export function useUI() { return instance; }
