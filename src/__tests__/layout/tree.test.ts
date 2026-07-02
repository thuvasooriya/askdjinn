import { describe, test, expect } from "bun:test";
import { wrapInSplit, removeLeaf, normalizeTree, findLeaf, leafIds, type LayoutRegion } from "$lib/layout/tree";

describe("layout tree", () => {
  const leaf = (id: string): LayoutRegion => ({ kind: "leaf", panelId: id });
  const A = leaf("a"), B = leaf("b"), C = leaf("c");

  test("wrapInSplit row", () => {
    expect(wrapInSplit("row", [A, B])).toEqual({ kind: "split", orientation: "row", children: [A, B] });
  });
  test("wrapInSplit column with weights", () => {
    expect(wrapInSplit("column", [A, B], [2, 1])).toEqual({ kind: "split", orientation: "column", children: [A, B], weights: [2, 1] });
  });
  test("removeLeaf removes leaf and collapses orphaned split", () => {
    const tree: LayoutRegion = { kind: "split", orientation: "row", children: [A, B] };
    expect(removeLeaf(tree, "b")).toEqual(A);
  });
  test("removeLeaf on root leaf returns null", () => {
    expect(removeLeaf(A, "a")).toBeNull();
  });
  test("removeLeaf on absent leaf returns tree unchanged", () => {
    const tree: LayoutRegion = { kind: "split", orientation: "row", children: [A, B] };
    expect(removeLeaf(tree, "z")).toEqual(tree);
  });
  test("removeLeaf in nested tree collapses correctly", () => {
    const tree: LayoutRegion = { kind: "split", orientation: "row", children: [A, { kind: "split", orientation: "column", children: [B, C] }] };
    expect(removeLeaf(tree, "b")).toEqual({ kind: "split", orientation: "row", children: [A, C] });
  });
  test("normalizeTree collapses single-child splits recursively", () => {
    const tree: LayoutRegion = { kind: "split", orientation: "row", children: [{ kind: "split", orientation: "column", children: [A] }] };
    expect(normalizeTree(tree)).toEqual(A);
  });
  test("normalizeTree on null returns null", () => {
    expect(normalizeTree(null)).toBeNull();
  });
  test("findLeaf finds in nested tree", () => {
    const tree: LayoutRegion = { kind: "split", orientation: "row", children: [A, { kind: "split", orientation: "column", children: [B, C] }] };
    expect(findLeaf(tree, "c")?.panelId).toBe("c");
    expect(findLeaf(tree, "z")).toBeNull();
  });
  test("leafIds returns all leaves in order", () => {
    const tree: LayoutRegion = { kind: "split", orientation: "row", children: [A, { kind: "split", orientation: "column", children: [B, C] }] };
    expect(leafIds(tree)).toEqual(["a", "b", "c"]);
    expect(leafIds(null)).toEqual([]);
  });
});
