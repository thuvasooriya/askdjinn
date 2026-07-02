import { getConfiguredProviders, hasLiveVoice } from "$lib/server/llm";
import { getMcpClient } from "$lib/server/mcp";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  const providers = getConfiguredProviders();
  const live = hasLiveVoice();
  try {
    const result = await getMcpClient(6_000).listTools();
    if (!result.ok) throw result.error;
    return Response.json({
      ok: true,
      service: "djinn",
      mcp: "connected",
      tools: result.data.length,
      providers,
      live,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP unavailable";
    return Response.json({ ok: false, service: "djinn", mcp: "degraded", error: message, providers, live }, { status: 503 });
  }
};
