// Unit tests for charMechanisms.ts — the shared PRODUCES/USES predicate
// behind CharScrollStrip's per-character badge and each gallery's "sequences
// using this character" bottom list.
//
// Coverage plan (see the file-header comment on charMechanisms.ts for the
// full contract this locks down):
//   - producesCount counts ONLY individual-scope, modality-matching
//     assignments whose target IS char (output, not input-only uses).
//   - producesCount EXCLUDES touch_inherited placeholder mechanisms — the
//     regression this selector exists to prevent (a char reachable only via
//     "already in the base touch layout" must not show a green badge).
//   - usesSequences returns every recorded sequence where char appears in
//     ANY slot (firstLetterOut / secondLetter / collapsedChar), including
//     sequences that PRODUCE a different character, and regardless of the
//     assignment's own modality (the USES half is scanned unfiltered).
//   - the badge/list separation: a char that is only USED, never produced,
//     has producesCount 0 but a non-empty usesSequences.

import { describe, it, expect } from "vitest";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { getCharMechanisms } from "./charMechanisms.ts";
import { PATTERN_SEQUENCE, PATTERN_DEADKEY, PATTERN_SWAP } from "../patternIds.ts";

describe("getCharMechanisms — producesCount", () => {
  it("counts an individual-scope, modality-matching assignment targeting char", () => {
    const assignments: MechanismAssignment[] = [
      {
        scope: "individual",
        target: "á",
        modality: "physical",
        mechanisms: [{ patternId: PATTERN_DEADKEY, slotValues: { baseLetters: "a" } }],
      },
    ];

    expect(getCharMechanisms("á", assignments, "physical").producesCount).toBe(1);
  });

  it("does not count an assignment in a different modality (a touch assignment is not a physical producer)", () => {
    const assignments: MechanismAssignment[] = [
      {
        scope: "individual",
        target: "á",
        modality: "touch",
        mechanisms: [{ patternId: "touch_key_replace" }],
      },
    ];

    expect(getCharMechanisms("á", assignments, "physical").producesCount).toBe(0);
  });

  it("does not count character-class or keyboard-default scope assignments — only individual counts as a producer", () => {
    const assignments: MechanismAssignment[] = [
      {
        scope: "character-class",
        target: "á",
        modality: "physical",
        mechanisms: [{ patternId: PATTERN_SWAP }],
      },
      {
        scope: "keyboard-default",
        target: "",
        modality: "physical",
        mechanisms: [{ patternId: PATTERN_SWAP }],
      },
    ];

    expect(getCharMechanisms("á", assignments, "physical").producesCount).toBe(0);
  });

  it("does not count an assignment targeting a different character", () => {
    const assignments: MechanismAssignment[] = [
      {
        scope: "individual",
        target: "é",
        modality: "physical",
        mechanisms: [{ patternId: PATTERN_DEADKEY }],
      },
    ];

    expect(getCharMechanisms("á", assignments, "physical").producesCount).toBe(0);
  });

  it("counts every mechanism in a multi-mechanism assignment separately (each is its own 'way')", () => {
    const assignments: MechanismAssignment[] = [
      {
        scope: "individual",
        target: "á",
        modality: "physical",
        mechanisms: [
          { patternId: PATTERN_DEADKEY, slotValues: { baseLetters: "a" } },
          { patternId: PATTERN_SWAP, slotValues: { kmnRules: "+ [K_A] > 'á'" } },
        ],
      },
    ];

    expect(getCharMechanisms("á", assignments, "physical").producesCount).toBe(2);
  });

  it("EXCLUDES touch_inherited placeholder mechanisms — a char reachable ONLY via touch_inherited yields producesCount 0", () => {
    const assignments: MechanismAssignment[] = [
      {
        scope: "individual",
        target: "中",
        modality: "touch",
        mechanisms: [{ patternId: "touch_inherited" }],
      },
    ];

    expect(getCharMechanisms("中", assignments, "touch").producesCount).toBe(0);
  });

  it("counts real mechanisms alongside an excluded touch_inherited one in the SAME assignment (mixed case)", () => {
    const assignments: MechanismAssignment[] = [
      {
        scope: "individual",
        target: "中",
        modality: "touch",
        mechanisms: [{ patternId: "touch_inherited" }, { patternId: "touch_key_replace" }],
      },
    ];

    expect(getCharMechanisms("中", assignments, "touch").producesCount).toBe(1);
  });
});

describe("getCharMechanisms — usesSequences", () => {
  it("includes a sequence where char is the firstLetterOut (content) slot, even though the sequence PRODUCES a different character", () => {
    const assignments: MechanismAssignment[] = [
      {
        scope: "individual",
        target: "ā", // the sequence's own output — NOT the char under test
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_SEQUENCE,
            slotValues: { firstLetterOut: "a", secondLetter: "x", collapsedChar: "ā" },
          },
        ],
      },
    ];

    const result = getCharMechanisms("a", assignments, "physical");
    expect(result.usesSequences).toHaveLength(1);
    expect(result.usesSequences[0]).toMatchObject({ target: "ā" });
  });

  it("includes a sequence where char is the secondLetter (indicator) slot", () => {
    const assignments: MechanismAssignment[] = [
      {
        scope: "individual",
        target: "ā",
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_SEQUENCE,
            slotValues: { firstLetterOut: "a", secondLetter: "x", collapsedChar: "ā" },
          },
        ],
      },
    ];

    expect(getCharMechanisms("x", assignments, "physical").usesSequences).toHaveLength(1);
  });

  it("includes a sequence where char is the collapsedChar (the sequence's own output) slot", () => {
    const assignments: MechanismAssignment[] = [
      {
        scope: "individual",
        target: "ā",
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_SEQUENCE,
            slotValues: { firstLetterOut: "a", secondLetter: "x", collapsedChar: "ā" },
          },
        ],
      },
    ];

    expect(getCharMechanisms("ā", assignments, "physical").usesSequences).toHaveLength(1);
  });

  it("scans sequences regardless of the assignment's own modality — a touch-modality assignment still surfaces for a caller passing modality: 'physical'", () => {
    const assignments: MechanismAssignment[] = [
      {
        scope: "individual",
        target: "ā",
        modality: "touch", // deliberately NOT matching the modality param below
        mechanisms: [
          {
            patternId: PATTERN_SEQUENCE,
            slotValues: { firstLetterOut: "a", secondLetter: "x", collapsedChar: "ā" },
          },
        ],
      },
    ];

    expect(getCharMechanisms("a", assignments, "physical").usesSequences).toHaveLength(1);
  });

  it("does NOT include a non-sequence mechanism even when its slotValues happen to contain char under the same slot names", () => {
    const assignments: MechanismAssignment[] = [
      {
        scope: "individual",
        target: "z",
        modality: "physical",
        mechanisms: [{ patternId: PATTERN_DEADKEY, slotValues: { firstLetterOut: "a" } }],
      },
    ];

    expect(getCharMechanisms("a", assignments, "physical").usesSequences).toHaveLength(0);
  });

  it("badge/list separation: a character that is only USED (never produced) has producesCount 0 but a non-empty usesSequences", () => {
    const assignments: MechanismAssignment[] = [
      {
        scope: "individual",
        target: "ā", // the sequence produces "ā", never "a"
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_SEQUENCE,
            slotValues: { firstLetterOut: "a", secondLetter: "x", collapsedChar: "ā" },
          },
        ],
      },
    ];

    const result = getCharMechanisms("a", assignments, "physical");
    expect(result.producesCount).toBe(0);
    expect(result.usesSequences.length).toBeGreaterThan(0);
  });
});
