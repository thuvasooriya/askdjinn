import { describe, expect, test } from "bun:test";
import {
  canonicalize,
  parseHomeContextJson,
  stableContextKey,
  stripFences,
  timeOfDayFor,
} from "../lib/home-context";

describe("canonicalize", () => {
  test("sorts object keys recursively", () => {
    const result = canonicalize({ b: 1, a: { d: 4, c: 3 } });
    expect(JSON.stringify(result)).toBe(JSON.stringify({ a: { c: 3, d: 4 }, b: 1 }));
  });

  test("preserves array order", () => {
    const result = canonicalize(["b", "a", "c"]);
    expect(result).toEqual(["b", "a", "c"]);
  });

  test("passes through primitives", () => {
    expect(canonicalize(42)).toBe(42);
    expect(canonicalize("hi")).toBe("hi");
    expect(canonicalize(null)).toBe(null);
  });
});

describe("stableContextKey", () => {
  test("is identical for semantically-equal bodies with different key order", () => {
    const a = stableContextKey({ city: "Colombo", agentName: "Djinn", liked: [{ id: "1", name: "Cake" }] });
    const b = stableContextKey({ liked: [{ name: "Cake", id: "1" }], agentName: "Djinn", city: "Colombo" });
    expect(a).toBe(b);
  });

  test("excludes `force` so refresh hits the same slot", () => {
    const base = { agentName: "Djinn", liked: [] };
    expect(stableContextKey({ ...base, force: false })).toBe(stableContextKey({ ...base, force: true }));
  });

  test("changes when context changes (cache auto-busts)", () => {
    const before = stableContextKey({ agentName: "Djinn", completedOrders: [{ orderNumber: "A" }] });
    const after = stableContextKey({ agentName: "Djinn", completedOrders: [{ orderNumber: "A" }, { orderNumber: "B" }] });
    expect(before).not.toBe(after);
  });
});

describe("stripFences", () => {
  test("strips a ```json fence", () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  test("strips a bare ``` fence", () => {
    expect(stripFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  test("leaves unfenced content untouched", () => {
    expect(stripFences('{"a":1}')).toBe('{"a":1}');
  });
});

describe("parseHomeContextJson", () => {
  test("parses a clean full response", () => {
    const result = parseHomeContextJson(
      JSON.stringify({
        greeting: "Back again, Nimal.",
        summary: "Your **cake** is in stock.",
        suggestions: [
          { label: "Track order", query: "track VPAY123", icon: "track" },
          { label: "Find gifts", query: "gift ideas", icon: "gift" },
        ],
      }),
    );
    expect(result.greeting).toBe("Back again, Nimal.");
    expect(result.summary).toBe("Your **cake** is in stock.");
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[0].icon).toBe("track");
  });

  test("parses a fenced response", () => {
    const result = parseHomeContextJson('```json\n{"greeting":"Hi","summary":"","suggestions":[]}\n```');
    expect(result.greeting).toBe("Hi");
    expect(result.suggestions).toEqual([]);
  });

  test("clamps unknown icons to the default key", () => {
    const result = parseHomeContextJson(
      '{"greeting":"","summary":"","suggestions":[{"label":"x","query":"y","icon":"NONEXISTENT"}]}',
    );
    expect(result.suggestions[0].icon).toBe("search");
  });

  test("caps at 3 suggestions", () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ label: `L${i}`, query: `Q${i}`, icon: "search" }));
    const result = parseHomeContextJson(JSON.stringify({ greeting: "", summary: "", suggestions: five }));
    expect(result.suggestions).toHaveLength(3);
  });

  test("truncates over-long labels", () => {
    const longLabel = "x".repeat(120);
    const result = parseHomeContextJson(
      JSON.stringify({ greeting: "", summary: "", suggestions: [{ label: longLabel, query: "q", icon: "search" }] }),
    );
    expect(result.suggestions[0].label.length).toBe(60);
  });

  test("falls back per-field on partial garbage", () => {
    const result = parseHomeContextJson(
      '{"greeting":"Hello there","summary":null,"suggestions":"not-an-array"}',
    );
    expect(result.greeting).toBe("Hello there");
    expect(result.summary).toBe("");
    expect(result.suggestions).toEqual([]);
  });

  test("returns all-empty on unparseable content", () => {
    const result = parseHomeContextJson("the model rambled with no json at all");
    expect(result).toEqual({ greeting: "", summary: "", suggestions: [] });
  });
});

describe("timeOfDayFor", () => {
  test("maps hour ranges correctly", () => {
    expect(timeOfDayFor(8)).toBe("morning");
    expect(timeOfDayFor(12)).toBe("afternoon");
    expect(timeOfDayFor(18)).toBe("evening");
    expect(timeOfDayFor(22)).toBe("night");
  });
});
