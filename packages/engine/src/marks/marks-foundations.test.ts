import { describe, expect, it } from "vitest";
import { makeConfirmedAlphabet } from "@keyboard-studio/contracts";
import { groupMarkClasses, attestedBasesOf } from "./mark-classes.js";
import { proposeAttachments, deriveCaseCounterparts } from "./attachment-proposals.js";
import {
  dominantTreatment,
  isClassMixed,
  makeMarkTreatmentAnswer,
  pruneMarkOverrides,
  treatmentFor,
  type MarkTreatmentAnswer,
} from "./treatment.js";
import {
  expandCaseCounterpartPromotions,
  promotableCharacters,
  prunePromotions,
} from "./promotion.js";
import type { MarkTreatmentPrefill } from "./treatment-prefill.js";

const ACUTE = "́"; // U+0301 (above)
const GRAVE = "̀"; // U+0300 (above)
const UNDERDOT = "̣"; // U+0323 (below)

describe("attestedBasesOf", () => {
  it("collects each mark's attested bases from the stacks", () => {
    const a = makeConfirmedAlphabet({
      bases: ["a", "e"],
      marks: [ACUTE],
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "e", marks: [ACUTE] },
      ],
    });
    expect([...(attestedBasesOf(a).get(ACUTE) ?? [])]).toEqual(["a", "e"]);
  });
});

describe("groupMarkClasses (FR-010)", () => {
  it("groups similarly-attaching above-marks into one class", () => {
    const a = makeConfirmedAlphabet({
      bases: ["a", "e", "i"],
      marks: [ACUTE, GRAVE],
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "e", marks: [ACUTE] },
        { base: "a", marks: [GRAVE] },
        { base: "e", marks: [GRAVE] },
      ],
    });
    const classes = groupMarkClasses(a);
    expect(classes).toHaveLength(1);
    expect(classes[0]?.marks).toEqual([ACUTE, GRAVE]);
  });

  it("separates an above-mark from a below-mark (function bucket)", () => {
    const a = makeConfirmedAlphabet({
      bases: ["a"],
      marks: [ACUTE, UNDERDOT],
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "a", marks: [UNDERDOT] },
      ],
    });
    const classes = groupMarkClasses(a);
    expect(classes).toHaveLength(2);
  });

  it("splits same-bucket marks with disjoint attachment sets", () => {
    const a = makeConfirmedAlphabet({
      bases: ["a", "e", "n", "o"],
      marks: [ACUTE, GRAVE],
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "e", marks: [ACUTE] },
        { base: "n", marks: [GRAVE] },
        { base: "o", marks: [GRAVE] },
      ],
    });
    expect(groupMarkClasses(a)).toHaveLength(2);
  });

  it("is deterministic (stable ids and order)", () => {
    const a = makeConfirmedAlphabet({
      bases: ["a"],
      marks: [ACUTE, UNDERDOT],
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "a", marks: [UNDERDOT] },
      ],
    });
    expect(groupMarkClasses(a)).toEqual(groupMarkClasses(a));
  });

  // Pins the documented v1 gap (see bucketOf): marks outside the Combining
  // Diacritical Marks blocks all land in the "other" bucket, so functionally
  // distinct Arabic harakat with the same attested consonants merge into one
  // class. When ccc-based bucketing lands, this test should start failing —
  // update it to assert the per-mark fixed-position split instead.
  it("v1 gap: same-base non-Latin marks merge into a single 'other' class", () => {
    const FATHA = "َ";
    const KASRA = "ِ";
    const SHADDA = "ّ";
    const a = makeConfirmedAlphabet({
      bases: ["ب", "ت"], // beh, teh
      marks: [FATHA, KASRA, SHADDA],
      attestedStacks: [
        { base: "ب", marks: [FATHA] },
        { base: "ب", marks: [KASRA] },
        { base: "ب", marks: [SHADDA] },
        { base: "ت", marks: [FATHA] },
        { base: "ت", marks: [KASRA] },
        { base: "ت", marks: [SHADDA] },
      ],
    });
    const classes = groupMarkClasses(a);
    expect(classes).toHaveLength(1);
    expect(classes[0]?.id).toBe("other-1");
    expect(classes[0]?.marks).toEqual([FATHA, KASRA, SHADDA]);
  });
});

describe("proposeAttachments (FR-006/FR-007/FR-008)", () => {
  it("pre-checks attested, proposes class-sibling bases as plausible, blocks the rest", () => {
    const a = makeConfirmedAlphabet({
      bases: ["a", "e", "k"],
      marks: [ACUTE, GRAVE],
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "e", marks: [ACUTE] },
        { base: "a", marks: [GRAVE] },
      ],
    });
    const classes = groupMarkClasses(a);
    const proposals = proposeAttachments(a, classes);
    const grave = proposals.find((p) => p.mark === GRAVE);
    expect(grave?.states["a"]).toBe("attested");
    expect(grave?.states["e"]).toBe("plausible"); // acute (same class) attests on e
    expect(grave?.states["k"]).toBe("blocked"); // never attested for the class
  });

  it("auto-confirms a single-attested-base mark with no plausible additions (FR-008)", () => {
    const CEDILLA = "̧";
    const a = makeConfirmedAlphabet({
      bases: ["c", "k"],
      marks: [CEDILLA],
      attestedStacks: [{ base: "c", marks: [CEDILLA] }],
    });
    const [proposal] = proposeAttachments(a, groupMarkClasses(a));
    expect(proposal?.autoConfirmed).toBe(true);
    expect(proposal?.states["k"]).toBe("blocked");
  });

  it("does not auto-confirm when a plausible addition exists", () => {
    const a = makeConfirmedAlphabet({
      bases: ["a", "e"],
      marks: [ACUTE, GRAVE],
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "e", marks: [ACUTE] },
        { base: "a", marks: [GRAVE] },
      ],
    });
    const proposals = proposeAttachments(a, groupMarkClasses(a));
    const grave = proposals.find((p) => p.mark === GRAVE);
    expect(grave?.autoConfirmed).toBe(false);
  });
});

describe("deriveCaseCounterparts (FR-009)", () => {
  it("finds the uppercase counterpart pair when both cases are confirmed", () => {
    const a = makeConfirmedAlphabet({
      bases: ["e", "E"],
      marks: [ACUTE],
      attestedStacks: [{ base: "e", marks: [ACUTE] }],
    });
    const pairs = deriveCaseCounterparts(a);
    expect(pairs.get(`e ${ACUTE}`)).toBe("E");
  });

  it("derives nothing when the counterpart base is not in the alphabet", () => {
    const a = makeConfirmedAlphabet({
      bases: ["e"],
      marks: [ACUTE],
      attestedStacks: [{ base: "e", marks: [ACUTE] }],
    });
    expect(deriveCaseCounterparts(a).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Mark treatment (spec 052, FR-001/FR-004/FR-009)
// ---------------------------------------------------------------------------

describe("treatmentFor (spec 052 FR-001/FR-009)", () => {
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

  const prefills: MarkTreatmentPrefill[] = [
    {
      classId,
      recommended: "own-key",
      promotionProposal: [],
      signals: { productivitySpread: 2, baseMechanism: null, promotionAffordable: true },
    },
  ];

  function answer(over: Partial<MarkTreatmentAnswer> = {}): MarkTreatmentAnswer {
    return { ...makeMarkTreatmentAnswer(), ...over };
  }

  it("resolves override > class > prefill, in that order", () => {
    // Prefill only.
    expect(treatmentFor(ACUTE, answer(), classes, prefills)).toBe("own-key");
    // Class answer beats the prefill.
    expect(
      treatmentFor(ACUTE, answer({ classTreatment: { [classId]: "composed" } }), classes, prefills),
    ).toBe("composed");
    // A per-mark override beats the class answer.
    expect(
      treatmentFor(
        ACUTE,
        answer({
          classTreatment: { [classId]: "composed" },
          markTreatment: { [ACUTE]: "own-key" },
        }),
        classes,
        prefills,
      ),
    ).toBe("own-key");
  });

  it("US1 AC3: overriding one member leaves its siblings on the class answer", () => {
    const a = answer({
      classTreatment: { [classId]: "composed" },
      markTreatment: { [ACUTE]: "own-key" },
    });
    expect(treatmentFor(ACUTE, a, classes, prefills)).toBe("own-key");
    expect(treatmentFor(GRAVE, a, classes, prefills)).toBe("composed");
  });

  it("FR-009: every mark resolves — there is no unanswered state", () => {
    for (const mark of alphabet.marks) {
      expect(["own-key", "composed"]).toContain(
        treatmentFor(mark, answer(), classes, prefills),
      );
    }
    // Even with neither an answer nor a prefill.
    expect(treatmentFor(ACUTE, answer(), classes, [])).toBe("composed");
  });

  it("an internally-mixed class is legal, and is reported as mixed", () => {
    const a = answer({
      classTreatment: { [classId]: "composed" },
      markTreatment: { [ACUTE]: "own-key" },
    });
    const markClass = classes[0];
    expect(markClass).toBeDefined();
    if (markClass === undefined) return;
    expect(isClassMixed(markClass, a, classes, prefills)).toBe(true);
    // Dominant treatment breaks the 1-1 tie toward own-key (any productive
    // mark makes the class behave productively at class level).
    expect(dominantTreatment(markClass, a, classes, prefills)).toBe("own-key");
  });

  it("an all-composed class is not mixed and is dominantly composed", () => {
    const a = answer({ classTreatment: { [classId]: "composed" } });
    const markClass = classes[0];
    if (markClass === undefined) throw new Error("no class");
    expect(isClassMixed(markClass, a, classes, prefills)).toBe(false);
    expect(dominantTreatment(markClass, a, classes, prefills)).toBe("composed");
  });

  it("drops an override key that is no longer in alphabet.marks (re-proposal)", () => {
    const pruned = pruneMarkOverrides(
      { [ACUTE]: "own-key", [UNDERDOT]: "own-key" },
      [ACUTE],
    );
    expect(pruned).toEqual({ [ACUTE]: "own-key" });
  });
});

// ---------------------------------------------------------------------------
// Promotion (spec 052, FR-002/FR-023)
// ---------------------------------------------------------------------------

describe("promotableCharacters (spec 052 FR-002)", () => {
  it("offers one composed character per reachable pair, NFC, in order", () => {
    const a = makeConfirmedAlphabet({
      bases: ["a", "e", "k"],
      marks: [ACUTE],
      attestedStacks: [{ base: "a", marks: [ACUTE] }],
    });
    const [markClass] = groupMarkClasses(a);
    if (markClass === undefined) throw new Error("no class");
    const promotable = promotableCharacters(a, markClass, {
      [ACUTE]: { a: true, e: true, k: false },
    });
    expect(promotable).toEqual(["á", "é"]);
  });

  it("offers lowercase and caseless bases only — the uppercase form is derived", () => {
    const a = makeConfirmedAlphabet({
      bases: ["e", "E"],
      marks: [ACUTE],
      attestedStacks: [{ base: "e", marks: [ACUTE] }],
    });
    const [markClass] = groupMarkClasses(a);
    if (markClass === undefined) throw new Error("no class");
    const promotable = promotableCharacters(a, markClass, {
      [ACUTE]: { e: true, E: true },
    });
    expect(promotable).toEqual(["é"]);
  });

  it("offers nothing when no pair is reachable (promotion is ABSENT)", () => {
    const a = makeConfirmedAlphabet({ bases: ["a"], marks: [ACUTE], attestedStacks: [] });
    const [markClass] = groupMarkClasses(a);
    if (markClass === undefined) throw new Error("no class");
    expect(promotableCharacters(a, markClass, { [ACUTE]: { a: false } })).toEqual([]);
  });
});

describe("expandCaseCounterpartPromotions (spec 052 FR-023)", () => {
  it("additively derives the uppercase counterpart when its base is confirmed", () => {
    const a = makeConfirmedAlphabet({
      bases: ["e", "E"],
      marks: [ACUTE],
      attestedStacks: [{ base: "e", marks: [ACUTE] }],
    });
    const expanded = expandCaseCounterpartPromotions(a, ["é"]);
    expect(expanded).toContain("é"); // never withdrawn
    expect(expanded).toContain("É");
  });

  it("is additive: the result is always a superset of the input", () => {
    const a = makeConfirmedAlphabet({
      bases: ["e", "E", "a"],
      marks: [ACUTE],
      attestedStacks: [{ base: "e", marks: [ACUTE] }],
    });
    const input = ["é", "á"];
    const expanded = expandCaseCounterpartPromotions(a, input);
    for (const member of input) expect(expanded).toContain(member);
    // "a" has no uppercase counterpart in the alphabet — nothing derived, no error.
    expect(expanded).not.toContain("Á");
  });

  it("tolerates a base with no single-character uppercase form (edge case)", () => {
    // German sharp s uppercases to a two-character form, so no counterpart is
    // derivable — the promotion still stands on its own.
    const a = makeConfirmedAlphabet({
      bases: ["ß"],
      marks: [ACUTE],
      attestedStacks: [{ base: "ß", marks: [ACUTE] }],
    });
    const expanded = expandCaseCounterpartPromotions(a, ["ß" + ACUTE]);
    expect(expanded).toEqual([("ß" + ACUTE).normalize("NFC")]);
  });

  it("derives nothing for a caseless script", () => {
    const KA = "क";
    const NUKTA = "़";
    const a = makeConfirmedAlphabet({
      bases: [KA],
      marks: [NUKTA],
      attestedStacks: [{ base: KA, marks: [NUKTA] }],
    });
    const expanded = expandCaseCounterpartPromotions(a, [(KA + NUKTA).normalize("NFC")]);
    expect(expanded).toHaveLength(1);
  });
});

describe("prunePromotions (spec 052 FR-020)", () => {
  it("withdraws a member whose pair is no longer reachable", () => {
    const a = makeConfirmedAlphabet({
      bases: ["a", "e"],
      marks: [ACUTE],
      attestedStacks: [{ base: "a", marks: [ACUTE] }],
    });
    const pruned = prunePromotions(a, ["á", "é"], { [ACUTE]: { a: true, e: false } });
    expect(pruned).toEqual(["á"]);
  });
});
