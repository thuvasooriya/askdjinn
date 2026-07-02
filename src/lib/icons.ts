/**
 * Centralized icon mapping.
 * Maps agent icon names and language identifiers to Lucide components.
 */

import {
  Flame, Moon, Flower2, BarChart3,
  Globe, Mic, MicOff, Check, Languages,
  Type, BookOpen, Sparkles, ShoppingBag,
} from "@lucide/svelte";
import type { Component } from "svelte";

/** The component type for Lucide icons */
export type ComponentType = Component;

/** Map agent icon name to Lucide component */
export const agentIcons: Record<string, Component> = {
  flame: Flame,
  moon: Moon,
  flower: Flower2,
  chart: BarChart3,
};

/** Map language to Lucide component */
export const languageIcons: Record<string, Component> = {
  english: Type,
  sinhala: BookOpen,
  tamil: BookOpen,
};

/** Re-export commonly used icons */
export { Globe, Mic, MicOff, Check, Languages, ShoppingBag, Sparkles, Flame, Moon, Flower2, BarChart3 };
