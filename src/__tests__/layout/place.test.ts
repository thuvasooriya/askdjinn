import { describe, test, expect } from "bun:test";
import { selectLayout, selectVisiblePanels } from "$lib/layout/place";
import { createPanel, type Panel } from "$lib/stores/panel-registry";

describe("selectLayout purity (the state_unsafe_mutation fix)", () => {
  test("does NOT mutate panel.minimized during placement", () => {
    const a = createPanel("cart", { kind: "static", pinned: true });
    const b = createPanel("wishlist", { kind: "static" });
    const c = createPanel("sessions", { kind: "static" });
    const d = createPanel("product-detail", { kind: "static" });
    // All four open, but split-wide caps at 3 → one must overflow WITHOUT
    // its minimized flag being written by selectLayout.
    const before = [a, b, c, d].map(p => ({ id: p.id, minimized: p.minimized }));
    const placement = selectLayout([a, b, c, d], "split-wide");
    const after = [a, b, c, d].map(p => ({ id: p.id, minimized: p.minimized }));
    // The raw flags must be unchanged — overflow is expressed in placement.minimized only.
    expect(after).toEqual(before);
    // But placement.minimized must still report the overflow panel.
    expect(placement.minimized.length).toBe(1);
    expect(placement.visible.length).toBe(3);
  });

  test("selectVisiblePanels respects priority + recency under cap", () => {
    const old = createPanel("sessions", { kind: "static" });
    old.createdAt = 1000;
    const needsInput = createPanel("create-order", { kind: "dynamic", resolve: () => {}, status: "needs-input" });
    const pinned = createPanel("cart", { kind: "static", pinned: true });
    pinned.createdAt = 2000;
    const young = createPanel("wishlist", { kind: "static" });
    young.createdAt = 3000;
    const visible = selectVisiblePanels([old, needsInput, pinned, young], "split-small"); // cap 2
    const ids = visible.map(p => p.type);
    // needs-input bypasses cap; pinned wins the remaining slot; old (sessions) is evicted.
    expect(ids).toContain("create-order");
    expect(ids).toContain("cart");
    expect(ids).not.toContain("sessions");
  });

  test("newest panel wins slot over oldest (recency eviction)", () => {
    // Two equal-priority panels competing for one slot: newest should win.
    const first = createPanel("cart", { kind: "static" });
    first.createdAt = 1000;
    const second = createPanel("wishlist", { kind: "static" });
    second.createdAt = 5000;
    const visible = selectVisiblePanels([first, second], "split-small"); // cap 2, both fit
    expect(visible.length).toBe(2);
    // Now add a third — cap 2 means one is evicted. Oldest (first) should go.
    const third = createPanel("sessions", { kind: "static" });
    third.createdAt = 9000;
    const visible3 = selectVisiblePanels([first, second, third], "split-small");
    const ids = visible3.map(p => p.type);
    expect(ids).toContain("sessions");
    expect(ids).toContain("wishlist");
    expect(ids).not.toContain("cart");
  });

  test("mobile caps visible panels to 1 (evicts the rest)", () => {
    const panels = [createPanel("cart"), createPanel("wishlist"), createPanel("sessions")];
    const visible = selectVisiblePanels(panels, "mobile");
    expect(visible.length).toBe(1);
  });

  test("builds a tree for split layouts", () => {
    // products + product-detail → default preset "compare" → 2-leaf split.
    const placement = selectLayout(
      [createPanel("products", { kind: "static" }), createPanel("product-detail", { kind: "static" })],
      "split-wide",
    );
    expect(placement.tree).not.toBeNull();
    expect(placement.tree?.kind).toBe("split");
  });

  test("non-product panels get a split tree (not phantom)", () => {
    // Two non-product panels (e.g. orders + address-book) must produce a 2-leaf
    // tree, not be capped to 1 by a "focus" preset. Regression for phantom panels.
    const placement = selectLayout(
      [createPanel("orders" as never, { kind: "static" }), createPanel("address-book" as never, { kind: "static" })],
      "split-wide",
    );
    expect(placement.tree).not.toBeNull();
    expect(placement.tree?.kind).toBe("split");
    if (placement.tree?.kind === "split") {
      expect(placement.tree.children.length).toBe(2);
    }
  });

  test("fit-based chooser falls back from 3 panes to 2 when mins do not fit", () => {
    const placement = selectLayout(
      [
        createPanel("orders" as never, { kind: "static" }),
        createPanel("address-book" as never, { kind: "static" }),
        createPanel("memories" as never, { kind: "static" }),
      ],
      "split-wide",
      undefined,
      { width: 900, height: 700 },
      { orders: 360, "address-book": 340, memories: 320 },
    );
    expect(placement.visible.length).toBe(2);
    expect(placement.tree?.kind).toBe("split");
    if (placement.tree?.kind === "split") {
      expect(placement.tree.children.length).toBe(2);
    }
  });

  test("fit-based chooser keeps 3 panes when mins fit on wide screens", () => {
    const placement = selectLayout(
      [
        createPanel("orders" as never, { kind: "static" }),
        createPanel("address-book" as never, { kind: "static" }),
        createPanel("memories" as never, { kind: "static" }),
      ],
      "split-wide",
      undefined,
      { width: 1400, height: 900 },
      { orders: 360, "address-book": 340, memories: 320 },
    );
    expect(placement.visible.length).toBe(3);
    expect(placement.tree?.kind).toBe("split");
    if (placement.tree?.kind === "split") {
      expect(placement.tree.children.length).toBe(3);
      expect(placement.tree.weights?.length).toBe(3);
    }
  });
});
