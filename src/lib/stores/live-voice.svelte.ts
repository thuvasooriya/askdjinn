/**
 * Gemini Live API voice store using raw WebSocket (no SDK import).
 *
 * Connects directly to Google's Live API WebSocket endpoint using an
 * ephemeral token minted by our backend. This keeps the entire
 * @google/genai SDK (16MB) out of the client bundle.
 *
 * Protocol: JSON messages in both directions. Audio is sent as base64-encoded
 * PCM chunks. The model responds with audio chunks, transcripts, and tool calls.
 */

import type { Product } from "$lib/shopping-engine";
import { getLiveModeDeclarations, executeClientTool, summarizeToolCall, type ClientToolContext } from "$lib/ai/tool-registry";
import { toolUiConfig } from "$lib/ai/tool-registry";
import { devLog } from "$lib/dev-log";
import { buildLivePrompt, type PromptContext } from "$lib/ai/prompt";
import { buildLayoutContext } from "$lib/ai/layout-context";
import { useConversation } from "$lib/stores/conversation.svelte";
import { useProfile } from "$lib/stores/profile.svelte";
import { useUI } from "$lib/stores/ui.svelte";
import { useCart } from "$lib/stores/cart.svelte";
import { useLists } from "$lib/stores/lists.svelte";
import { useSession } from "$lib/stores/session.svelte";
import { formatMoney } from "$lib/money";
import { toasts } from "$lib/ui/toast";

export type LiveVoiceState = "idle" | "connecting" | "connected" | "listening" | "speaking" | "error";
export type LiveLogEntry = {
  id: string;
  type: "tool-call" | "tool-result" | "ui-action" | "error" | "info";
  label: string;
  detail?: string;
  status?: "pending" | "success" | "error";
  timestamp: number;
};

const LIVE_WS_BASE = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";

class LiveVoiceStore {
  // Reactive state
  state = $state<LiveVoiceState>("idle");
  error = $state<string | null>(null);
  inputTranscript = $state("");
  outputTranscript = $state("");
  audioLevel = $state(0);
  isModelSpeaking = $state(false);
  videoStream = $state<MediaStream | null>(null);
  log = $state<LiveLogEntry[]>([]);

  // Non-reactive internals
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private micStream: MediaStream | null = null;
  private videoInterval: number | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private playbackContext: AudioContext | null = null;
  private playbackWorklet: AudioWorkletNode | null = null;
  private toolCtx: ClientToolContext | null = null;
  private connectResolve: ((ok: boolean) => void) | null = null;
  private connectInFlight: Promise<boolean> | null = null;
  private conv = useConversation();
  private profile = useProfile();
  private ui = useUI();
  private currentInputTurnId: string | null = null;
  private currentOutputTurnId: string | null = null;
  private pendingDisconnect = false;

  /** Callback when the session ends */
  onEnded: (() => void) | null = null;

  private addLog(type: LiveLogEntry["type"], label: string, detail?: string, status?: LiveLogEntry["status"]) {
    const entry: LiveLogEntry = {
      id: crypto.randomUUID(),
      type, label, detail, status,
      timestamp: Date.now(),
    };
    this.log = [...this.log, entry].slice(-50);
    return entry;
  }

  private updateLogStatus(id: string, status: LiveLogEntry["status"]) {
    this.log = this.log.map(e => e.id === id ? { ...e, status } : e);
  }

  async connect(ctx: ClientToolContext): Promise<boolean> {
    // Re-entrancy guard: orb hold/release/hold sequences (or any double-fire)
    // can call connect() while a previous attempt is still minting a token.
    // Dedupe — concurrent callers await the same in-flight attempt instead of
    // each firing another /api/live/token request.
    if (this.connectInFlight) return this.connectInFlight;
    this.connectInFlight = this.doConnect(ctx);
    try {
      return await this.connectInFlight;
    } finally {
      this.connectInFlight = null;
    }
  }

  private async doConnect(ctx: ClientToolContext): Promise<boolean> {
    if (this.state === "connecting" || this.state === "connected") {
      await this.disconnect();
    }

    this.state = "connecting";
    this.error = null;
    this.inputTranscript = "";
    this.outputTranscript = "";
    this.log = [];
    this.toolCtx = ctx;
    this.addLog("info", "Connecting to Gemini Live...");

    try {
      // 1. Get ephemeral token
      const tokenRes = await fetch("/api/live/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenData.error ?? "Failed to get token");
      if (!tokenData.token) throw new Error("No token returned");

      this.addLog("info", "Token acquired", undefined, "success");

      // 2. Setup audio capture
      await this.setupAudioCapture();
      this.addLog("info", "Audio capture ready", undefined, "success");

      // 3. Connect WebSocket
      const wsUrl = `${LIVE_WS_BASE}?access_token=${encodeURIComponent(tokenData.token)}`;
      this.ws = new WebSocket(wsUrl);

      return new Promise<boolean>((resolve) => {
        let resolved = false;
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            this.error = "Connection timeout (15s)";
            this.state = "error";
            this.addLog("error", "Connection timeout");
            resolve(false);
          }
        }, 15000);

        this.connectResolve = (ok: boolean) => {
          if (!resolved) { 
            resolved = true; 
            clearTimeout(timeout);
            resolve(ok); 
          }
        };

        this.ws!.onopen = () => {
          if (resolved) return;

          // Send setup configuration
          this.ws!.send(JSON.stringify({
            setup: {
              model: `models/${tokenData.model}`,
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: this.profile.agent.geminiVoice,
                    },
                  },
                },
              },
              systemInstruction: { parts: [{ text: buildLivePrompt(this.buildPromptContext()) + this.conv.toContextString() }] },
              tools: [{ functionDeclarations: getLiveModeDeclarations() }],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
            },
          }));

          this.addLog("info", "WebSocket open, waiting for setup confirmation...");
          devLog.ws("WebSocket open, sent setup");
        };

        this.ws!.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws!.onerror = (e) => {
          this.error = "WebSocket error";
          if (this.connectResolve) {
            this.state = "error";
            this.connectResolve(false);
            this.connectResolve = null;
          } else {
            this.state = "error";
            this.addLog("error", "WebSocket error", String(e));
          }
        };

        this.ws!.onclose = (e) => {
          this.handleClose(e.reason || "closed");
        };
      });
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Connection failed";
      this.state = "error";
      this.addLog("error", "Connection failed", this.error);
      await this.cleanup();
      return false;
    }
  }

  async disconnect() {
    try {
      if (this.ws) {
        this.ws.close(1000, "user disconnect");
        this.ws = null;
      }
    } catch { /* ignore */ }
    await this.cleanup();
    this.state = "idle";
    this.currentInputTurnId = null;
    this.currentOutputTurnId = null;
  }

  sendText(text: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      realtimeInput: {
        text,
      },
    }));
    this.inputTranscript = text;
  }

  sendImage(base64: string, mimeType = "image/jpeg") {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      realtimeInput: {
        video: { data: base64, mimeType }
      }
    }));
  }

  // ─── Audio ──────────────────────────────────────────────────────

  private async setupAudioCapture() {
    // Capture at 16kHz directly to match Gemini's expected input rate.
    // This avoids resampling artifacts.
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    await this.audioContext.audioWorklet.addModule("/audio-worklet/audio-processor.js");

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });

    const source = this.audioContext.createMediaStreamSource(this.micStream);
    this.workletNode = new AudioWorkletNode(this.audioContext, "audio-capture-processor");

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    source.connect(this.workletNode);

    this.workletNode.port.onmessage = (event: MessageEvent) => {
      const pcm16Buffer = event.data as ArrayBuffer;
      if (this.ws && this.ws.readyState === WebSocket.OPEN && (this.state === "connected" || this.state === "listening")) {
        const base64 = this.arrayBufferToBase64(pcm16Buffer);
        this.ws.send(JSON.stringify({
          realtimeInput: {
            audio: { data: base64, mimeType: "audio/pcm;rate=16000" },
          },
        }));
      }
      this.updateAudioLevel(pcm16Buffer);
    };

    // Playback at 24kHz via AudioWorklet for gapless audio.
    this.playbackContext = new AudioContext({ sampleRate: 24000 });
    await this.playbackContext.audioWorklet.addModule("/audio-worklet/playback-processor.js");
    this.playbackWorklet = new AudioWorkletNode(this.playbackContext, "pcm-playback-processor");
    
    if (this.playbackContext.state === "suspended") {
      await this.playbackContext.resume();
    }
    
    this.playbackWorklet.connect(this.playbackContext.destination);
  }

  private updateAudioLevel(buffer: ArrayBuffer) {
    const int16 = new Int16Array(buffer);
    let sum = 0;
    for (let i = 0; i < int16.length; i += 10) {
      sum += Math.abs(int16[i]) / 32768;
    }
    const avg = sum / Math.max(1, Math.floor(int16.length / 10));
    this.audioLevel = Math.min(1, avg * 3);
  }

  // ─── Message Handling ───────────────────────────────────────────

  private async handleMessage(data: unknown) {
    let msg: Record<string, unknown>;
    try {
      if (typeof data === "string") {
        msg = JSON.parse(data);
      } else if (data instanceof Blob) {
        msg = JSON.parse(await data.text());
      } else {
        return;
      }
    } catch { return; }

    devLog.ws("message", { hasSetup: !!msg.setupComplete, hasServerContent: !!msg.serverContent, hasToolCall: !!msg.toolCall });

    const setupComplete = msg.setupComplete as Record<string, unknown> | undefined;
    if (setupComplete) {
      this.state = "listening";
      this.addLog("info", "Live session connected", undefined, "success");

      // Send greeting so user gets immediate audio feedback.
      // If continuing from a text conversation, reference the last topic.
      const history = this.conv.toContextString();
      const greeting = history
        ? `Hi, let's continue. ${history.includes("User:") ? "You were asking about something just now. How can I help with that?" : "What can I help you find today?"}`
        : `Hi, I'm ${this.profile.agent.name}. What can I help you find today?`;
      const langInstruction = this.profile.language === "sinhala"
        ? "Greet in Sinhala."
        : this.profile.language === "tamil"
        ? "Greet in Tamil."
        : "Greet in English.";
      this.ws?.send(JSON.stringify({
        realtimeInput: { text: `(${greeting} ${langInstruction} Keep it very brief and natural.)` },
      }));

      this.connectResolve?.(true);
      this.connectResolve = null;
      return;
    }

    const serverContent = msg.serverContent as Record<string, unknown> | undefined;
    if (serverContent) {
      this.handleServerContent(serverContent);
    }

    const toolCall = msg.toolCall as { functionCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> } | undefined;
    if (toolCall?.functionCalls?.length && this.toolCtx) {
      await this.handleToolCall(toolCall.functionCalls);
    }
  }

  private handleServerContent(content: Record<string, unknown>) {
    const modelTurn = content.modelTurn as { parts?: Array<Record<string, unknown>> } | undefined;

    if (modelTurn?.parts) {
      for (const part of modelTurn.parts) {
        if (part.inlineData) {
          const inlineData = part.inlineData as { data: string; mimeType?: string };
          this.queueAudioPlayback(inlineData.data);
          this.isModelSpeaking = true;
          this.state = "speaking";
        }
        if (part.text) {
          this.outputTranscript += part.text as string;
        }
      }
    }


    const inputTranscription = content.inputTranscription as { text?: string; finished?: boolean } | undefined;
    if (inputTranscription?.text) {
      this.inputTranscript = inputTranscription.text;
      if (!this.currentInputTurnId) {
        this.currentInputTurnId = this.conv.addTurn("user", "voice");
      }
      this.conv.setText(this.currentInputTurnId, inputTranscription.text);
    }

    const outputTranscription = content.outputTranscription as { text?: string; finished?: boolean } | undefined;
    if (outputTranscription?.text) {
      this.outputTranscript = (this.outputTranscript || "") + outputTranscription.text;
      if (!this.currentOutputTurnId) {
        this.currentOutputTurnId = this.conv.addTurn("assistant", "voice");
      }
      this.conv.setText(this.currentOutputTurnId, this.outputTranscript);
    }

    if (content.turnComplete === true || content.interrupted === true) {
      this.isModelSpeaking = false;
      if (this.state === "speaking") {
        this.state = "listening";
      }
      if (content.interrupted === true) {
        this.flushPlaybackQueue();
        this.addLog("info", "User interrupted (barge-in)");
      }
      // Finalize conversation turns on turn complete
      if (content.turnComplete === true) {
        if (this.currentInputTurnId) { this.conv.finishTurn(this.currentInputTurnId); this.currentInputTurnId = null; }
        if (this.currentOutputTurnId) { this.conv.finishTurn(this.currentOutputTurnId); this.currentOutputTurnId = null; this.outputTranscript = ""; }
      }

      // Gracefully disconnect if agent requested end of session
      if (this.pendingDisconnect) {
        this.pendingDisconnect = false;
        this.disconnect();
      }
    }
  }

  private async handleToolCall(functionCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>) {
    if (!this.ws || !this.toolCtx) return;
    devLog.info("handleToolCall", { count: functionCalls.length, calls: functionCalls.map(c => c.name) });
    const responses: Array<{ id: string; name: string; response: Record<string, unknown> }> = [];

    for (const call of functionCalls) {
      if (!this.currentOutputTurnId) {
        this.currentOutputTurnId = this.conv.addTurn("assistant", "voice");
      }
      const label = toolUiConfig[call.name]?.label ?? call.name;
      this.conv.addPart(this.currentOutputTurnId, { type: "tool-call", id: call.id, name: call.name, status: "pending", args: call.args, label });

      if (call.name === "ui_ask_user") {
        const question = call.args.question as string;
        const options = call.args.options as string[];
        this.ui.setAskUser(question, options, (answer) => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            if (answer) {
              this.ws.send(JSON.stringify({
                realtimeInput: { text: `(User tapped: ${answer})` },
              }));
            } else {
              this.ws.send(JSON.stringify({
                realtimeInput: { text: `(User dismissed the question modal)` },
              }));
            }
          }
        });
        responses.push({ id: call.id, name: "ui_ask_user", response: { asked: true } });
        const { summary, detail } = summarizeToolCall(call.name, call.args, { asked: true });
        this.conv.completeToolCall(this.currentOutputTurnId, call.id, "done", summary, detail);
        continue;
      }

      try {
        const result = await executeClientTool(call, this.toolCtx!);
        responses.push(result);
        devLog.toolResult(call.name, result.response);
        const { summary, detail } = summarizeToolCall(call.name, call.args, result.response);
        this.conv.completeToolCall(this.currentOutputTurnId, call.id, result.response.error == null ? "done" : "error", summary, detail, result.response);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        this.conv.completeToolCall(this.currentOutputTurnId, call.id, "error", `${call.name} failed`, errMsg, { error: errMsg });
        this.addLog("error", `${call.name} failed`, errMsg, "error");
        responses.push({ id: call.id, name: call.name, response: { error: errMsg } });
      }
    }

    const toolResponse: { id: string; name: string; response: Record<string, unknown> }[] = responses;
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        toolResponse: {
          functionResponses: toolResponse.map(r => ({
            id: r.id,
            name: r.name,
            response: r.response,
          })),
        },
      }));
    }

    if (functionCalls.some(c => c.name === "live_end_session")) {
      this.pendingDisconnect = true;
    }
  }

  // ─── Audio Playback ─────────────────────────────────────────────

  private queueAudioPlayback(base64Data: string) {
    if (!this.playbackWorklet) return;
    const float32 = this.base64ToFloat32(base64Data);
    this.playbackWorklet.port.postMessage(float32, [float32.buffer]);
  }

  private flushPlaybackQueue() {
    if (this.playbackWorklet) {
      this.playbackWorklet.port.postMessage("interrupt");
    }
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  private handleClose(reason: string) {
    if (this.connectResolve) {
      this.connectResolve(false);
      this.connectResolve = null;
    }
    devLog.ws("WebSocket closed", { reason });
    if (reason && reason !== "closed" && reason !== "user disconnect") {
      this.error = `Session ended: ${reason}`;
      this.addLog("error", "Session closed", reason);
    } else {
      this.addLog("info", "Session ended");
    }
    this.ws = null;
    this.isModelSpeaking = false;
    if (this.state !== "error") {
      this.state = "idle";
    }
    this.onEnded?.();
    this.cleanupAudio();
  }

  private async cleanup() {
    this.cleanupAudio();
    this.stopVideoStream();
  }

  async startVideoStream() {
    if (this.videoStream) return;
    try {
      this.videoStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } }
      });

      this.videoElement = document.createElement("video");
      this.videoElement.srcObject = this.videoStream;
      this.videoElement.autoplay = true;
      this.videoElement.playsInline = true;
      this.videoElement.muted = true;
      await this.videoElement.play().catch(() => {});

      this.canvasElement = document.createElement("canvas");
      this.canvasElement.width = 480;
      this.canvasElement.height = 360;

      if (this.videoInterval) window.clearInterval(this.videoInterval);
      this.videoInterval = window.setInterval(() => {
        this.captureFrameAndSend();
      }, 1000);

      toasts.success("Video streaming active");
    } catch (err) {
      devLog.error("Failed to start video stream", err);
      throw new Error(err instanceof Error ? err.message : "Failed to access camera");
    }
  }

  stopVideoStream() {
    if (this.videoInterval) {
      window.clearInterval(this.videoInterval);
      this.videoInterval = null;
    }
    if (this.videoStream) {
      this.videoStream.getTracks().forEach(t => t.stop());
      this.videoStream = null;
    }
    this.videoElement = null;
    this.canvasElement = null;
  }

  private captureFrameAndSend() {
    if (!this.videoStream || !this.videoElement || !this.canvasElement) return;
    if (this.videoElement.readyState < this.videoElement.HAVE_CURRENT_DATA) return;
    const ctx = this.canvasElement.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);
    const dataUrl = this.canvasElement.toDataURL("image/jpeg", 0.6);
    const base64 = dataUrl.split(",")[1];
    this.sendImage(base64, "image/jpeg");
  }
  private cleanupAudio() {
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      try { this.workletNode.disconnect(); } catch { /* noop */ }
    }
    this.workletNode = null;
    
    if (this.playbackWorklet) {
      this.playbackWorklet.port.onmessage = null;
      try { this.playbackWorklet.disconnect(); } catch { /* noop */ }
    }
    this.playbackWorklet = null;
    
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    try { this.audioContext?.close(); } catch { /* noop */ }
    this.audioContext = null;
    try { this.playbackContext?.close(); } catch { /* noop */ }
    this.playbackContext = null;
  }

  // ─── Encoding ───────────────────────────────────────────────────

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToFloat32(base64: string): Float32Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }
    return float32;
  }

  private buildPromptContext(): PromptContext {
    const profile = useProfile();
    const lists = useLists();
    const ui = useUI();
    const session = useSession();
    const cart = useCart();
    const activeProductId = ui.galleryState?.productId ?? ui.productDetailId;
    const activeProduct = activeProductId ? ui.productRegistry.get(activeProductId) : null;

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
      cartContext: !cart.items.length ? "Cart is empty." : cart.items.map((item, i) => `${i + 1}. ${item.product.name} x${item.quantity} (${formatMoney((item.product.price ?? 0) * item.quantity, item.product.currency)})`).join("\n"),
      cartItems: cart.items.map(i => ({ id: i.product.id, name: i.product.name, price: i.product.price, currency: i.product.currency, quantity: i.quantity })),
      userHighlightIds: ui.getUserHighlights(),
      layoutContext: buildLayoutContext(ui.panels, ui.tier, ui.activePanelId),
      visibleProducts: ui.searchThreads.map(t => ({
        query: t.query,
        products: t.products.slice(0, 6).map(p => ({
          id: p.id,
          name: p.name,
          price: p.price,
          currency: p.currency,
          highlighted: ui.highlightedIds.has(p.id),
          highlightReason: ui.annotations.get(p.id),
          userHighlighted: ui.userHighlights.has(p.id),
        })),
      })),
      activeProductContext: {
        productDetailId: ui.productDetailId,
        galleryProductId: ui.galleryState?.productId ?? null,
        galleryOpen: Boolean(ui.galleryState?.open),
        galleryIndex: ui.galleryState?.activeIndex,
        productName: activeProduct?.name,
      },
      sessionContext: {
        isReturningUser: session.isReturningUser,
        preferredCity: profile.preferredCity ?? undefined,
        preferences: {
          shoppingOccasionHistory: session.preferences.shoppingOccasionHistory,
          budgetRangePreference: session.preferences.budgetRangePreference,
        },
        createdOrderCount: session.createdOrders.length,
        completedOrderCount: session.completedOrders.length,
        createdOrders: session.createdOrders.map(order => ({
          orderRef: order.orderRef,
          status: order.status,
          statusDisplay: order.statusDisplay,
          expiresAt: order.expiresAt,
        })),
        completedOrders: session.completedOrders.map(order => ({
          orderNumber: order.orderNumber,
          status: order.status,
          statusDisplay: order.statusDisplay,
          deliveryDate: order.deliveryDate,
        })),
        conversationTopics: session.conversationTopics,
      },
    };
  }
}

const liveVoiceInstance = new LiveVoiceStore();

export function useLiveVoice() {
  return liveVoiceInstance;
}

