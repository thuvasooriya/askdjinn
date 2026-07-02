import { describe, expect, test } from "bun:test";
import { formatMoney } from "../lib/money";

const digitsOnly = (value: string) => value.replace(/[^0-9]/g, "");

describe("formatMoney", () => {
  test("formats LKR amounts correctly", () => {
    const result = formatMoney(5000, "LKR");

    expect(result).toContain("LKR");
    expect(digitsOnly(result)).toBe("5000");
  });

  test("handles zero", () => {
    const result = formatMoney(0, "LKR");

    expect(result).toContain("LKR");
    expect(digitsOnly(result)).toBe("0");
  });

  test("handles large numbers", () => {
    const result = formatMoney(1234567, "LKR");

    expect(result).toContain("LKR");
    expect(digitsOnly(result)).toBe("1234567");
  });

  test("handles undefined currency by using LKR", () => {
    const result = formatMoney(1000, undefined);

    expect(result).toContain("LKR");
    expect(digitsOnly(result)).toBe("1000");
  });

  test("returns currency with dash when amount is missing", () => {
    const result = formatMoney(undefined);
    expect(result).toContain("LKR");
    expect(result).toContain("\u2014");
  });
});
