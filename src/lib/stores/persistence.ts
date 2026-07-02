/**
 * Unified persistence layer for all client-side stores.
 *
 * Design:
 * - Single namespace prefix `djinn:` to avoid collisions with old keys.
 * - Versioned schema per store: if the stored version doesn't match, we
 *   attempt migration or fall back to defaults.
 * - Centralized `clearAll()` for the dev settings "clear cache" toggle.
 * - SSR-safe: all methods check `typeof window`.
 * - Migration from legacy keys on first load.
 */

export const PREFIX = "djinn:";
export const SCHEMA_VERSION = 1;

/** Map of legacy storage keys to new namespaced keys for migration.
 *  Covers every prior naming scheme (ruka-*, mithra-*, ruka:*) so no user
 *  loses their data when the prefix moves to `djinn:`. */
const LEGACY_KEY_MAP: Record<string, string> = {
  "ruka-profile": `${PREFIX}profile`,
  "ruka-conversation": `${PREFIX}conversation`,
  "ruka-lists": `${PREFIX}lists`,
  "mithra-cart": `${PREFIX}cart`,
  "mithra-session": `${PREFIX}session`,
  "mithra-dev-prefs": `${PREFIX}dev`,
  "ruka-sessions": `${PREFIX}session-history`,
  "ruka:profile": `${PREFIX}profile`,
  "ruka:conversation": `${PREFIX}conversation`,
  "ruka:lists": `${PREFIX}lists`,
  "ruka:cart": `${PREFIX}cart`,
  "ruka:session": `${PREFIX}session`,
  "ruka:dev": `${PREFIX}dev`,
  "ruka:session-history": `${PREFIX}session-history`,
};

/** All known storage keys (for clearAll) */
const ALL_KEYS = Object.values(LEGACY_KEY_MAP);

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Run one-time migration from legacy keys to new namespaced keys */
function migrateLegacyKeys() {
  if (!hasLocalStorage()) return;
  for (const [oldKey, newKey] of Object.entries(LEGACY_KEY_MAP)) {
    try {
      const existing = window.localStorage.getItem(newKey);
      if (existing) continue; // Already migrated
      const legacy = window.localStorage.getItem(oldKey);
      if (legacy) {
        window.localStorage.setItem(newKey, legacy);
        window.localStorage.removeItem(oldKey);
      }
    } catch {
      /* ignore quota / parse errors */
    }
  }
}

// Run migration once on module load
if (hasLocalStorage()) {
  migrateLegacyKeys();
}

/** Load a value from localStorage with schema version check */
export function load<T>(
  storeId: string,
  version: number,
  fallback: T,
  migrate?: (raw: unknown, fromVersion: number) => T,
): T {
  if (!hasLocalStorage()) return fallback;
  const key = `${PREFIX}${storeId}`;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as { v?: number; data: unknown } | unknown;

    // Handle old-style unversioned data (migrate from raw object)
    if (parsed && typeof parsed === "object" && "v" in (parsed as Record<string, unknown>) && "data" in (parsed as Record<string, unknown>)) {
      const envelope = parsed as { v: number; data: unknown };
      if (envelope.v === version) return envelope.data as T;
      if (migrate) return migrate(envelope.data, envelope.v);
      return fallback;
    }

    // Legacy unversioned data — try to use it directly or migrate
    if (migrate) return migrate(parsed, 0);
    return parsed as T;
  } catch {
    return fallback;
  }
}

/** Save a value to localStorage with schema version */
export function save<T>(storeId: string, version: number, data: T): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(`${PREFIX}${storeId}`, JSON.stringify({ v: version, data }));
  } catch {
    /* ignore quota errors */
  }
}

/** Clear a specific store */
export function clear(storeId: string): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(`${PREFIX}${storeId}`);
  } catch {
    /* ignore */
  }
}

/** Clear ALL djinn-related localStorage keys (current and all legacy schemes) */
export function clearAll(): void {
  if (!hasLocalStorage()) return;
  for (const key of ALL_KEYS) {
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
  }
  // Also clear any prefixed keys we might have missed
  try {
    const allKeys = Object.keys(window.localStorage);
    for (const k of allKeys) {
      if (k.startsWith(PREFIX) || k.startsWith("ruka:") || k.startsWith("ruka-") || k.startsWith("mithra-")) {
        window.localStorage.removeItem(k);
      }
    }
  } catch {
    /* ignore */
  }
}
