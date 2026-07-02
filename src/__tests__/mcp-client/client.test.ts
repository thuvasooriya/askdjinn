import { describe, expect, test } from "bun:test";
import { toMcpArguments } from "../../lib/mcp-client/client";

describe("toMcpArguments", () => {
  test("strips null values and wraps arguments in params", () => {
    const result = toMcpArguments({ city: "Colombo", date: null, productId: undefined, quantity: 2 });

    expect(result).toEqual({ params: { response_format: "json", city: "Colombo", quantity: 2 } });
  });

  test("adds requested response_format", () => {
    const result = toMcpArguments({ q: "cake" }, "text");

    expect(result).toEqual({ params: { response_format: "text", q: "cake" } });
  });
});
