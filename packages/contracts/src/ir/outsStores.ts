import type { IRStore, KeyboardIR } from "../keyboard-ir";

/** True when a store body holds an `outs(other)` reference (`StoreItem.outs`). */
export function storeHasOuts(store: Pick<IRStore, "items">): boolean {
  return store.items.some((item) => item.kind === "outs");
}

/**
 * The IR as analyses that pair stores by position have always seen it: without
 * the stores whose body holds an `outs()` reference.
 *
 * Before spec 116 typed `StoreItem.outs`, the codec kept such a store as an opaque
 * `outs-expansion` fragment, so it was never in `ir.stores`. A typed store with an
 * `outs` item occupies ONE slot where Keyman expands it to many, so reading it by
 * position (`any(a)` against `index(b, n)`) would mis-pair every item after the
 * reference. An analysis that pairs by position reads this view and so keeps its
 * result; one that needs the expansion reads `resolveStoreItems` instead.
 * A new consumer picks one: this view only when it must keep a pre-spec-116
 * result where the old fragment carried no `storeSketch`; otherwise the
 * expansion (as `buildOutputRepertoire` does, because its fragment input did
 * carry the expanded sketch).
 *
 * Returns `ir` itself when no store holds an `outs`, so the common case costs nothing.
 */
export function withoutOutsStores(ir: KeyboardIR): KeyboardIR {
  if (!ir.stores.some(storeHasOuts)) return ir;
  return { ...ir, stores: ir.stores.filter((s) => !storeHasOuts(s)) };
}
