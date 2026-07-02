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

export interface OrderRecord {
  orderNumber: string;
  paymentUrl?: string;
  createdAt: number;
  status?: string;
  statusDisplay?: string;
  summary?: { itemsTotal?: number; deliveryFee?: number; grandTotal?: number; currency?: string };
  tracking?: { step: string; timestamp?: string }[];
  amount?: { value: number; currency: string };
  recipient?: { name?: string; phone?: string; address?: string; city?: string };
  deliveryDate?: string;
  paymentMethod?: string;
  comments?: string;
  giftMessage?: string;
  orderDate?: string;
  shippedDate?: string;
  lastCheckedAt: number;
}

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

function normalizeSession(value: unknown): SessionState {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const prefs = record.preferences && typeof record.preferences === "object" ? record.preferences as Partial<SessionPreferences> : {};
  
  // Migrate from old orderHistory: string[] to orderRecords: OrderRecord[]
  let orderRecords: OrderRecord[] = [];
  if (Array.isArray(record.orderRecords)) {
    orderRecords = (record.orderRecords as OrderRecord[]).slice(0, MAX_HISTORY);
  } else if (Array.isArray(record.orderHistory)) {
    orderRecords = (record.orderHistory as string[]).filter(isString).slice(0, MAX_HISTORY).map(n => ({
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
  return {
    sessionId: s.sessionId,
    createdAt: s.createdAt,
    isReturningUser: returning,
    daysSinceLastOrder,
    preferences: s.preferences,
    orderCount: s.orderRecords.length,
    orderHistory: s.orderRecords.map(r => r.orderNumber),
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
      // Seed default test order if no order records exist
      if (this.session.orderRecords.length === 0) {
        this.upsertOrderRecord({
          orderNumber: "VPAY827982BA",
          createdAt: Date.now(),
          status: "delivered",
          statusDisplay: "Delivered",
          lastCheckedAt: 0,
        });
      }
    }
  }

  get sessionId() { return this.session.sessionId; }
  get createdAt() { return this.session.createdAt; }
  get lastOrderAt() { return this.session.lastOrderAt; }
  get preferences() { return this.session.preferences; }
  get conversationTopics() { return this.session.conversationTopics; }
  get orderHistory() { return this.session.orderRecords.map(r => r.orderNumber); }
  get orderRecords() { return this.session.orderRecords; }
  get sessionContext() { return buildSessionContext(this.session, this.isReturningUser); }

  private commit() {
    persist.save(STORE_ID, VERSION, this.session);
  }

  addOrder(orderNumber?: string) {
    const value = orderNumber?.trim();
    if (!value) return;
    this.upsertOrderRecord({
      orderNumber: value,
      createdAt: Date.now(),
      lastCheckedAt: 0,
    });
    this.session = { ...this.session, lastOrderAt: new Date().toISOString() };
    this.commit();
  }

  getOrderRecord(orderNumber: string): OrderRecord | undefined {
    return this.session.orderRecords.find(r => r.orderNumber === orderNumber);
  }

  upsertOrderRecord(record: OrderRecord): void {
    const idx = this.session.orderRecords.findIndex(r => r.orderNumber === record.orderNumber);
    const updated = { ...record, lastCheckedAt: Date.now() };
    let records: OrderRecord[];
    if (idx >= 0) {
      records = [...this.session.orderRecords];
      records[idx] = updated;
    } else {
      records = [updated, ...this.session.orderRecords];
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
