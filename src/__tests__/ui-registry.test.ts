import { describe, test, expect } from "bun:test";
import { createPanel, applyFill, canOpen, validatePanel } from "$lib/stores/panel-registry";
import type { Panel } from "$lib/stores/panel-registry";

describe("panel-registry pure logic", () => {
  test("createPanel for static uses the type as id", () => {
    const p = createPanel("cart", { kind: "static" });
    expect(p.id).toBe("cart");
    expect(p.kind).toBe("static");
    expect(p.status).toBe("idle");
    expect(p.title).toBe("Cart");
  });

  test("createPanel for dynamic gets a uuid and is not the type", () => {
    const p = createPanel("checkout", { kind: "dynamic", resolve: () => {} });
    expect(p.kind).toBe("dynamic");
    expect(p.id).not.toBe("checkout");
    expect(p.id.length).toBeGreaterThan(8);
    expect(typeof p.resolve).toBe("function");
  });

  test("canOpen returns existing for single-instance type", () => {
    const existing = createPanel("checkout", { kind: "dynamic", resolve: () => {} });
    expect(canOpen([existing], "checkout")).toBe(existing);
  });

  test("canOpen returns null when no existing single-instance panel", () => {
    expect(canOpen([], "checkout")).toBeNull();
  });

  test("canOpen returns null for multiple-instance even if one exists", () => {
    const existing = createPanel("product-detail", { kind: "static" });
    expect(canOpen([existing], "product-detail")).toBeNull();
  });

  test("applyFill validates and writes valid values", () => {
    const p = createPanel("checkout", { kind: "dynamic", resolve: () => {} }) as Panel;
    p.data = {};
    const ok = applyFill(p, "deliveryDate", "2099-01-01");
    expect(ok.ok).toBe(true);
    expect(p.data.deliveryDate).toBe("2099-01-01");
    expect(p.status).toBe("has-update");
  });

  test("applyFill rejects invalid values with an error message", () => {
    const p = createPanel("checkout", { kind: "dynamic", resolve: () => {} }) as Panel;
    const bad = applyFill(p, "deliveryDate", "2020-01-01"); // past
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBeTruthy();
    expect(p.data.deliveryDate).toBeUndefined(); // not written
  });

  test("applyFill rejects unknown fields", () => {
    const p = createPanel("checkout", { kind: "dynamic", resolve: () => {} }) as Panel;
    const r = applyFill(p, "nonexistentField", "x");
    expect(r.ok).toBe(false);
  });

  test("validatePanel reports missing required + invalid", () => {
    const p = createPanel("checkout", { kind: "dynamic", resolve: () => {} }) as Panel;
    p.data = { deliveryDate: "2020-01-01" }; // invalid date, missing requireds
    const v = validatePanel(p);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.missing).toContain("recipientName");
      expect(v.invalid.find(i => i.key === "deliveryDate")).toBeTruthy();
    }
  });

  test("validatePanel ok when all required present + valid", () => {
    const p = createPanel("checkout", { kind: "dynamic", resolve: () => {} }) as Panel;
    p.data = {
      recipientName: "Amara", recipientPhone: "+94771234567", streetAddress: "5 Galle Rd",
      deliveryCity: "Galle", deliveryDate: "2099-01-01", senderName: "Kasun",
    };
    expect(validatePanel(p).ok).toBe(true);
  });

  test("validatePanel on non-fillable panel returns ok", () => {
    const p = createPanel("cart", { kind: "static" }) as Panel;
    expect(validatePanel(p).ok).toBe(true);
  });
});
