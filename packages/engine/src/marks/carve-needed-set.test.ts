// deriveCarveNeededSet tests (#1357 data-derivation prerequisite): the four
// cases from the task brief — productive-only, own-letter-only, mixed, and
// blocked — plus the fallback (skipped/absent worklist) and multi-mark-stack
// paths.

import { describe, expect, it } from "vitest";
import { makeConfirmedAlphabet } from "@keyboard-studio/contracts";
import type { PlacementWorklist } from "@keyboard-studio/contracts";
import { deriveCarveNeededSet } from "./carve-needed-set.js";

const ACUTE = "́";
const CEDILLA = "̧";
const CIRCUMFLEX = "̂"; // U+0302, combining class 230
const DOT_BELOW = "̣"; // U+0323, combining class 220

describe("deriveCarveNeededSet", () => {
  it("fallback: absent worklist degrades to the whole confirmedInventory projection (pre-046 behavior)", () => {
    const alphabet = makeConfirmedAlphabet({
      bases: ["a", "e"],
      marks: [ACUTE],
      attestedStacks: [{ base: "a", marks: [ACUTE] }],
    });
    const result = deriveCarveNeededSet({ alphabet, worklist: undefined });
    expect(result.requiredPrimary.has("a")).toBe(true);
    expect(result.requiredPrimary.has("e")).toBe(true);
    expect(result.requiredPrimary.has("á")).toBe(true); // NFC-composed stack
    expect(result.optionalSecondary.size).toBe(0);
    expect(result.blockCandidates).toHaveLength(0);
  });

  it("fallback: an empty (S0-skip) worklist behaves the same as an absent one", () => {
    const alphabet = makeConfirmedAlphabet({ bases: ["a", "b"], marks: [] });
    const emptyWorklist: PlacementWorklist = {
      ownLetterUnits: [],
      markUnits: [],
      blockedCombinations: [],
    };
    const result = deriveCarveNeededSet({ alphabet, worklist: emptyWorklist });
    expect(result.requiredPrimary).toEqual(new Set(["a", "b"]));
    expect(result.optionalSecondary.size).toBe(0);
    expect(result.blockCandidates).toHaveLength(0);
  });

  it("productive-only: bare mark is required; every reachable precomposed combo is optional (never a removal candidate)", () => {
    const alphabet = makeConfirmedAlphabet({
      bases: ["a", "e"],
      marks: [ACUTE],
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "e", marks: [ACUTE] },
      ],
    });
    const worklist: PlacementWorklist = {
      ownLetterUnits: ["a", "e"],
      markUnits: [{ mark: ACUTE, inputOrder: "postfix" }],
      blockedCombinations: [],
    };
    const result = deriveCarveNeededSet({ alphabet, worklist });

    // Required: bases, the bare mark itself, AND the attested combos — an
    // attested stack (Tier 4) is unconditionally required regardless of the
    // productive/own-letter classification the combo also gets via Tier 2b.
    expect(result.requiredPrimary).toEqual(new Set(["a", "e", ACUTE, "á", "é"]));
    // Also optional (kept, never flagged): the reachable precomposed combos
    // remain the "other representation" too — membership in both tiers is
    // harmless, since both are never removal-flagged.
    expect(result.optionalSecondary).toEqual(new Set(["á", "é"]));
    expect(result.blockCandidates).toHaveLength(0);
  });

  it("own-letter-only: every reachable precomposed combo is required; the bare mark is the optional (other) representation", () => {
    const alphabet = makeConfirmedAlphabet({
      bases: ["c", "k"],
      marks: [CEDILLA],
      attestedStacks: [{ base: "c", marks: [CEDILLA] }],
    });
    const worklist: PlacementWorklist = {
      ownLetterUnits: ["c", "k", "ç"],
      markUnits: [],
      blockedCombinations: [{ base: "k", mark: CEDILLA }],
    };
    const result = deriveCarveNeededSet({ alphabet, worklist });

    expect(result.requiredPrimary).toEqual(new Set(["c", "k", "ç"]));
    expect(result.optionalSecondary).toEqual(new Set([CEDILLA]));
    expect(result.blockCandidates).toEqual([{ base: "k", mark: CEDILLA }]);
  });

  it("mixed: an own-letter mark and a productive mark on the SAME base classify independently", () => {
    const alphabet = makeConfirmedAlphabet({
      bases: ["a"],
      marks: [ACUTE, CEDILLA],
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "a", marks: [CEDILLA] },
      ],
    });
    const worklist: PlacementWorklist = {
      ownLetterUnits: ["a", "á"], // acute is own-letter on "a"
      markUnits: [{ mark: CEDILLA, inputOrder: "postfix" }], // cedilla is productive
      blockedCombinations: [],
    };
    const result = deriveCarveNeededSet({ alphabet, worklist });

    // Own-letter acute combo required; productive cedilla combo optional.
    expect(result.requiredPrimary.has("á")).toBe(true);
    expect(result.requiredPrimary.has(CEDILLA)).toBe(true); // productive bare mark required
    expect(result.optionalSecondary.has("a" + CEDILLA)).toBe(true);
    expect(result.optionalSecondary.has(ACUTE)).toBe(true); // own-letter's "other" bare-mark representation
    expect(result.blockCandidates).toHaveLength(0);
  });

  it("blocked: an unreachable base+mark pair is named as a block-candidate, never required or optional", () => {
    const alphabet = makeConfirmedAlphabet({
      bases: ["a", "e"],
      marks: [ACUTE],
      attestedStacks: [{ base: "a", marks: [ACUTE] }],
    });
    const worklist: PlacementWorklist = {
      ownLetterUnits: ["a", "e", "á"],
      markUnits: [],
      blockedCombinations: [{ base: "e", mark: ACUTE }],
    };
    const result = deriveCarveNeededSet({ alphabet, worklist });

    expect(result.blockCandidates).toEqual([{ base: "e", mark: ACUTE }]);
    expect(result.requiredPrimary.has("á")).toBe(true); // the REACHABLE combo stays required
    expect(result.requiredPrimary.has("é")).toBe(false); // the blocked combo is neither tier
    expect(result.optionalSecondary.has("é")).toBe(false);
  });

  it("blocked combination's shared machinery is never itself flagged: bases and the surviving reachable combo stay required", () => {
    // A mark that fans out to MULTIPLE bases, one reachable, one blocked —
    // the block-candidate must name only the specific blocked pair, and must
    // not suppress the base letters or the surviving reachable combo.
    const alphabet = makeConfirmedAlphabet({
      bases: ["a", "e", "i"],
      marks: [ACUTE],
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "i", marks: [ACUTE] },
      ],
    });
    const worklist: PlacementWorklist = {
      ownLetterUnits: ["a", "e", "i", "á", "í"],
      markUnits: [],
      blockedCombinations: [{ base: "e", mark: ACUTE }],
    };
    const result = deriveCarveNeededSet({ alphabet, worklist });

    expect(result.blockCandidates).toEqual([{ base: "e", mark: ACUTE }]);
    expect(result.requiredPrimary.has("a")).toBe(true);
    expect(result.requiredPrimary.has("e")).toBe(true);
    expect(result.requiredPrimary.has("i")).toBe(true);
    expect(result.requiredPrimary.has("á")).toBe(true);
    expect(result.requiredPrimary.has("í")).toBe(true);
  });

  it("multi-mark stacks (>=2 marks): the composed form is always required, stacking order preserved", () => {
    const alphabet = makeConfirmedAlphabet({
      bases: ["a"],
      marks: [CIRCUMFLEX, ACUTE],
      attestedStacks: [{ base: "a", marks: [CIRCUMFLEX, ACUTE] }],
    });
    const worklist: PlacementWorklist = {
      ownLetterUnits: ["a"],
      markUnits: [
        { mark: CIRCUMFLEX, inputOrder: "postfix" },
        { mark: ACUTE, inputOrder: "postfix" },
      ],
      blockedCombinations: [],
    };
    const result = deriveCarveNeededSet({ alphabet, worklist });

    // a + circumflex + acute NFC-composes to U+1EA5 (ấ).
    expect(result.requiredPrimary.has("ấ")).toBe(true);
  });

  it("single-mark attested stack: an attested stack is required even when its base+mark pair is ALSO blocked — never a block-candidate victim", () => {
    // Regression: a single-mark attested stack (author-typed "é") whose
    // base+mark pair also appears in blockedCombinations must still land in
    // requiredPrimary, never be silently dropped by being treated as a
    // block-candidate only.
    const alphabet = makeConfirmedAlphabet({
      bases: ["e"],
      marks: [ACUTE],
      attestedStacks: [{ base: "e", marks: [ACUTE] }],
    });
    const worklist: PlacementWorklist = {
      ownLetterUnits: ["e"],
      markUnits: [],
      blockedCombinations: [{ base: "e", mark: ACUTE }],
    };
    const result = deriveCarveNeededSet({ alphabet, worklist });

    expect(result.requiredPrimary.has("é")).toBe(true);
    expect(result.blockCandidates).toEqual([{ base: "e", mark: ACUTE }]);
  });

  it("cross-combining-class stack (Vietnamese ậ): typed order preserved verbatim under base-plus-mark, and collapses to the produced grapheme once the comparison seam normalizes", () => {
    // circumflex (ccc 230) is typed/attested BEFORE dot-below (ccc 220), so the
    // author's stacking order is the REVERSE of Unicode's canonical
    // (ascending-ccc) order. composeCombo must never re-derive canonical order
    // (that would erase the order-distinct-stack contract), so under
    // base-plus-mark the needed literal is preserved verbatim.
    const alphabet = makeConfirmedAlphabet({
      bases: ["a"],
      marks: [CIRCUMFLEX, DOT_BELOW],
      attestedStacks: [{ base: "a", marks: [CIRCUMFLEX, DOT_BELOW] }],
    });
    const worklist: PlacementWorklist = {
      ownLetterUnits: ["a"],
      markUnits: [
        { mark: CIRCUMFLEX, inputOrder: "postfix" },
        { mark: DOT_BELOW, inputOrder: "postfix" },
      ],
      blockedCombinations: [],
    };
    const readyMade = deriveCarveNeededSet({ alphabet, worklist, outputForm: "ready-made" });
    const basePlusMark = deriveCarveNeededSet({ alphabet, worklist, outputForm: "base-plus-mark" });

    // ready-made NFC-composes to the precomposed grapheme U+1EAD (ậ).
    expect(readyMade.requiredPrimary.has("ậ")).toBe(true);

    // base-plus-mark preserves the author's typed order verbatim — NOT the
    // canonical NFD order (which puts dot-below before circumflex).
    const verbatim = "a" + CIRCUMFLEX + DOT_BELOW;
    const canonical = "a" + DOT_BELOW + CIRCUMFLEX;
    expect(basePlusMark.requiredPrimary.has(verbatim)).toBe(true);
    expect(verbatim.normalize("NFD")).toBe(canonical); // typed order != canonical

    // The carve comparison seam (annotateRemovalRecommendations / CarveGallery's
    // neededSet) normalizes BOTH the needed literal and the produced literal to
    // the output form's normalization form (base-plus-mark => NFD) before
    // matching. So a produced "ậ" (in either typed or canonical order) collapses
    // to the SAME string as this needed literal — no false "surplus" removal.
    expect(verbatim.normalize("NFD")).toBe("ậ".normalize("NFD"));
    expect(verbatim.normalize("NFD")).toBe(canonical.normalize("NFD"));
  });

  it("outputForm 'base-plus-mark' leaves the combo literal (no NFC compose attempt)", () => {
    const alphabet = makeConfirmedAlphabet({
      bases: ["a"],
      marks: [ACUTE],
      attestedStacks: [{ base: "a", marks: [ACUTE] }],
    });
    const worklist: PlacementWorklist = {
      ownLetterUnits: ["a", "á"],
      markUnits: [],
      blockedCombinations: [],
    };
    const readyMade = deriveCarveNeededSet({ alphabet, worklist, outputForm: "ready-made" });
    const basePlusMark = deriveCarveNeededSet({ alphabet, worklist, outputForm: "base-plus-mark" });

    expect(readyMade.requiredPrimary.has("á")).toBe(true); // precomposed
    expect(basePlusMark.requiredPrimary.has("a" + ACUTE)).toBe(true); // literal, uncomposed
    expect(basePlusMark.requiredPrimary.has("á")).toBe(false);
  });
});
