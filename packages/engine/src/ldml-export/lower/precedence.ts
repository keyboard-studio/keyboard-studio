// Transform order within a group (FR-022, research R5; task T030).
//
// kmcmplib sorts each group by trigger key, then context length descending, then source line
// (developer/src/kmcmplib/src/Compiler.cpp:701-755, ProcessGroupFinish), after caps expansion.
// LDML applies the first matching transform in document order, so the exporter writes
// transforms in that effective order and not in source order.

import { compareCodePoints } from "./keyIds.js";

export interface PrecedenceKey {
  /** The trigger key with its layer, e.g. `K_E|shift caps`; empty for a context-only rule. */
  triggerKey: string;
  /** Number of context elements before the keystroke. */
  contextLength: number;
  sourceLine: number;
}

export function comparePrecedence(a: PrecedenceKey, b: PrecedenceKey): number {
  return (
    compareCodePoints(a.triggerKey, b.triggerKey) ||
    b.contextLength - a.contextLength ||
    a.sourceLine - b.sourceLine
  );
}

/** A stable sort in kmcmplib's effective order; equal keys keep their input order. */
export function sortKmcmplibOrder<T>(items: readonly T[], key: (item: T) => PrecedenceKey): T[] {
  return items
    .map((item, index) => ({ item, index, k: key(item) }))
    .sort((x, y) => comparePrecedence(x.k, y.k) || x.index - y.index)
    .map((x) => x.item);
}
