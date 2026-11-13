import type { KeyboardIR, StoreItem } from "../keyboard-ir";

/**
 * The items of a named store with every `outs(other)` item replaced by that
 * store's own (recursively expanded) items.
 *
 * `StoreItem.outs` is a reference, not an expansion; analyses that need the
 * expansion resolve it here. Store names compare case-insensitively, as Keyman
 * does. Two cases cannot expand and yield a single `raw` marker item holding the
 * original `outs(name)` text in place of the reference, so the caller sees an
 * unresolvable spot rather than a silently shorter store:
 *   - a cycle (the store is already being expanded), and
 *   - a reference to a store the IR does not hold as a typed store.
 * An unknown `storeName` yields an empty list.
 */
export function resolveStoreItems(ir: KeyboardIR, storeName: string): StoreItem[] {
  return resolveStoreItemsIn(ir.stores, storeName);
}

/** {@link resolveStoreItems} over a bare list of stores, for callers that hold no whole IR. */
export function resolveStoreItemsIn(
  stores: Iterable<{ name: string; items: StoreItem[] }>,
  storeName: string,
): StoreItem[] {
  const byName = new Map<string, StoreItem[]>();
  for (const store of stores) {
    const key = store.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, store.items);
  }
  const expand = (name: string, active: ReadonlySet<string>): StoreItem[] => {
    const key = name.toLowerCase();
    const items = byName.get(key);
    if (items === undefined) return [];
    const nextActive = new Set(active).add(key);
    const out: StoreItem[] = [];
    for (const item of items) {
      if (item.kind !== "outs") {
        out.push(item);
        continue;
      }
      const refKey = item.storeRef.toLowerCase();
      if (nextActive.has(refKey) || !byName.has(refKey)) {
        out.push({ kind: "raw", text: `outs(${item.storeRef})` });
        continue;
      }
      for (const inner of expand(item.storeRef, nextActive)) out.push(inner);
    }
    return out;
  };
  return expand(storeName, new Set());
}
