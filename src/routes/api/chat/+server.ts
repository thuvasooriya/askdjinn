import { getTextModeToolSchemas } from "$lib/ai/tool-registry";
import { buildTextPrompt, type PromptContext } from "$lib/ai/prompt";
import { getLlmProvider } from "$lib/server/llm";
import type { LlmMessage } from "$lib/llm-engine";
import { checkRateLimit } from "$lib/server/rate-limiter";
import { isAllowedOrigin, originErrorResponse } from "$lib/server/origin-guard";
import type { RequestHandler } from "./$types";

// Thin, stateless stream proxy. The server does NOT execute tools and does NOT
// emit ui-commands. It streams model text + tool-CALLs only (NDJSON, one line
// per event). The client executes tools (same engine as live mode) and
// re-requests with the results, driving the multi-step loop. This keeps each
// function invocation short (one model step) instead of holding a connection
// open for an entire multi-step turn.
import type { WireMessage } from "$lib/types";

export const POST: RequestHandler = async ({ request }) => {
  if (!isAllowedOrigin(request)) return originErrorResponse();
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";
  if (!(await checkRateLimit(ip, 60, 60_000))) {
    return Response.json({ error: "Too many requests. Please try again in a minute." }, { status: 429 });
  }

  let body: { messages?: WireMessage[]; promptContext?: PromptContext };
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  // Main chat always uses opencode_zen — provider is a server-side decision,
  // not a client concern.
  let llm;
  try {
    llm = getLlmProvider("opencode_zen");
  } catch (err) {
    return Response.json({ error: "Chat service unavailable" }, { status: 503 });
  }

  const systemPrompt = buildTextPrompt(body.promptContext);
  const tools = getTextModeToolSchemas();
  const abortSignal = AbortSignal.timeout(60_000);

  const messages: LlmMessage[] = [
    { role: "system", content: systemPrompt },
    ...(body.messages ?? []).map(m => ({
      role: m.role,
      content: m.content,
      toolCallId: m.toolCallId,
      toolCalls: m.toolCalls,
      images: m.images,
    })),
  ];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const write = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        for await (const chunk of llm.streamChat(messages, { tools, abortSignal })) {
          if (!chunk.ok) { write({ type: "error", error: chunk.error.message }); break; }
          if (chunk.type === "text" && chunk.text) write({ type: "text", text: chunk.text });
          if (chunk.type === "tool-call") write({ type: "tool-call", toolCall: chunk.toolCall });
          if (chunk.type === "done") write({ type: "done" });
        }
      } catch (err) {
        write({ type: "error", error: err instanceof Error ? err.message : "Chat stream failed" });
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" } });
};
