/**
 * Interaction tracker: records which products the user hovers/views/clicks.
 * Provides context to the agent for personalization.
 */

import type { Product } from "$lib/shopping-engine";

export type InteractionEvent = {
  productId: string;
  productName: string;
  type: "hover" | "view" | "click";
  timestamp: number;
};

const MAX_EVENTS = 12;
const HOVER_DELAY_MS = 600;

class InteractionStore {
  events = $state<InteractionEvent[]>([]);
  recentProductIds = $state<string[]>([]);
  private hoverTimers = new Map<string, ReturnType<typeof setTimeout>>();

  get recentProductNames(): string[] {
    const seen = new Set<string>();
    return this.events
      .filter((e) => {
        if (seen.has(e.productName)) return false;
        seen.add(e.productName);
        return true;
      })
      .slice(0, 5)
      .map((e) => e.productName);
  }

  /** Returns a context string for the agent prompt */
  get contextString(): string {
    const recent = this.events.slice(0, 8);
    if (recent.length === 0) return "";
    const clicks = recent.filter((e) => e.type === "click");
    const hovers = recent.filter((e) => e.type === "hover");
    const parts: string[] = [];
    if (clicks.length)
      parts.push(
        `User recently clicked: ${clicks.map((e) => e.productName).join(", ")}`,
      );
    if (hovers.length)
      parts.push(
        `User recently viewed: ${hovers.map((e) => e.productName).join(", ")}`,
      );
    return parts.join(". ");
  }

  private addEvent(event: InteractionEvent) {
    this.events = [event, ...this.events].slice(0, MAX_EVENTS);
    // Update recent product dedup list
    const seen = new Set<string>();
    this.recentProductIds = this.events
      .filter((e) => {
        if (seen.has(e.productId)) return false;
        seen.add(e.productId);
        return true;
      })
      .slice(0, 10)
      .map((e) => e.productId);
  }

  onHover(product: Product) {
    // Debounce: only count as a hover if user lingers
    clearTimeout(this.hoverTimers.get(product.id));
    const timer = setTimeout(() => {
      this.addEvent({
        productId: product.id,
        productName: product.name,
        type: "hover",
        timestamp: Date.now(),
      });
      this.hoverTimers.delete(product.id);
    }, HOVER_DELAY_MS);
    this.hoverTimers.set(product.id, timer);
  }

  onHoverEnd(productId: string) {
    const timer = this.hoverTimers.get(productId);
    if (timer) {
      clearTimeout(timer);
      this.hoverTimers.delete(productId);
    }
  }

  onClick(product: Product) {
    this.addEvent({
      productId: product.id,
      productName: product.name,
      type: "click",
      timestamp: Date.now(),
    });
  }

  onView(product: Product) {
    this.addEvent({
      productId: product.id,
      productName: product.name,
      type: "view",
      timestamp: Date.now(),
    });
  }

  clear() {
    this.events = [];
    this.recentProductIds = [];
  }
}

const instance = new InteractionStore();
export function useInteraction() {
  return instance;
}
