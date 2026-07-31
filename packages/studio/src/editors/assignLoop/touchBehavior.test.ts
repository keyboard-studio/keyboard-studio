/**
 * Unit tests for touchBehavior.ts.
 *
 * `casePairTouchTarget` is the focus: it used to be keyed on the flattened
 * touch-layer ID and mapped exactly one input (`"default"` -> `"shift"`),
 * returning null for every other layer id in `comboToTouchLayerId`'s open,
 * compositional vocabulary. Authors editing any non-default layer therefore
 * got no case-pair proposal at all. It is now keyed on the modifier COMBO,
 * where the relation is simply "this combo plus SHIFT".
 */

import { describe, it, expect } from "vitest";
import type { ModifierToken } from "@keyboard-studio/engine";
import { casePairTouchTarget, promoteKeyToHandSet } from "./touchBehavior.ts";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";

/** Availability predicate over an explicit list of combos "in use". */
function comboPool(...combos: ModifierToken[][]) {
  const keys = new Set(combos.map((c) => c.join("+")));
  return (combo: readonly ModifierToken[]) => keys.has(combo.join("+"));
}

/** Nothing is in use — proves which candidates skip the availability gate. */
const nothingInUse = () => false;

describe("casePairTouchTarget", () => {
  it("pairs the base layer with the shift layer", () => {
    expect(casePairTouchTarget([], comboPool(["SHIFT"]))).toEqual({
      layer: "shift",
      combo: ["SHIFT"],
    });
  });

  it("offers the plain shift layer even when the keyboard declares no SHIFT combo", () => {
    // Regression guard on the pre-existing behavior: the old id-keyed rule
    // mapped "default" -> "shift" unconditionally. The scaffolder's fixed
    // default/shift/altgr buckets mean a shift layer always exists, so gating
    // this candidate would REMOVE proposals that work today on a keyboard with
    // no explicit [SHIFT K_x] rule.
    expect(casePairTouchTarget([], nothingInUse)?.layer).toBe("shift");
  });

  it("pairs a compound layer with that combo plus SHIFT", () => {
    // The whole point of the change: an author editing the RAlt layer gets the
    // capital offered on rightalt-shift, not nothing.
    //
    // Both target ids are the engine's own vectors (modifierCombos.test.ts),
    // not hand-derived here — note SHIFT lands on opposite sides of the join
    // for the chiral RALT vs. the generic CTRL, which is exactly why the layer
    // id must come from `comboToTouchLayerId` and never be assembled locally.
    expect(
      casePairTouchTarget(["RALT"], comboPool(["SHIFT", "RALT"])),
    ).toEqual({ layer: "rightalt-shift", combo: ["SHIFT", "RALT"] });
    expect(
      casePairTouchTarget(["CTRL"], comboPool(["SHIFT", "CTRL"])),
    ).toEqual({ layer: "shift-ctrl", combo: ["SHIFT", "CTRL"] });
  });

  it("declines a compound candidate the keyboard does not define", () => {
    // No SHIFT+RALT combo in use -> the touch layout has no rightalt-shift
    // layer to place onto, so raise nothing rather than target a missing layer.
    expect(casePairTouchTarget(["RALT"], comboPool(["RALT"]))).toBeNull();
    expect(casePairTouchTarget(["RALT"], nothingInUse)).toBeNull();
  });

  it("returns null for a layer that is already an uppercase layer", () => {
    expect(casePairTouchTarget(["SHIFT"], comboPool(["SHIFT"]))).toBeNull();
    expect(casePairTouchTarget(["CAPS"], comboPool(["CAPS"]))).toBeNull();
  });

  it("returns null for a compound layer that already carries SHIFT", () => {
    // There is no "more uppercase" layer to pair rightalt-shift with. The old
    // id-keyed rule got this right by accident (everything but "default" was
    // null); the combo-keyed rule has to state it.
    expect(
      casePairTouchTarget(["SHIFT", "RALT"], comboPool(["SHIFT", "RALT"])),
    ).toBeNull();
  });

  it("asks the availability predicate with the CANONICAL candidate combo", () => {
    // The predicate is the caller's `validLayerComboKeys.has(combo.join("+"))`,
    // whose keys are canonicalizeCombo output — so the combo handed to it must
    // be canonical too, or a valid combo would miss and the proposal vanish.
    const asked: ModifierToken[][] = [];
    casePairTouchTarget(["RALT"], (combo) => {
      asked.push([...combo]);
      return false;
    });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toEqual(["SHIFT", "RALT"]); // canonical order, not ["RALT","SHIFT"]
  });
});

// ---------------------------------------------------------------------------
// promoteKeyToHandSet — pre-existing behavior, covered here because this file
// is the module's unit-test home and it had none.
// ---------------------------------------------------------------------------

describe("promoteKeyToHandSet", () => {
  const layout: TouchLayoutIR = {
    platforms: [
      {
        id: "phone",
        layers: [
          {
            id: "default",
            rows: [
              {
                keys: [
                  { nodeId: "n1", id: "K_A", text: "a", provenance: "physical-suggested" },
                  { nodeId: "n2", id: "K_B", text: "b", provenance: "base-derived" },
                ],
              },
            ],
          },
        ],
      },
    ],
    nodeIds: [],
  };

  it("promotes only the named key", () => {
    const out = promoteKeyToHandSet(layout, "K_A");
    const keys = out.platforms[0]!.layers[0]!.rows[0]!.keys;
    expect(keys.find((k) => k.id === "K_A")!.provenance).toBe("hand-set");
    expect(keys.find((k) => k.id === "K_B")!.provenance).toBe("base-derived");
  });

  it("is idempotent and does not mutate the input", () => {
    const once = promoteKeyToHandSet(layout, "K_A");
    const twice = promoteKeyToHandSet(once, "K_A");
    expect(twice).toEqual(once);
    expect(layout.platforms[0]!.layers[0]!.rows[0]!.keys[0]!.provenance).toBe(
      "physical-suggested",
    );
  });

  it("returns an unchanged clone when no key matches", () => {
    const out = promoteKeyToHandSet(layout, "K_NOPE");
    expect(out).toEqual(layout);
    expect(out).not.toBe(layout);
  });
});
