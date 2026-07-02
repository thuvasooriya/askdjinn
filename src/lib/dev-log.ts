/**
 * Debug mode system.
 *
 * Uses `import.meta.env.DEV` which is `true` in development (via Vite's dev
 * server and `vite build --mode development`) and `false` in production
 * builds. Vite tree-shakes all calls away in production.
 *
 * In development, logs are written to the console AND an in-memory ring buffer
 * that can be inspected via a debug overlay or exported.
 *
 * In SvelteKit, the standard approach for environment-gated code is:
 *   - `import.meta.env.DEV` (Vite compile-time boolean, tree-shaken in prod)
 *   - `$app/environment` has `dev` boolean (SvelteKit's own dev flag)
 *   Both work. We use `import.meta.env.DEV` because it's tree-shaken by Vite,
 *   meaning zero overhead in production bundles.
 */

export type LogLevel = "info" | "warn" | "error" | "debug";

export type DebugEntry = {
  id: string;
  timestamp: number;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
};

const MAX_ENTRIES = 500;

const isDev = import.meta.env.DEV;
const PREFIX = "[djinn]";
const entries: DebugEntry[] = [];
const listeners: Set<(entries: DebugEntry[]) => void> = new Set();

function notifyListeners() {
  const snapshot = entries.slice();
  for (const fn of listeners) fn(snapshot);
}

function addEntry(level: LogLevel, category: string, message: string, data?: unknown): DebugEntry {
  const entry: DebugEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    level, category, message, data,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();
  return entry;
}

function log(level: LogLevel, category: string, message: string, data?: unknown) {
  if (!isDev) return;
  const entry = addEntry(level, category, message, data);
  const time = new Date(entry.timestamp).toISOString().slice(11, 23);
  const label = `${PREFIX} ${time} ${level.toUpperCase()} [${category}] ${message}`;
  if (level === "error") console.error(label, data ?? "");
  else if (level === "warn") console.warn(label, data ?? "");
  else if (level === "debug") console.debug(label, data ?? "");
  else console.log(label, data ?? "");
  notifyListeners();
}

export const devLog = {
  toolCall(name: string, args?: unknown) { log("info", "tool-call", name, args); },
  toolResult(name: string, result: unknown) { log("info", "tool-result", name, result); },
  toolError(name: string, err: unknown) { log("error", "tool-call", `${name} failed`, err); },
  uiCommand(action: string, data?: unknown) { log("info", "ui-command", action, data); },
  ws(message: string, data?: unknown) { log("info", "websocket", message, data); },
  error(message: string, err?: unknown) { log("error", "error", message, err); },
  warn(message: string, data?: unknown) { log("warn", "warn", message, data); },
  info(message: string, data?: unknown) { log("info", "info", message, data); },
  debug(message: string, data?: unknown) { log("debug", "debug", message, data); },
  lifecycle(message: string, data?: unknown) { log("info", "lifecycle", message, data); },
};

/** Get all debug entries (ring buffer snapshot). Dev only. */
export function getDebugEntries(): DebugEntry[] {
  return entries.slice();
}

/** Subscribe to debug entry changes. Returns unsubscribe fn. Dev only. */
export function subscribeToDebug(fn: (entries: DebugEntry[]) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Clear debug buffer. Dev only. */
export function clearDebugEntries(): void {
  entries.length = 0;
  notifyListeners();
}

/** Export debug entries as a formatted string for sharing. Dev only. */
export function exportDebugLog(): string {
  const lines = entries.map((e) => {
    const time = new Date(e.timestamp).toISOString().slice(11, 23);
    const dataStr = e.data ? ` ${JSON.stringify(e.data)}` : "";
    return `${time} ${e.level.toUpperCase()} [${e.category}] ${e.message}${dataStr}`;
  });
  return lines.join("\n");
}
