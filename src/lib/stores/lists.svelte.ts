/**
 * Lists store: unified liked list, watch list, and preferences list.
 * Persists to localStorage. Supports JSON import/export.
 */

import type { Product } from "$lib/shopping-engine";
import * as persist from "$lib/stores/persistence";

const STORE_ID = "lists";
const VERSION = 1;

export type LikedEntry = { product: Product; addedAt: number };

export type WatchEntry = {
  product: Product;
  addedAt: number;
  targetPrice?: number;
  priceWhenAdded: number;
  previousPrices: { price: number; date: number }[];
  inStockWhenAdded: boolean;
  notifyOnPriceDrop: boolean;
  notifyOnRestock: boolean;
};


export type ListNotification = {
  id: string;
  type: "price-drop" | "restock" | "info";
  productName: string;
  productId?: string;
  message: string;
  timestamp: number;
};

export type ListsData = {
  liked: LikedEntry[];
  watch: WatchEntry[];
  notifications: ListNotification[];
};

function emptyData(): ListsData {
  return { liked: [], watch: [], notifications: [] };
}

class ListsStore {
  data = $state<ListsData>(emptyData());

  constructor() { this.load(); }

  private load() {
    this.data = { ...emptyData(), ...persist.load(STORE_ID, VERSION, emptyData()) };
  }

  private save() {
    persist.save(STORE_ID, VERSION, this.data);
  }

  // ── Liked ──────────────────────────────────────────
  get liked() { return this.data.liked; }
  get likedCount() { return this.data.liked.length; }

  isLiked(productId: string): boolean {
    return this.data.liked.some(e => e.product.id === productId);
  }

  toggleLike(product: Product) {
    if (this.isLiked(product.id)) this.unlike(product.id);
    else this.data = { ...this.data, liked: [...this.data.liked, { product, addedAt: Date.now() }] };
    this.save();
  }

  unlike(productId: string) {
    this.data = { ...this.data, liked: this.data.liked.filter(e => e.product.id !== productId) };
    this.save();
  }

  // ── Watch ──────────────────────────────────────────
  get watch() { return this.data.watch; }
  get watchCount() { return this.data.watch.length; }

  isWatching(productId: string): boolean {
    return this.data.watch.some(e => e.product.id === productId);
  }

  addToWatch(product: Product, targetPrice?: number) {
    if (this.isWatching(product.id)) return;
    const price = product.price ?? 0;
    const entry: WatchEntry = {
      product, targetPrice, priceWhenAdded: price,
      previousPrices: [{ price, date: Date.now() }],
      inStockWhenAdded: product.inStock !== false,
      notifyOnPriceDrop: true, notifyOnRestock: true,
      addedAt: Date.now(),
    };
    this.data = { ...this.data, watch: [...this.data.watch, entry] };
    this.save();
  }

  removeFromWatch(productId: string) {
    this.data = { ...this.data, watch: this.data.watch.filter(e => e.product.id !== productId) };
    this.save();
  }

  updateWatchPrice(productId: string, newPrice: number, inStock: boolean) {
    const entry = this.data.watch.find(e => e.product.id === productId);
    if (!entry) return;
    const oldPrice = entry.product.price ?? 0;
    if (entry.notifyOnPriceDrop && newPrice < oldPrice) {
      this.addNotification("price-drop", entry.product.name, entry.product.id,
        `Price dropped from ${oldPrice} to ${newPrice} LKR`);
    }
    if (entry.notifyOnRestock && !entry.inStockWhenAdded && inStock) {
      this.addNotification("restock", entry.product.name, entry.product.id, `Back in stock`);
    }
    // Cap history to avoid unbounded localStorage growth, and rebuild the
    // entry immutably so shared Product references elsewhere are not mutated.
    const previousPrices = [...entry.previousPrices, { price: newPrice, date: Date.now() }].slice(-50);
    const updatedProduct = { ...entry.product, price: newPrice, inStock };
    this.data = {
      ...this.data,
      watch: this.data.watch.map(e => e.product.id === productId
        ? { ...e, previousPrices, product: updatedProduct }
        : e),
    };
    this.save();
  }


  // ── Notifications ──────────────────────────────────
  get notifications() { return this.data.notifications; }

  get hasNotifications(): boolean {
    return this.data.notifications.length > 0;
  }

  private addNotification(type: ListNotification["type"], productName: string, productId: string | undefined, message: string) {
    const n: ListNotification = { id: crypto.randomUUID(), type, productName, productId, message, timestamp: Date.now() };
    this.data = { ...this.data, notifications: [n, ...this.data.notifications].slice(0, 20) };
    this.save();
  }

  clearNotifications() {
    this.data = { ...this.data, notifications: [] };
    this.save();
  }

  // ── Import / Export ────────────────────────────────
  exportJSON(): string {
    return JSON.stringify({ lists: this.data, exportedAt: new Date().toISOString() }, null, 2);
  }

  importJSON(json: string): boolean {
    try {
      const parsed = JSON.parse(json);
      if (parsed.lists && typeof parsed.lists === "object") {
        this.data = { ...emptyData(), ...parsed.lists };
        this.save();
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  get totalCount(): number {
    return this.data.liked.length + this.data.watch.length;
  }
}

const instance = new ListsStore();
export function useLists() { return instance; }
