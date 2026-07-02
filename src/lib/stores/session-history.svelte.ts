/**
 * Session history store: persists conversation sessions across page reloads.
 * Uses unified persistence layer.
 */

import type { ConversationMessage } from "$lib/types";
import * as persist from "$lib/stores/persistence";

const STORE_ID = "session-history";
const VERSION = 1;
const MAX_SESSIONS = 10;

export type SessionEntry = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ConversationMessage[];
};

function load(): SessionEntry[] {
  const data = persist.load<SessionEntry[]>(STORE_ID, VERSION, []);
  return Array.isArray(data) ? data.slice(0, MAX_SESSIONS) : [];
}

class SessionHistoryStore {
  sessions = $state<SessionEntry[]>(load());
  activeId = $state<string | null>(null);

  private save() {
    persist.save(STORE_ID, VERSION, this.sessions);
  }

  saveCurrent(messages: ConversationMessage[]) {
    if (messages.length === 0) return;
    const firstUserMsg = messages.find(m => m.role === "user");
    const title = firstUserMsg?.text.slice(0, 50) ?? "Conversation";
    const now = Date.now();

    if (this.activeId) {
      this.sessions = this.sessions.map(s =>
        s.id === this.activeId
          ? { ...s, title, messages, updatedAt: now }
          : s
      );
    } else {
      const id = crypto.randomUUID();
      this.activeId = id;
      this.sessions = [{ id, title, messages, createdAt: now, updatedAt: now }, ...this.sessions].slice(0, MAX_SESSIONS);
    }
    this.save();
  }

  loadSession(id: string): ConversationMessage[] | null {
    const session = this.sessions.find(s => s.id === id);
    if (!session) return null;
    this.activeId = id;
    // Return a copy so callers cannot mutate the store's internal state directly.
    return session.messages.map(m => ({ ...m }));
  }

  deleteSession(id: string) {
    this.sessions = this.sessions.filter(s => s.id !== id);
    if (this.activeId === id) this.activeId = null;
    this.save();
  }

  startNew() {
    this.activeId = null;
  }

  clearAll() {
    this.sessions = [];
    this.activeId = null;
    this.save();
  }
}

const instance = new SessionHistoryStore();
export function useSessionHistory() { return instance; }
