import { describe, expect, it } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { makeConfirmedAlphabet as makeAlphabet } from "@keyboard-studio/contracts";
import { groupMarkClasses } from "./mark-classes.js";
import { proposeAttachments } from "./attachment-proposals.js";
import {
  computeMentalModelPrefills,
  detectBaseMarkMechanism,
  PRODUCTIVITY_SPREAD_THRESHOLD,
} from "./mental-model-prefill.js";
import { buildPlacementWorklist, verifyWorklistCoverage } from "./worklist.js";

const ACUTE = "́";
const CEDILLA = "̧";

describe("computeMentalModelPrefills (FR-011)", () => {
  it("wide productivity spread recommends letter-plus-mark", () => {
    const bases = ["a", "e", "i", "o"];
    const a = makeAlphabet({
      bases,
      marks: [ACUTE],
      attestedStacks: bases.map((b) => ({ base: b, marks: [ACUTE] })),
    });
    const classes = groupMarkClasses(a);
    const proposals = proposeAttachments(a, classes);
    const [prefill] = computeMentalModelPrefills(a, classes, proposals);
    expect(prefill?.signals.productivitySpread).toBeGreaterThanOrEqual(
      PRODUCTIVITY_SPREAD_THRESHOLD,
    );
    expect(prefill?.recommended).toBe("letter-plus-mark");
  });

  it("narrow spread with no other signal recommends own-letter", () => {
    const a = makeAlphabet({
      bases: ["c", "k"],
      marks: [CEDILLA],
      attestedStacks: [{ base: "c", marks: [CEDILLA] }],
    });
    const classes = groupMarkClasses(a);
    const [prefill] = computeMentalModelPrefills(a, classes, proposeAttachments(a, classes));
    expect(prefill?.recommended).toBe("own-letter");
  });

  it("over-budget combinations render own-letter unaffordable with the reason stated", () => {
    const bases = ["a", "e"];
    const a = makeAlphabet({
      bases,
      marks: [ACUTE],
      attestedStacks: bases.map((b) => ({ base: b, marks: [ACUTE] })),
    });
    const classes = groupMarkClasses(a);
    const [prefill] = computeMentalModelPrefills(a, classes, proposeAttachments(a, classes), {
      spareKeys: 1,
    });
    expect(prefill?.signals.ownLetterAffordable).toBe(false);
    expect(prefill?.signals.unaffordableReason).toMatch(/more keys than your keyboard has free/);
    expect(prefill?.recommended).toBe("letter-plus-mark");
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

describe("buildPlacementWorklist (FR-020, SC-007)", () => {
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

  it("classifies own-letter units, mark units (with input order), and blocked pairs", () => {
    const worklist = buildPlacementWorklist({
      alphabet,
      classes,
      attachments,
      mentalModel: { [acuteClassId]: "letter-plus-mark", [cedillaClassId]: "own-letter" },
      inputOrder: "postfix",
    });
    // Acute is productive: its own key + attach behavior.
    expect(worklist.markUnits).toEqual([{ mark: ACUTE, inputOrder: "postfix" }]);
    // Cedilla is own-letter: ç is a whole unit; plain bases all present.
    expect(worklist.ownLetterUnits).toContain("ç");
    for (const b of bases) expect(worklist.ownLetterUnits).toContain(b);
    // Every unchecked pair is blocked (incl. c/k for acute, a/e/k for cedilla).
    expect(worklist.blockedCombinations).toContainEqual({ base: "k", mark: ACUTE });
    expect(worklist.blockedCombinations).toContainEqual({ base: "k", mark: CEDILLA });
  });

  it("satisfies the SC-007 coverage invariant", () => {
    const worklist = buildPlacementWorklist({
      alphabet,
      classes,
      attachments,
      mentalModel: { [acuteClassId]: "letter-plus-mark", [cedillaClassId]: "own-letter" },
      inputOrder: "prefix",
    });
    expect(verifyWorklistCoverage(alphabet, worklist)).toEqual([]);
  });

  it("per-mark override splits a mark out of its class's answer (mixed edge case)", () => {
    const worklist = buildPlacementWorklist({
      alphabet,
      classes,
      attachments,
      mentalModel: { [acuteClassId]: "own-letter", [cedillaClassId]: "own-letter" },
      markOverrides: { [ACUTE]: "letter-plus-mark" },
      inputOrder: "postfix",
    });
    expect(worklist.markUnits).toEqual([{ mark: ACUTE, inputOrder: "postfix" }]);
    expect(worklist.ownLetterUnits).not.toContain("á");
  });
});
