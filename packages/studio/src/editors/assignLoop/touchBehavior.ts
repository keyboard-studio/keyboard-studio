// touchBehavior — the `physical-suggested → hand-set` promotion on manual edit
// (spec-014 US2 / FR-014 / R4), T025.
//
// When the author manually edits a touch key that re-propagation currently
// owns (`physical-suggested`, or its `base-derived` sibling), that key is
// PROMOTED to `hand-set` so subsequent re-propagation never clobbers the
// author's edit (the no-clobber rule, repropagation.contract.md R4).
//
// State transition (data-model.md):
//   physical-suggested ─(author manually edits the key)──> hand-set
//   base-derived       ─(author manually edits the key)──> hand-set
//   hand-set           ─(idempotent)──────────────────────> hand-set
//
// Pure helpers; the TouchGallery edit call site wires `promoteKeyToHandSet`
// thinly (logic lives here, not in the component).
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/data-model.md § state transitions
//   specs/014-mutate-seam-touch-propagation/contracts/repropagation.contract.md (R4)

import type { KeyboardIR, TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";

/**
 * Return a structural clone of `layout` with the key whose id is `keyId`
 * promoted to `hand-set`. If the key is already `hand-set` the result is
 * value-equal (idempotent). If no key matches `keyId`, the layout is returned
 * unchanged (a structural clone). Pure — `layout` is not mutated.
 */
export function promoteKeyToHandSet(
  layout: TouchLayoutIR,
  keyId: string,
): TouchLayoutIR {
  const promote = (key: TouchKeyIR): TouchKeyIR =>
    key.id === keyId ? { ...structuredClone(key), provenance: "hand-set" } : structuredClone(key);

  return {
    platforms: layout.platforms.map((platform) => ({
      ...platform,
      layers: platform.layers.map((layer) => ({
        ...layer,
        rows: layer.rows.map((row) => ({ keys: row.keys.map(promote) })),
      })),
    })),
    nodeIds: structuredClone(layout.nodeIds),
  };
}

/**
 * Return a structural clone of `ir` with the touch key `keyId` promoted to
 * `hand-set` (FR-014). A no-op (structural copy) when the IR ships no touch
 * layout. Pure — `ir` is not mutated.
 *
 * This is the helper the TouchGallery manual-edit call site invokes (under the
 * mutate flag) so an author's edit to a re-propagation-owned key survives the
 * next physical change.
 */
export function promoteOnManualEdit(ir: KeyboardIR, keyId: string): KeyboardIR {
  if (ir.touchLayout === undefined) return structuredClone(ir);
  return {
    ...structuredClone(ir),
    touchLayout: promoteKeyToHandSet(ir.touchLayout, keyId),
  };
}
