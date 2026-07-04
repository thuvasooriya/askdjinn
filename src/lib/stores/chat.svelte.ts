// Chat orchestration store: client-side multi-step tool loop.
// Extracted from ConversationPanel so any component (AgentBar, etc)
// can trigger a text message and the loop runs the same way.

import { useConversation } from "./conversation.svelte";
import { useProfile } from "./profile.svelte";
import { useLists } from "./lists.svelte";
import { useUI } from "./ui.svelte";
import { useAgentStatus } from "./agent-status.svelte";
import { useInteraction } from "./interaction.svelte";
import { useSessionHistory } from "./session-history.svelte";
import { useCart } from "./cart.svelte";
import { useSession } from "./session.svelte";
import { toasts } from "$lib/ui/toast";
import { executeClientTool, summarizeToolCall, toolUiConfig } from "$lib/ai/tool-registry";
import { buildClientToolContext } from "$lib/ai/client-context";
import { buildTextPrompt, type PromptContext } from "$lib/ai/prompt";
import { buildLayoutContext } from "$lib/ai/layout-context";
import { formatMoney } from "$lib/money";
import { devLog } from "$lib/dev-log";
import type { Product } from "$lib/shopping-engine";
import type { ConversationMessage, WireMessage } from "$lib/types";


const MAX_STEPS = 8;

class ChatStore {
  isStreaming = $state(false);

  async send(text: string) {
    const conv = useConversation();
    const profile = useProfile();

    if ((!text.trim() && !conv.pendingImage) || this.isStreaming) return;

    const userTurnId = conv.addTurn("user", "text");
    if (text.trim()) {
      conv.setText(userTurnId, text.trim());
    }
    if (conv.pendingImage) {
      conv.addPart(userTurnId, { type: "image", base64: conv.pendingImage.base64, mimeType: conv.pendingImage.mimeType });
      conv.clearPendingImage();
    }
    conv.finishTurn(userTurnId);

    const session = useSession();
    if (text.trim()) {
      session.addTopic(text.trim());
    }

    await this.runChat();
  }

  private async runChat() {
    const conv = useConversation();
    const profile = useProfile();
    const lists = useLists();
    const ui = useUI();
    const interaction = useInteraction();
    const sessionHistory = useSessionHistory();
    const cart = useCart();
    const session = useSession();
    const agentStatus = useAgentStatus();

    const priorMessages: WireMessage[] = conv.toApiMessages().map(m => ({
      role: m.role, content: m.content, ...(m.images?.length ? { images: m.images } : {}),
    }));

    const assistantId = conv.addTurn("assistant", "text");
    const ctx = buildClientToolContext();
    const stepMessages: WireMessage[] = [];
    devLog.lifecycle("runChat start", { assistantId, prior: priorMessages.length });

    this.isStreaming = true;

    try {
      let steps = 0;
      while (steps++ < MAX_STEPS) {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...priorMessages, ...stepMessages],
            promptContext: this.buildPromptContext(),
          }),
        });
        if (!res.ok || !res.body) {
          const msg = await toasts.fromFetchError(res, "Chat request failed");
          throw new Error(msg);
        }
        const { text: assistantText, toolCalls, error } = await this.readChatStream(res.body, assistantId);
        if (error) throw new Error(error);
        stepMessages.push({ role: "assistant", content: assistantText, ...(toolCalls.length ? { toolCalls } : {}) });
        if (toolCalls.length === 0) break;

        for (const tc of toolCalls) {
          conv.addPart(assistantId, { type: "tool-call", id: tc.id, name: tc.name, status: "pending", args: tc.args, label: toolUiConfig[tc.name]?.label ?? tc.name });
          const status = this.toolStatus(tc.name);
          if (status) agentStatus.set(status.role, status.label);
          devLog.toolCall(tc.name, tc.args);
          const result = await executeClientTool(tc, ctx);
          const { summary, detail } = summarizeToolCall(tc.name, tc.args, result.response);
          devLog.info("tool result", { name: tc.name, summary, error: result.response.error, keys: Object.keys(result.response) });
          conv.completeToolCall(assistantId, tc.id, result.response.error ? "error" : "done", summary, detail, result.response);
          const products = (result.response as { products?: Product[] }).products;
          if (Array.isArray(products)) conv.addPart(assistantId, { type: "product-results", products });
          stepMessages.push({ role: "tool", toolCallId: tc.id, content: JSON.stringify(result.response) });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chat failed";
      const isRateLimited = /429|rate.?limit|quota|too_many_tokens/i.test(msg);
      if (isRateLimited) {
        toasts.warning("The AI service is busy. Please try again in a moment.");
        conv.appendText(assistantId, "I'm getting rate-limited right now. Please try again in a moment! ⏳");
      } else {
        toasts.error(msg);
        conv.appendText(assistantId, msg);
      }
    } finally {
      agentStatus.clear();
      conv.finalizePendingToolCalls(assistantId, "error");
      conv.finishTurn(assistantId);
      this.isStreaming = false;
      const flatMessages: ConversationMessage[] = conv.turns.map(t => ({ id: t.id, role: t.role, text: conv.getText(t) }));
      sessionHistory.saveCurrent(flatMessages);
    }
  }

  private async readChatStream(body: ReadableStream<Uint8Array>, assistantId: string) {
    const conv = useConversation();
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let evt: { type?: string; text?: string; toolCall?: { id: string; name: string; args: Record<string, unknown> }; error?: string };
        try { evt = JSON.parse(line); } catch { continue; }
        if (evt.type === "text" && evt.text) { text += evt.text; conv.appendText(assistantId, evt.text); }
        else if (evt.type === "tool-call" && evt.toolCall) { toolCalls.push(evt.toolCall); }
        else if (evt.type === "error" && evt.error) { devLog.error("stream error", evt.error); return { text, toolCalls, error: evt.error }; }
      }
    }
    return { text, toolCalls };
  }

  private buildPromptContext(): PromptContext {
    const profile = useProfile();
    const lists = useLists();
    const ui = useUI();
    const interaction = useInteraction();
    const session = useSession();
    const cart = useCart();

    return {
      agentId: profile.agentId,
      language: profile.language,
      savedFacts: profile.savedFacts.filter(f => f.confirmed).map(f => ({ text: f.text, category: f.category })),
      listsSummary: {
        liked: lists.liked.slice(0, 5).map(e => e.product.name),
        watch: lists.watch.slice(0, 5).map(e => e.product.name),
        preferences: profile.savedFacts.filter(f => f.confirmed).map(f => f.text),
      },
      notifications: lists.notifications,
      interactionContext: interaction.contextString,
      cartContext: this.buildCartContext(),
      cartItems: cart.items.map(i => ({ id: i.product.id, name: i.product.name, price: i.product.price, currency: i.product.currency, quantity: i.quantity })),
      userHighlightIds: ui.getUserHighlights(),
      layoutContext: buildLayoutContext(ui.panels, ui.tier, ui.activePanelId),
      visibleProducts: ui.searchThreads.map(t => ({
        query: t.query,
        products: t.products.slice(0, 6).map(p => ({ id: p.id, name: p.name, price: p.price, currency: p.currency })),
      })),
      sessionContext: {
        isReturningUser: session.isReturningUser,
        preferredCity: profile.preferredCity ?? undefined,
        preferences: {
          shoppingOccasionHistory: session.preferences.shoppingOccasionHistory,
          budgetRangePreference: session.preferences.budgetRangePreference,
        },
        orderCount: session.orderHistory.length,
        conversationTopics: session.conversationTopics,
      },
    };
  }

  private buildCartContext(): string {
    const cart = useCart();
    if (!cart.items.length) return "Cart is empty.";
    return cart.items.map((item, i) => `${i + 1}. ${item.product.name} x${item.quantity} (${formatMoney((item.product.price ?? 0) * item.quantity, item.product.currency)})`).join("\n");
  }

  private toolStatus(name: string): { role: string; label: string } | null {
    const cfg = toolUiConfig[name];
    if (!cfg) return null;
    return { role: cfg.label.toLowerCase().replace(/\s+/g, "-"), label: cfg.label };
  }
}

const instance = new ChatStore();
export function useChat() { return instance; }
