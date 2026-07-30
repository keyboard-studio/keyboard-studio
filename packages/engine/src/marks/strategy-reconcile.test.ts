// Strategy reconciliation (spec 052 US4) — the recorded mark treatment and the
// selected strategy can no longer disagree silently.
//
// Before this feature the marks series emitted no `computedAxes` at all, so the
// author's answer never reached `selectStrategy`: a keyboard could be built on
// two contradictory premises at once (the author records that composed
// characters get their own keys while the independently-elicited A4 selects a
// compose-as-you-type mechanism) and nothing detected it.
//
// Two halves, both tested here:
//   - DERIVATION (FR-027) — the recorded treatment projects onto A4/A3a, so a
//     changed treatment changes the subsequent selection.
//   - SURFACING (FR-024) — where the recorded answer and the SELECTED STRATEGY
//     still imply different mechanisms, the disagreement is reported rather than
//     silently built. Note "selected strategy", not "raw axis": a base whose own
//     behaviour the author knowingly overrode is a legitimate override, not a
//     disagreement, so the check runs AFTER selectStrategy.

import { describe, expect, it } from "vitest";
import type { DiscoveryAxisVector } from "@keyboard-studio/contracts";
import { makeConfirmedAlphabet } from "@keyboard-studio/contracts";
import { selectStrategy } from "../strategy-selector/index.js";
import { groupMarkClasses } from "./mark-classes.js";
import { makeMarkTreatmentAnswer, type MarkTreatmentAnswer } from "./treatment.js";
import type { MarkTreatmentPrefill } from "./treatment-prefill.js";
import {
  deriveMarksComputedAxes,
  surfaceStrategyDisagreement,
} from "./strategy-reconcile.js";

const ACUTE = "́"; // above
const GRAVE = "̀"; // above
const UNDERDOT = "̣"; // below — a second mark FAMILY

function baseAxes(over: Partial<DiscoveryAxisVector> = {}): DiscoveryAxisVector {
  return {
    scale: "medium",
    scriptClass: "alphabetic",
    phoneticIntuition: "strong",
    diacriticBehavior: "none",
    multiMode: "single",
    constraintEnforcement: "none",
    spareKeyAvailability: "many",
    ...over,
  };
}

function answer(over: Partial<MarkTreatmentAnswer> = {}): MarkTreatmentAnswer {
  return { ...makeMarkTreatmentAnswer("postfix"), ...over };
}

const NO_PREFILLS: MarkTreatmentPrefill[] = [];

// ---------------------------------------------------------------------------
// The A4 / A3a projection
// ---------------------------------------------------------------------------

describe("deriveMarksComputedAxes (spec 052 FR-027, research D6)", () => {
  it("every mark composed → diacriticBehavior 'none'", () => {
    const alphabet = makeConfirmedAlphabet({
      bases: ["a", "e"],
      marks: [ACUTE],
      attestedStacks: [{ base: "a", marks: [ACUTE] }],
    });
    const classes = groupMarkClasses(alphabet);
    const axes = deriveMarksComputedAxes({
      alphabet,
      classes,
      prefills: NO_PREFILLS,
      treatment: answer({
        classTreatment: Object.fromEntries(classes.map((c) => [c.id, "composed" as const])),
      }),
    });
    expect(axes.diacriticBehavior).toBe("none");
  });

  it("one family of stacking marks with a key of its own → 'stacking-combining'", () => {
    const alphabet = makeConfirmedAlphabet({
      bases: ["a", "e"],
      marks: [ACUTE, GRAVE], // both above-marks — ONE family
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "e", marks: [ACUTE] },
        { base: "a", marks: [GRAVE] },
        { base: "e", marks: [GRAVE] },
      ],
    });
    const classes = groupMarkClasses(alphabet);
    const axes = deriveMarksComputedAxes({
      alphabet,
      classes,
      prefills: NO_PREFILLS,
      treatment: answer({
        classTreatment: Object.fromEntries(classes.map((c) => [c.id, "own-key" as const])),
      }),
    });
    expect(axes.diacriticBehavior).toBe("stacking-combining");
  });

  it("two or more distinct mark families with keys of their own → 'multi-family'", () => {
    const alphabet = makeConfirmedAlphabet({
      bases: ["a", "e"],
      marks: [ACUTE, UNDERDOT], // above + below — TWO families
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "a", marks: [UNDERDOT] },
      ],
    });
    const classes = groupMarkClasses(alphabet);
    const axes = deriveMarksComputedAxes({
      alphabet,
      classes,
      prefills: NO_PREFILLS,
      treatment: answer({
        classTreatment: Object.fromEntries(classes.map((c) => [c.id, "own-key" as const])),
      }),
    });
    expect(axes.diacriticBehavior).toBe("multi-family");
  });

  it("NEVER derives 'replacing-cycling' — this station does not elicit it", () => {
    // Exhaustive over the shapes this station can produce.
    const shapes = [
      { marks: [ACUTE], treatment: "own-key" as const },
      { marks: [ACUTE], treatment: "composed" as const },
      { marks: [ACUTE, GRAVE], treatment: "own-key" as const },
      { marks: [ACUTE, UNDERDOT], treatment: "own-key" as const },
      { marks: [ACUTE, UNDERDOT], treatment: "composed" as const },
    ];
    for (const shape of shapes) {
      const alphabet = makeConfirmedAlphabet({
        bases: ["a", "e"],
        marks: shape.marks,
        attestedStacks: shape.marks.map((m) => ({ base: "a", marks: [m] })),
      });
      const classes = groupMarkClasses(alphabet);
      const axes = deriveMarksComputedAxes({
        alphabet,
        classes,
        prefills: NO_PREFILLS,
        treatment: answer({
          classTreatment: Object.fromEntries(classes.map((c) => [c.id, shape.treatment])),
        }),
      });
      expect(axes.diacriticBehavior).not.toBe("replacing-cycling");
    }
  });

  it("carries the recorded input order onto A3a verbatim", () => {
    const alphabet = makeConfirmedAlphabet({
      bases: ["a"],
      marks: [ACUTE],
      attestedStacks: [{ base: "a", marks: [ACUTE] }],
    });
    const classes = groupMarkClasses(alphabet);
    for (const order of ["prefix", "postfix"] as const) {
      const axes = deriveMarksComputedAxes({
        alphabet,
        classes,
        prefills: NO_PREFILLS,
        treatment: answer({ inputOrder: order }),
      });
      expect(axes.markInputOrder).toBe(order);
    }
  });

  it("an internally-mixed class contributes its DOMINANT treatment, and the mix is surfaced", () => {
    const alphabet = makeConfirmedAlphabet({
      bases: ["a", "e"],
      marks: [ACUTE, GRAVE],
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "e", marks: [ACUTE] },
        { base: "a", marks: [GRAVE] },
        { base: "e", marks: [GRAVE] },
      ],
    });
    const classes = groupMarkClasses(alphabet);
    const classId = classes[0]?.id ?? "";
    const result = deriveMarksComputedAxes({
      alphabet,
      classes,
      prefills: NO_PREFILLS,
      treatment: answer({
        classTreatment: { [classId]: "composed" },
        markTreatment: { [ACUTE]: "own-key" },
      }),
    });
    // 1 own-key vs 1 composed → dominant breaks toward own-key, so the class
    // contributes a productive mark family.
    expect(result.diacriticBehavior).toBe("stacking-combining");
    expect(result.mixedClassIds).toContain(classId);
  });

  it("FR-027: changing the recorded treatment changes the subsequent selection", () => {
    // Axes chosen so A4 is the deciding input: at A1=small / A3=weak, §7.2's
    // earlier rules (1, 2, 3, 3a, 4, 5, 6, 8, 11) are all dormant, so rule 7
    // ("A4=stacking-combining AND A1 ∈ {small, medium}") is what separates the
    // two selections. Under A3=strong, rule 5 fires on phonetic intuition alone
    // and A4 would not reach the outcome at all.
    const alphabet = makeConfirmedAlphabet({
      bases: ["a", "e"],
      marks: [ACUTE, GRAVE], // one family — derives "stacking-combining"
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "a", marks: [GRAVE] },
      ],
    });
    const classes = groupMarkClasses(alphabet);
    const axes = baseAxes({ scale: "small", phoneticIntuition: "weak" });

    const asComposed = deriveMarksComputedAxes({
      alphabet,
      classes,
      prefills: NO_PREFILLS,
      treatment: answer({
        classTreatment: Object.fromEntries(classes.map((c) => [c.id, "composed" as const])),
      }),
    });
    const asOwnKey = deriveMarksComputedAxes({
      alphabet,
      classes,
      prefills: NO_PREFILLS,
      treatment: answer({
        classTreatment: Object.fromEntries(classes.map((c) => [c.id, "own-key" as const])),
      }),
    });

    expect(asComposed.diacriticBehavior).toBe("none");
    expect(asOwnKey.diacriticBehavior).toBe("stacking-combining");
    const before = selectStrategy({ ...axes, diacriticBehavior: asComposed.diacriticBehavior });
    const after = selectStrategy({ ...axes, diacriticBehavior: asOwnKey.diacriticBehavior });
    expect(after.primary).not.toBe(before.primary);
  });
});

// ---------------------------------------------------------------------------
// The FR-024 surfacing check
// ---------------------------------------------------------------------------

describe("surfaceStrategyDisagreement (spec 052 FR-024, US4 AC1, SC-011)", () => {
  const alphabet = makeConfirmedAlphabet({
    bases: ["a", "e"],
    marks: [ACUTE],
    attestedStacks: [
      { base: "a", marks: [ACUTE] },
      { base: "e", marks: [ACUTE] },
    ],
  });
  const classes = groupMarkClasses(alphabet);
  const classId = classes[0]?.id ?? "";

  it("US4 AC1: an every-mark-composed answer against a compose-as-you-type selection is SURFACED", () => {
    // The author says every marked character gets its own key. A4 arrived from
    // somewhere else saying "stacking-combining", which selects a
    // compose-as-you-type mechanism. That contradiction must not be built.
    const treatment = answer({ classTreatment: { [classId]: "composed" } });
    const selection = selectStrategy(baseAxes({ diacriticBehavior: "stacking-combining" }));
    const disagreements = surfaceStrategyDisagreement({
      alphabet,
      classes,
      prefills: NO_PREFILLS,
      treatment,
      selection,
    });
    expect(disagreements.length).toBeGreaterThan(0);
    expect(disagreements.join(" ")).toMatch(/key of its own|compose/i);
  });

  it("SC-011: the agreeing case surfaces nothing", () => {
    const treatment = answer({ classTreatment: { [classId]: "own-key" } });
    const derived = deriveMarksComputedAxes({ alphabet, classes, prefills: NO_PREFILLS, treatment });
    const selection = selectStrategy(baseAxes({ diacriticBehavior: derived.diacriticBehavior }));
    expect(
      surfaceStrategyDisagreement({ alphabet, classes, prefills: NO_PREFILLS, treatment, selection }),
    ).toEqual([]);
  });

  it("edge case: a knowingly-overridden BASE mechanism is a legitimate override, not a disagreement", () => {
    // The base keyboard composes as you type (baseMechanism =
    // "combining-keystroke", which is why the prefill recommended own-key), and
    // the author deliberately chose `composed` against it. The check runs on the
    // SELECTED STRATEGY, not on the base's raw signal, so this must stay silent.
    const prefills: MarkTreatmentPrefill[] = [
      {
        classId,
        recommended: "own-key",
        promotionProposal: [],
        signals: {
          productivitySpread: 2,
          baseMechanism: "combining-keystroke",
          promotionAffordable: true,
        },
      },
    ];
    const treatment = answer({ classTreatment: { [classId]: "composed" } });
    const derived = deriveMarksComputedAxes({ alphabet, classes, prefills, treatment });
    // A3=weak + A7a=full-remap selects S-06 (rule 8) — a mechanism that does not
    // compose marked characters as you type, so it honours the recorded answer.
    // The base's contrary `combining-keystroke` signal is present in `prefills`
    // and must NOT by itself produce a disagreement.
    const selection = selectStrategy(
      baseAxes({
        diacriticBehavior: derived.diacriticBehavior,
        phoneticIntuition: "weak",
        remapPosture: "full-remap",
      }),
    );
    expect(selection.primary).toBe("S-06");
    expect(
      surfaceStrategyDisagreement({ alphabet, classes, prefills, treatment, selection }),
    ).toEqual([]);
  });

  it("the derived axis wins over a default-filled prior automatically", () => {
    // defaultFillAxes never overwrites an axis already present, so an emitted
    // computedAxes value takes precedence structurally. Pinned here because the
    // §7.2 precedence amendment states it rather than leaving it implicit.
    const treatment = answer({ classTreatment: { [classId]: "own-key" } });
    const derived = deriveMarksComputedAxes({ alphabet, classes, prefills: NO_PREFILLS, treatment });
    const merged: Partial<DiscoveryAxisVector> = {
      diacriticBehavior: "none", // a prior
      ...{ diacriticBehavior: derived.diacriticBehavior }, // the recorded answer
    };
    expect(merged.diacriticBehavior).toBe(derived.diacriticBehavior);
    expect(merged.diacriticBehavior).not.toBe("none");
  });
});
