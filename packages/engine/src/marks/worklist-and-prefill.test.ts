// Worklist + treatment-prefill behaviour (spec 052 US1; amends spec 071 SC-007).
//
// The load-bearing change over spec 071: DUAL REACHABILITY is intended, not an
// error. A mark may earn its own key AND have promoted composed characters on
// dedicated keys at the same time (FR-005/FR-006), so the coverage invariant is
// "at least one unit, nothing unclassified" — the old "classified twice" problem
// is gone, and its absence is asserted here.

import { describe, expect, it } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { makeConfirmedAlphabet as makeAlphabet } from "@keyboard-studio/contracts";
import { groupMarkClasses } from "./mark-classes.js";
import { proposeAttachments } from "./attachment-proposals.js";
import {
  computeMarkTreatmentPrefills,
  detectBaseMarkMechanism,
  PRODUCTIVITY_SPREAD_THRESHOLD,
} from "./treatment-prefill.js";
import { makeMarkTreatmentAnswer, type MarkTreatmentAnswer } from "./treatment.js";
import { buildPlacementWorklist, verifyWorklistCoverage } from "./worklist.js";

const ACUTE = "́";
const CEDILLA = "̧";

describe("computeMarkTreatmentPrefills (spec 052 FR-009, amending 046 FR-011)", () => {
  it("wide productivity spread recommends own-key", () => {
    const bases = ["a", "e", "i", "o"];
    const a = makeAlphabet({
      bases,
      marks: [ACUTE],
      attestedStacks: bases.map((b) => ({ base: b, marks: [ACUTE] })),
    });
    const classes = groupMarkClasses(a);
    const proposals = proposeAttachments(a, classes);
    const [prefill] = computeMarkTreatmentPrefills(a, classes, proposals);
    expect(prefill?.signals.productivitySpread).toBeGreaterThanOrEqual(
      PRODUCTIVITY_SPREAD_THRESHOLD,
    );
    expect(prefill?.recommended).toBe("own-key");
  });

  it("narrow spread with no other signal recommends composed", () => {
    const a = makeAlphabet({
      bases: ["c", "k"],
      marks: [CEDILLA],
      attestedStacks: [{ base: "c", marks: [CEDILLA] }],
    });
    const classes = groupMarkClasses(a);
    const [prefill] = computeMarkTreatmentPrefills(a, classes, proposeAttachments(a, classes));
    expect(prefill?.recommended).toBe("composed");
  });

  it("derives a promotion proposal from the confirmed attachment map", () => {
    const bases = ["a", "e"];
    const a = makeAlphabet({
      bases,
      marks: [ACUTE],
      attestedStacks: bases.map((b) => ({ base: b, marks: [ACUTE] })),
    });
    const classes = groupMarkClasses(a);
    const [prefill] = computeMarkTreatmentPrefills(a, classes, proposeAttachments(a, classes), {
      attachments: { [ACUTE]: { a: true, e: true } },
    });
    expect(prefill?.promotionProposal).toEqual(["á", "é"]);
    expect(prefill?.signals.promotionAffordable).toBe(true);
  });

  it("an over-budget promotion is UNAVAILABLE with the reason stated (FR-015)", () => {
    const bases = ["a", "e"];
    const a = makeAlphabet({
      bases,
      marks: [ACUTE],
      attestedStacks: bases.map((b) => ({ base: b, marks: [ACUTE] })),
    });
    const classes = groupMarkClasses(a);
    const [prefill] = computeMarkTreatmentPrefills(a, classes, proposeAttachments(a, classes), {
      attachments: { [ACUTE]: { a: true, e: true } },
      keyBudget: { spareKeys: 1 },
    });
    expect(prefill?.signals.promotionAffordable).toBe(false);
    expect(prefill?.signals.unaffordableReason).toMatch(/more keys than/);
    // The proposal is withheld, not silently offered on a base that cannot seat it.
    expect(prefill?.promotionProposal).toEqual([]);
  });

  it("FR-017: the budget never gates treatment — a recommendation survives an exhausted budget", () => {
    const bases = ["a", "e", "i", "o"];
    const a = makeAlphabet({
      bases,
      marks: [ACUTE],
      attestedStacks: bases.map((b) => ({ base: b, marks: [ACUTE] })),
    });
    const classes = groupMarkClasses(a);
    const [prefill] = computeMarkTreatmentPrefills(a, classes, proposeAttachments(a, classes), {
      attachments: { [ACUTE]: { a: true, e: true, i: true, o: true } },
      keyBudget: { spareKeys: 0 },
    });
    expect(prefill?.signals.promotionAffordable).toBe(false);
    expect(prefill?.recommended).toBe("own-key");
  });

  it("an unmeasured budget does not gate promotion (the named stub behaviour)", () => {
    const bases = ["a", "e"];
    const a = makeAlphabet({
      bases,
      marks: [ACUTE],
      attestedStacks: bases.map((b) => ({ base: b, marks: [ACUTE] })),
    });
    const classes = groupMarkClasses(a);
    const [prefill] = computeMarkTreatmentPrefills(a, classes, proposeAttachments(a, classes), {
      attachments: { [ACUTE]: { a: true, e: true } },
      keyBudget: null,
    });
    expect(prefill?.signals.promotionAffordable).toBe(true);
  });

  it("promotion is ABSENT (empty proposal, still affordable) when nothing is attested", () => {
    const a = makeAlphabet({ bases: ["a"], marks: [ACUTE], attestedStacks: [] });
    const classes = groupMarkClasses(a);
    const [prefill] = computeMarkTreatmentPrefills(a, classes, proposeAttachments(a, classes), {
      attachments: { [ACUTE]: { a: false } },
      keyBudget: { spareKeys: 0 },
    });
    expect(prefill?.promotionProposal).toEqual([]);
    expect(prefill?.signals.promotionAffordable).toBe(true);
    expect(prefill?.signals.unaffordableReason).toBeUndefined();
  });
});

describe("detectBaseMarkMechanism (sibling to detectMarkInputOrderFromImport)", () => {
  it("detects combining-keystroke when a rule outputs a lone mark", () => {
    const ir = makeTestIR([
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        rules: [
          {
            nodeId: "r1",
            context: [],
            key: { vkey: "K_QUOTE", modifiers: [] },
            output: [{ kind: "char", value: ACUTE }],
          },
        ],
      },
    ]);
    expect(detectBaseMarkMechanism(ir)).toBe("combining-keystroke");
  });

  it("detects precomposed when only ready-made accented output exists", () => {
    const ir = makeTestIR([
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        rules: [
          {
            nodeId: "r1",
            context: [],
            key: { vkey: "K_E", modifiers: [] },
            output: [{ kind: "char", value: "é" }],
          },
        ],
      },
    ]);
    expect(detectBaseMarkMechanism(ir)).toBe("precomposed");
  });

  it("returns null when no mark-bearing output exists", () => {
    const ir = makeTestIR([
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        rules: [
          {
            nodeId: "r1",
            context: [],
            key: { vkey: "K_A", modifiers: [] },
            output: [{ kind: "char", value: "a" }],
          },
        ],
      },
    ]);
    expect(detectBaseMarkMechanism(ir)).toBeNull();
  });
});

describe("buildPlacementWorklist (spec 052 FR-005/FR-006, SC-009)", () => {
  const bases = ["a", "e", "c", "k"];
  const alphabet = makeAlphabet({
    bases,
    marks: [ACUTE, CEDILLA],
    attestedStacks: [
      { base: "a", marks: [ACUTE] },
      { base: "e", marks: [ACUTE] },
      { base: "c", marks: [CEDILLA] },
    ],
  });
  const classes = groupMarkClasses(alphabet);
  const acuteClassId = classes.find((c) => c.marks.includes(ACUTE))?.id ?? "";
  const cedillaClassId = classes.find((c) => c.marks.includes(CEDILLA))?.id ?? "";

  const attachments = {
    [ACUTE]: { a: true, e: true, c: false, k: false },
    [CEDILLA]: { a: false, e: false, c: true, k: false },
  };

  function answer(over: Partial<MarkTreatmentAnswer> = {}): MarkTreatmentAnswer {
    return { ...makeMarkTreatmentAnswer("postfix"), ...over };
  }

  it("classifies mark units (with input order), composed units, and blocked pairs", () => {
    const worklist = buildPlacementWorklist({
      alphabet,
      classes,
      attachments,
      prefills: [],
      treatment: answer({
        classTreatment: { [acuteClassId]: "own-key", [cedillaClassId]: "composed" },
      }),
    });
    // Acute earns its own key + the keyboard's attach order.
    expect(worklist.markUnits).toEqual([{ mark: ACUTE, inputOrder: "postfix" }]);
    // Cedilla is composed: ç is a whole unit; plain bases all present.
    expect(worklist.ownLetterUnits).toContain("ç");
    for (const b of bases) expect(worklist.ownLetterUnits).toContain(b);
    // Every unchecked pair is blocked (incl. c/k for acute, a/e/k for cedilla).
    expect(worklist.blockedCombinations).toContainEqual({ base: "k", mark: ACUTE });
    expect(worklist.blockedCombinations).toContainEqual({ base: "k", mark: CEDILLA });
  });

  it("US1 AC1 / FR-005+FR-006: an own-key mark WITH promotions produces BOTH", () => {
    const worklist = buildPlacementWorklist({
      alphabet,
      classes,
      attachments,
      prefills: [],
      treatment: answer({
        classTreatment: { [acuteClassId]: "own-key", [cedillaClassId]: "composed" },
        promoted: ["á", "é"],
      }),
    });
    // The bare mark keeps its own key...
    expect(worklist.markUnits).toEqual([{ mark: ACUTE, inputOrder: "postfix" }]);
    // ...AND exactly the two promoted characters are dedicated units. Neither
    // choice cancelled the other.
    expect(worklist.ownLetterUnits).toContain("á");
    expect(worklist.ownLetterUnits).toContain("é");
  });

  it("US1 AC2: an own-key mark with NO promotions produces only the mark unit", () => {
    const worklist = buildPlacementWorklist({
      alphabet,
      classes,
      attachments,
      prefills: [],
      treatment: answer({
        classTreatment: { [acuteClassId]: "own-key", [cedillaClassId]: "composed" },
      }),
    });
    expect(worklist.markUnits).toEqual([{ mark: ACUTE, inputOrder: "postfix" }]);
    expect(worklist.ownLetterUnits).not.toContain("á");
    expect(worklist.ownLetterUnits).not.toContain("é");
  });

  it("promotion is honoured regardless of its mark's treatment", () => {
    // Cedilla is `composed`, so ç already arrives as a composed unit; promoting
    // it must not double-enter it.
    const worklist = buildPlacementWorklist({
      alphabet,
      classes,
      attachments,
      prefills: [],
      treatment: answer({
        classTreatment: { [acuteClassId]: "own-key", [cedillaClassId]: "composed" },
        promoted: ["ç"],
      }),
    });
    expect(worklist.ownLetterUnits.filter((u) => u === "ç")).toHaveLength(1);
  });

  it("NFC dedup: a pair both composed-produced and promoted yields ONE entry", () => {
    const worklist = buildPlacementWorklist({
      alphabet,
      classes,
      attachments,
      prefills: [],
      treatment: answer({
        classTreatment: { [acuteClassId]: "composed", [cedillaClassId]: "composed" },
        // The decomposed spelling of the same character.
        promoted: ["a" + ACUTE],
      }),
    });
    expect(worklist.ownLetterUnits.filter((u) => u === "á")).toHaveLength(1);
  });

  it("SC-009: coverage is at least one unit, nothing unclassified — even under dual reachability", () => {
    const worklist = buildPlacementWorklist({
      alphabet,
      classes,
      attachments,
      prefills: [],
      treatment: answer({
        classTreatment: { [acuteClassId]: "own-key", [cedillaClassId]: "composed" },
        promoted: ["á", "é"],
        inputOrder: "prefix",
      }),
    });
    // The old spec-046 assertion reported this exact state as an error. FR-006
    // makes it intended, so the problem list must be empty.
    expect(verifyWorklistCoverage(alphabet, worklist)).toEqual([]);
  });

  it("the 'classified twice' problem no longer exists at all", () => {
    const worklist = buildPlacementWorklist({
      alphabet,
      classes,
      attachments,
      prefills: [],
      treatment: answer({
        classTreatment: { [acuteClassId]: "own-key", [cedillaClassId]: "composed" },
        promoted: ["á"],
      }),
    });
    const problems = verifyWorklistCoverage(alphabet, worklist).join(" ");
    expect(problems).not.toMatch(/classified twice/);
  });

  it("still reports a genuinely unclassified mark", () => {
    const orphan = makeAlphabet({ bases: ["a"], marks: [ACUTE], attestedStacks: [] });
    // A mark that is neither a mark unit, nor composed-produced, nor blocked.
    const problems = verifyWorklistCoverage(orphan, {
      ownLetterUnits: ["a"],
      markUnits: [],
      blockedCombinations: [],
    });
    expect(problems.join(" ")).toMatch(/unclassified/);
  });

  it("per-mark override splits a mark out of its class's answer (mixed edge case)", () => {
    const worklist = buildPlacementWorklist({
      alphabet,
      classes,
      attachments,
      prefills: [],
      treatment: answer({
        classTreatment: { [acuteClassId]: "composed", [cedillaClassId]: "composed" },
        markTreatment: { [ACUTE]: "own-key" },
      }),
    });
    expect(worklist.markUnits).toEqual([{ mark: ACUTE, inputOrder: "postfix" }]);
    expect(worklist.ownLetterUnits).not.toContain("á");
  });

  it("falls back to the class's prefill recommendation when no answer was recorded", () => {
    const worklist = buildPlacementWorklist({
      alphabet,
      classes,
      attachments,
      prefills: [
        {
          classId: acuteClassId,
          recommended: "own-key",
          promotionProposal: [],
          signals: { productivitySpread: 2, baseMechanism: null, promotionAffordable: true },
        },
      ],
      treatment: answer(),
    });
    expect(worklist.markUnits).toEqual([{ mark: ACUTE, inputOrder: "postfix" }]);
  });
});
