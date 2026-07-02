/**
 * LayoutRegion — a recursive tree describing how panels are arranged on screen.
 *
 * A region is either a leaf (one panel) or a split (children laid out in a row
 * or column). The tree replaces the flat grid so layouts can compose: a slot
 * can itself contain a split (e.g. products | (chat / detail)).
 *
 * All mutations funnel through the helpers below + a normalizeTree pass that
 * collapses orphaned single-child splits, so the tree never accumulates
 * degenerate wrappers after panels close.
 */

export type LayoutRegion =
  | { kind: "leaf"; panelId: string }
  | { kind: "split"; orientation: "row" | "column"; children: LayoutRegion[]; weights?: number[] };

export function wrapInSplit(
  orientation: "row" | "column",
  children: LayoutRegion[],
  weights?: number[],
): LayoutRegion {
  return weights ? { kind: "split", orientation, children, weights } : { kind: "split", orientation, children };
}

/** Find a leaf by panel id, anywhere in the tree. */
export function findLeaf(tree: LayoutRegion | null, panelId: string): { kind: "leaf"; panelId: string } | null {
  if (!tree) return null;
  if (tree.kind === "leaf") return tree.panelId === panelId ? tree : null;
  for (const c of tree.children) {
    const f = findLeaf(c, panelId);
    if (f) return f;
  }
  return null;
}

/** Remove a leaf by panel id; collapses any orphaned single-child splits left behind. */
export function removeLeaf(tree: LayoutRegion | null, panelId: string): LayoutRegion | null {
  if (!tree) return null;
  if (tree.kind === "leaf") return tree.panelId === panelId ? null : tree;
  const children = tree.children
    .map(c => removeLeaf(c, panelId))
    .filter((c): c is LayoutRegion => c !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0]; // collapse orphaned split
  return { ...tree, children };
}

/** Recursively collapse single-child splits and drop empty subtrees. */
export function normalizeTree(tree: LayoutRegion | null): LayoutRegion | null {
  if (!tree || tree.kind === "leaf") return tree;
  const children = tree.children
    .map(normalizeTree)
    .filter((c): c is LayoutRegion => c !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { ...tree, children };
}

/** All leaf panel ids in display order. */
export function leafIds(tree: LayoutRegion | null): string[] {
  if (!tree) return [];
  if (tree.kind === "leaf") return [tree.panelId];
  return tree.children.flatMap(leafIds);
}
