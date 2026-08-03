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
import type { ModifierToken } from "@keyboard-studio/engine";
import { canonicalizeCombo, comboToTouchLayerId } from "@keyboard-studio/engine";

/**
 * A touch layer id, matching `comboToTouchLayerId`'s vocabulary. The named
 * members document the ids this codebase reasons about; the `string` arm keeps
 * a keyboard's own layer ids (e.g. `"rightalt-shift"`) assignable.
 */
export type TouchLayerId = "default" | "shift" | "caps" | (string & {});

/**
 * Where a case-pair proposal should place the capital: the casing-parallel
 * layer's flattened id, plus the canonical combo it was derived from.
 *
 * The combo is returned alongside the id because the id is not presentable —
 * `"rightalt-shift"` is a layout key, not a phrase an author reads. The banner
 * has to name the target layer ("the Shift+RAlt layer"), and the only
 * non-duplicative way to label it is from the combo the rule already built.
 * Returning it here keeps "the case-pair layer is this combo plus SHIFT" a
 * single derivation, rather than one for the id and a second, hand-rolled one
 * for the label.
 */
export interface CasePairTouchTarget {
  /** Flattened layer id — `comboToTouchLayerId(combo)`. What gets recorded. */
  layer: TouchLayerId;
  /** The canonical combo that layer flattens from. What gets labelled. */
  combo: ModifierToken[];
}

/**
 * The casing-parallel layer for the layer currently being edited, or null when
 * there is none to pair with. A null return means the caller raises no
 * case-pair proposal.
 *
 * Keyed on the editing layer's **modifier combo**, not on its flattened layer
 * id. That distinction is the whole point: `comboToTouchLayerId` is
 * compositional (it sorts the canonical combo into touch-layer precedence
 * order and joins the per-token fragments with `-`), so its vocabulary is open
 * — `default`, `shift`, `rightalt`, `alt`, `ctrl`, `rightalt-shift`,
 * `rightctrl-rightalt-shift`, and so on. An id-keyed rule could only ever
 * enumerate a fixed handful, and this one enumerated exactly two: it mapped
 * the literal `"default"` to `"shift"` and returned null for everything else.
 * Every author editing a non-default layer therefore silently got no
 * case-pair proposal at all, even though the companion layer was derivable.
 *
 * The relation stated over combos instead: **the case-pair layer is this combo
 * plus SHIFT.**
 *
 *   []                -> layer "shift"           (base layer's parallel)
 *   ["RALT"]          -> layer "rightalt-shift"  (when the keyboard uses it)
 *   ["SHIFT", …]      -> null                    (already an uppercase layer)
 *   ["CAPS", …]       -> null                    (likewise)
 *
 * `isComboInUse` gates the compound candidates: a layer only exists in the
 * touch layout because some desktop combo produced it, so proposing a
 * placement onto `rightalt-shift` when this keyboard has no SHIFT+RAlt combo
 * would target a layer that isn't there. The plain-SHIFT candidate skips that
 * gate deliberately — the scaffolder's fixed default/shift/altgr buckets mean
 * a shift layer always exists, so gating it would *remove* proposals that work
 * today for a keyboard that happens to define no explicit `[SHIFT K_x]` rule.
 *
 * Note the phone platform ships no `caps` layer, so nothing here invents one —
 * a `caps` target would be skipped with a warning by the appliers rather than
 * silently redirected.
 *
 * @param editingCombo The canonical combo of the layer being edited
 *                     (`canonicalizeCombo` output — the builder's assembled
 *                     combo, pre-flattening).
 * @param isComboInUse Whether a combo is one this keyboard actually defines.
 */
export function casePairTouchTarget(
  editingCombo: readonly ModifierToken[],
  isComboInUse: (combo: readonly ModifierToken[]) => boolean,
): CasePairTouchTarget | null {
  // Already an uppercase layer — there is no "more uppercase" layer to pair
  // with. (NCAPS is not special-cased: [NCAPS] + SHIFT is a compound candidate
  // like any other, and the gate below drops it unless the keyboard uses it.)
  if (editingCombo.includes("SHIFT") || editingCombo.includes("CAPS")) return null;

  // Safe to canonicalize without the caller's try/catch: MODIFIER_EXCLUSIONS
  // has SHIFT excluding only itself, and the guard above already established
  // SHIFT is absent, so adding it cannot make the combo exclusion-invalid.
  const candidate = canonicalizeCombo([...editingCombo, "SHIFT"]);

  if (editingCombo.length > 0 && !isComboInUse(candidate)) return null;

  // Non-null for the same reason the TouchGallery call site asserts it:
  // TOUCH_ID_FRAGMENT covers every ModifierToken, and canonicalizeCombo's
  // output only ever contains ModifierToken members.
  return { layer: comboToTouchLayerId(candidate)!, combo: candidate };
}

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
