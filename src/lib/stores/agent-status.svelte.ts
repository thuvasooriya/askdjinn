/**
 * Agent status store: tracks multi-agent status indicators
 * (e.g., "searching products", "checking delivery", "thinking").
 * Shown as a statusline in the UI.
 */

export type AgentStatusRole = string;

export type AgentStatus = {
  role: AgentStatusRole;
  label: string;
};

let currentStatus = $state<AgentStatus>({ role: "idle", label: "" });

export function useAgentStatus() {
  return {
    get status() { return currentStatus; },
    get isActive() { return currentStatus.role !== "idle"; },

    set(role: AgentStatusRole, label: string) {
      currentStatus = { role, label };
    },

    clear() {
      currentStatus = { role: "idle", label: "" };
    },
  };
}
