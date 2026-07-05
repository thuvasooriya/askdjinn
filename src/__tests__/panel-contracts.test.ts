import { describe, test, expect } from "bun:test";
import { CONTRACTS, getContract, PANEL_TYPES } from "$lib/panel-contracts";

describe("panel-contracts", () => {
  test("every PANEL_TYPES entry has a contract", () => {
    for (const type of PANEL_TYPES) {
      const c = CONTRACTS[type];
      expect(c, `missing contract for ${type}`).toBeDefined();
      expect(["single", "multiple"]).toContain(c.instances);
      expect(Array.isArray(c.layoutPreference)).toBe(true);
    }
  });
  test("form-collecting panels are single-instance", () => {
    expect(CONTRACTS["create-order"].instances).toBe("single");
    expect(CONTRACTS["address-select"].instances).toBe("single");
    expect(CONTRACTS["address-form"].instances).toBe("single");
  });
  test("browse panels are multiple-instance", () => {
    expect(CONTRACTS["product-detail"].instances).toBe("multiple");
    expect(CONTRACTS["order-tracking"].instances).toBe("multiple");
  });
  test("create-order declares required fillable fields", () => {
    const fields = CONTRACTS["create-order"].fields ?? [];
    const keys = fields.map(f => f.key);
    expect(keys).toContain("recipientName");
    expect(keys).toContain("deliveryCity");
    expect(keys).toContain("deliveryDate");
    expect(fields.find(f => f.key === "recipientName")?.required).toBe(true);
  });
  test("create-order deliveryDate has a future-date validator", () => {
    const f = CONTRACTS["create-order"].fields?.find(x => x.key === "deliveryDate");
    expect(f?.validate).toBeDefined();
    expect(f?.validate?.("not-a-date", {})).toBeTruthy();
    expect(f?.validate?.("2020-01-01", {})).toBeTruthy(); // past
    expect(f?.validate?.("2099-01-01", {})).toBeNull(); // future ok
  });
  test("getContract falls back for unknown type", () => {
    const fallback = getContract("does-not-exist" as never);
    expect(fallback.instances).toBe("multiple");
  });
});
