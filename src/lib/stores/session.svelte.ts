// Session store using Svelte 5 runes with class-based reactive state.
// Uses unified persistence layer.

import * as persist from "$lib/stores/persistence";
import { useProfile } from "$lib/stores/profile.svelte";

const STORE_ID = "session";
const VERSION = 1;
const MAX_HISTORY = 8;

export type SessionPreferences = {
  shoppingOccasionHistory: string[];
  budgetRangePreference?: BudgetRangePreference;
};

type SessionState = {
  sessionId: string;
  createdAt: string;
  lastOrderAt?: string;
  preferences: SessionPreferences;
  orderRecords: OrderRecord[];
  conversationTopics: string[];
};

export type BudgetRangePreference = { min?: number; max?: number };

export type OrderSummary = { itemsTotal?: number; deliveryFee?: number; addonsTotal?: number; grandTotal?: number; currency?: string };
export type TrackingStep = { step: string; timestamp?: string };
export type MoneyAmount = { value: number; currency: string };
export type OrderRecipient = { name?: string; phone?: string; address?: string; city?: string };

export interface CreatedOrderRecord {
  kind: "created";
  id: string;
  orderRef: string;
  paymentUrl?: string;
  expiresAt?: string;
  createdAt: number;
  status: "pending_payment" | "payment_expired";
  statusDisplay: string;
  summary?: OrderSummary;
  lastCheckedAt: 0;
}

export interface CompletedOrderRecord {
  kind: "completed";
  id: string;
  orderNumber: string;
  createdAt: number;
  status?: string;
  statusDisplay?: string;
  tracking?: TrackingStep[];
  amount?: MoneyAmount;
  recipient?: OrderRecipient;
  deliveryDate?: string;
  paymentMethod?: string;
  comments?: string;
  giftMessage?: string;
  orderDate?: string;
  shippedDate?: string;
  lastCheckedAt: number;
}

export type OrderRecord = CreatedOrderRecord | CompletedOrderRecord;

function createEmptySession(): SessionState {
  return { sessionId: "", createdAt: "", preferences: { shoppingOccasionHistory: [] }, orderRecords: [], conversationTopics: [] };
}

function generateFreshSession(): SessionState {
  return {
    sessionId: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `djinn-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    preferences: { shoppingOccasionHistory: [] },
    orderRecords: [],
    conversationTopics: [],
  };
}

function uniqueRecent(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).slice(0, MAX_HISTORY);
}

function summarizeTopic(topic: string): string {
  return topic.replace(/\s+/g, " ").trim().slice(0, 120);
}

function extractOccasions(text: string): string[] {
  const lower = text.toLowerCase();
  const occasions = ["birthday", "anniversary", "wedding", "new year", "vesak", "christmas", "valentine", "mother", "father", "eid", "pongal"];
  return occasions.filter((o) => lower.includes(o));
}

function extractBudget(text: string): BudgetRangePreference | undefined {
  const match = text.match(/(?:lkr|rs\.?|budget|under|below|around)?\s*(\d[\d,]{2,})/i);
  if (!match) return undefined;
  const amount = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(amount) ? { max: amount } : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function normalizeBudget(value: unknown): BudgetRangePreference | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as BudgetRangePreference;
  return { min: typeof record.min === "number" ? record.min : undefined, max: typeof record.max === "number" ? record.max : undefined };
}

function normalizeOrderRecord(value: unknown): OrderRecord | null {
  const order = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const now = Date.now();
  const createdAt = typeof order.createdAt === "number" ? order.createdAt : now;

  if (order.kind === "created") {
    const orderRef = typeof order.orderRef === "string" ? order.orderRef.trim() : "";
    if (!orderRef) return null;
    return {
      kind: "created",
      id: typeof order.id === "string" && order.id.trim() ? order.id.trim() : orderRef,
      orderRef,
      paymentUrl: typeof order.paymentUrl === "string" ? order.paymentUrl : undefined,
      expiresAt: typeof order.expiresAt === "string" ? order.expiresAt : undefined,
      createdAt,
      status: order.status === "payment_expired" ? "payment_expired" : "pending_payment",
      statusDisplay: typeof order.statusDisplay === "string" ? order.statusDisplay : "Payment pending",
      summary: order.summary && typeof order.summary === "object" ? order.summary as OrderSummary : undefined,
      lastCheckedAt: 0,
    };
  }

  if (order.kind === "completed") {
    const orderNumber = typeof order.orderNumber === "string" ? order.orderNumber.trim() : "";
    if (!orderNumber) return null;
    return {
      kind: "completed",
      id: typeof order.id === "string" && order.id.trim() ? order.id.trim() : orderNumber,
      orderNumber,
      createdAt,
      status: typeof order.status === "string" ? order.status : undefined,
      statusDisplay: typeof order.statusDisplay === "string" ? order.statusDisplay : undefined,
      tracking: Array.isArray(order.tracking) ? order.tracking as TrackingStep[] : undefined,
      amount: order.amount && typeof order.amount === "object" ? order.amount as MoneyAmount : undefined,
      recipient: order.recipient && typeof order.recipient === "object" ? order.recipient as OrderRecipient : undefined,
      deliveryDate: typeof order.deliveryDate === "string" ? order.deliveryDate : undefined,
      paymentMethod: typeof order.paymentMethod === "string" ? order.paymentMethod : undefined,
      comments: typeof order.comments === "string" ? order.comments : undefined,
      giftMessage: typeof order.giftMessage === "string" ? order.giftMessage : undefined,
      orderDate: typeof order.orderDate === "string" ? order.orderDate : undefined,
      shippedDate: typeof order.shippedDate === "string" ? order.shippedDate : undefined,
      lastCheckedAt: typeof order.lastCheckedAt === "number" ? order.lastCheckedAt : 0,
    };
  }

  const legacyOrderNumber = typeof order.orderNumber === "string" ? order.orderNumber.trim() : "";
  const legacyOrderRef = typeof order.orderRef === "string" ? order.orderRef.trim() : "";
  if (legacyOrderRef || order.paymentUrl || order.expiresAt || order.status === "pending_payment") {
    const orderRef = legacyOrderRef || legacyOrderNumber;
    if (!orderRef) return null;
    return {
      kind: "created",
      id: orderRef,
      orderRef,
      paymentUrl: typeof order.paymentUrl === "string" ? order.paymentUrl : undefined,
      expiresAt: typeof order.expiresAt === "string" ? order.expiresAt : undefined,
      createdAt,
      status: "pending_payment",
      statusDisplay: "Payment pending",
      summary: order.summary && typeof order.summary === "object" ? order.summary as OrderSummary : undefined,
      lastCheckedAt: 0,
    };
  }

  if (!legacyOrderNumber) return null;
  return {
    kind: "completed",
    id: legacyOrderNumber,
    orderNumber: legacyOrderNumber,
    createdAt,
    lastCheckedAt: typeof order.lastCheckedAt === "number" ? order.lastCheckedAt : 0,
  };
}

function normalizeSession(value: unknown): SessionState {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const prefs = record.preferences && typeof record.preferences === "object" ? record.preferences as Partial<SessionPreferences> : {};
  
  // Migrate from old orderHistory: string[] to orderRecords: OrderRecord[]
  let orderRecords: OrderRecord[] = [];
  if (Array.isArray(record.orderRecords)) {
    orderRecords = (record.orderRecords as unknown[])
      .map(normalizeOrderRecord)
      .filter((order): order is OrderRecord => Boolean(order))
      .slice(0, MAX_HISTORY)
  } else if (Array.isArray(record.orderHistory)) {
    orderRecords = (record.orderHistory as string[]).filter(isString).slice(0, MAX_HISTORY).map(n => ({
      kind: "completed",
      id: n,
      orderNumber: n,
      createdAt: Date.now(),
      lastCheckedAt: 0,
    }));
  }
  
  return {
    sessionId: typeof record.sessionId === "string" ? record.sessionId as string : generateFreshSession().sessionId,
    createdAt: typeof record.createdAt === "string" ? record.createdAt as string : new Date().toISOString(),
    lastOrderAt: typeof record.lastOrderAt === "string" ? record.lastOrderAt as string : undefined,
    preferences: {
      shoppingOccasionHistory: Array.isArray(prefs.shoppingOccasionHistory) ? prefs.shoppingOccasionHistory.filter(isString).slice(0, MAX_HISTORY) : [],
      budgetRangePreference: normalizeBudget(prefs.budgetRangePreference),
    },
    orderRecords,
    conversationTopics: Array.isArray(record.conversationTopics) ? (record.conversationTopics as string[]).filter(isString).slice(0, MAX_HISTORY) : [],
  };
}

function loadSession(): { session: SessionState; returning: boolean } {
  if (typeof window === "undefined") return { session: generateFreshSession(), returning: false };
  try {
    const loaded = persist.load<SessionState | null>(STORE_ID, VERSION, null);
    if (!loaded || !loaded.sessionId) return { session: generateFreshSession(), returning: false };
    return { session: normalizeSession(loaded), returning: true };
  } catch {
    return { session: generateFreshSession(), returning: false };
  }
}

function buildSessionContext(s: SessionState, returning: boolean) {
  const daysSinceLastOrder = s.lastOrderAt ? Math.floor((Date.now() - new Date(s.lastOrderAt).getTime()) / 86_400_000) : undefined;
  const profile = useProfile();
  const createdOrders = s.orderRecords.filter((r): r is CreatedOrderRecord => r.kind === "created");
  const completedOrders = s.orderRecords.filter((r): r is CompletedOrderRecord => r.kind === "completed");
  return {
    sessionId: s.sessionId,
    createdAt: s.createdAt,
    isReturningUser: returning,
    daysSinceLastOrder,
    preferences: s.preferences,
    createdOrderCount: createdOrders.length,
    completedOrderCount: completedOrders.length,
    createdOrders: createdOrders.map(r => ({ orderRef: r.orderRef, status: r.status, statusDisplay: r.statusDisplay, expiresAt: r.expiresAt })),
    completedOrders: completedOrders.map(r => ({ orderNumber: r.orderNumber, status: r.status, statusDisplay: r.statusDisplay, deliveryDate: r.deliveryDate })),
    conversationTopics: s.conversationTopics,
    language: profile.language,
    preferredCity: profile.preferredCity,
  };
}

class SessionStore {
  session = $state<SessionState>(createEmptySession());
  isReturningUser = $state(false);

  constructor() {
    if (typeof window !== "undefined") {
      const existing = loadSession();
      this.session = existing.session;
      this.isReturningUser = existing.returning;
    }
  }

  get sessionId() { return this.session.sessionId; }
  get createdAt() { return this.session.createdAt; }
  get lastOrderAt() { return this.session.lastOrderAt; }
  get preferences() { return this.session.preferences; }
  get conversationTopics() { return this.session.conversationTopics; }
  get createdOrders() { return this.session.orderRecords.filter((r): r is CreatedOrderRecord => r.kind === "created"); }
  get completedOrders() { return this.session.orderRecords.filter((r): r is CompletedOrderRecord => r.kind === "completed"); }
  get orderHistory() { return this.completedOrders.map(r => r.orderNumber); }
  get orderRecords() { return this.session.orderRecords; }
  get sessionContext() { return buildSessionContext(this.session, this.isReturningUser); }

  private commit() {
    persist.save(STORE_ID, VERSION, this.session);
  }

  addCompletedOrder(orderNumber?: string) {
    const value = orderNumber?.trim();
    if (!value) return;
    this.upsertOrderRecord({
      kind: "completed",
      id: value,
      orderNumber: value,
      createdAt: Date.now(),
      lastCheckedAt: 0,
    });
    this.session = { ...this.session, lastOrderAt: new Date().toISOString() };
    this.commit();
  }

  getCompletedOrderRecord(orderNumber: string): CompletedOrderRecord | undefined {
    return this.completedOrders.find(r => r.orderNumber === orderNumber);
  }

  upsertOrderRecord(record: OrderRecord): void {
    const idx = this.session.orderRecords.findIndex(r => r.kind === record.kind && r.id === record.id);
    let records: OrderRecord[];
    if (idx >= 0) {
      records = [...this.session.orderRecords];
      records[idx] = record;
    } else {
      records = [record, ...this.session.orderRecords];
    }
    this.session = { ...this.session, orderRecords: records.slice(0, MAX_HISTORY) };
    this.commit();
  }

  addTopic(topic: string) {
    const value = summarizeTopic(topic);
    if (!value) return;
    this.session = {
      ...this.session,
      conversationTopics: uniqueRecent([value, ...this.session.conversationTopics]),
      preferences: {
        ...this.session.preferences,
        shoppingOccasionHistory: uniqueRecent([...extractOccasions(value), ...this.session.preferences.shoppingOccasionHistory]),
        budgetRangePreference: extractBudget(value) ?? this.session.preferences.budgetRangePreference,
      },
    };
    this.commit();
  }

  clearSession() {
    this.session = generateFreshSession();
    this.isReturningUser = false;
    this.commit();
  }
}

const sessionInstance = new SessionStore();

export function useSession() {
  return sessionInstance;
}
