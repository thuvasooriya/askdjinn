import { describe, expect, test } from "bun:test";
import { turnToSegments, filterVoiceTranscript } from "../lib/stores/bubble-feed";
import type { Turn } from "../lib/stores/conversation.svelte";

function makeTurn(parts: Turn["parts"], opts: { streaming?: boolean; role?: "user" | "assistant" } = {}): Turn {
  return {
    id: "turn-1",
    role: opts.role ?? "assistant",
    parts,
    timestamp: 1000,
    source: "text",
    streaming: opts.streaming,
  };
}

const text = (t: string) => ({ type: "text" as const, text: t });
const tool = (id: string, name: string, status: "pending" | "done" | "error" = "done") => ({
  type: "tool-call" as const,
  id,
  name,
  status,
});

describe("turnToSegments", () => {
  test("returns empty for null turn", () => {
    expect(turnToSegments(null)).toEqual([]);
  });

  test("returns empty for user turns", () => {
    const t = makeTurn([text("hello")], { role: "user" });
    expect(turnToSegments(t)).toEqual([]);
  });

  test("extracts a single text segment", () => {
    const t = makeTurn([text("hello world")]);
    const segs = turnToSegments(t);
    expect(segs).toHaveLength(1);
    expect(segs[0].kind).toBe("text");
    if (segs[0].kind === "text") expect(segs[0].text).toBe("hello world");
  });

  test("merges contiguous text parts into one segment", () => {
    const t = makeTurn([text("hello "), text("world")]);
    const segs = turnToSegments(t);
    expect(segs).toHaveLength(1);
    if (segs[0].kind === "text") expect(segs[0].text).toBe("hello world");
  });

  test("splits text and tool calls into ordered segments", () => {
    const t = makeTurn([text("intro"), tool("t1", "search"), text("outro"), tool("t2", "order_create")]);
    const segs = turnToSegments(t);
    expect(segs).toHaveLength(4);
    expect(segs.map(s => s.kind)).toEqual(["text", "tool", "text", "tool"]);
    expect(segs[1].id).toBe("t1");
    expect(segs[3].id).toBe("t2");
  });

  test("skips empty text parts", () => {
    const t = makeTurn([text(""), text("real"), text("")]);
    const segs = turnToSegments(t);
    expect(segs).toHaveLength(1);
    if (segs[0].kind === "text") expect(segs[0].text).toBe("real");
  });

  test("propagates streaming flag to text segments", () => {
    const t = makeTurn([text("streaming...")], { streaming: true });
    const segs = turnToSegments(t);
    if (segs[0].kind === "text") expect(segs[0].streaming).toBe(true);
  });

  test("handles tool-only turn", () => {
    const t = makeTurn([tool("t1", "search"), tool("t2", "highlight")]);
    const segs = turnToSegments(t);
    expect(segs).toHaveLength(2);
    expect(segs.every(s => s.kind === "tool")).toBe(true);
  });
});

describe("filterVoiceTranscript", () => {
  test("returns all segments when show is true", () => {
    const segs = turnToSegments(makeTurn([text("hi"), tool("t1", "search")]));
    expect(filterVoiceTranscript(segs, true)).toHaveLength(2);
  });

  test("filters out text segments when show is false", () => {
    const segs = turnToSegments(makeTurn([text("hi"), tool("t1", "search")]));
    const filtered = filterVoiceTranscript(segs, false);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].kind).toBe("tool");
  });

  test("returns empty when only text and show is false", () => {
    const segs = turnToSegments(makeTurn([text("only text")]));
    expect(filterVoiceTranscript(segs, false)).toEqual([]);
  });
});
