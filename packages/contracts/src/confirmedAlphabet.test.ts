import { describe, expect, it } from "vitest";
import {
  confirmedAlphabetKey,
  deriveConfirmedInventory,
  makeConfirmedAlphabet,
  makeEmptyPlacementWorklist,
  validateConfirmedAlphabet,
} from "./confirmedAlphabet";

const ACUTE = "́";
const GRAVE = "̀";

describe("makeConfirmedAlphabet", () => {
  it("defaults every store to empty", () => {
    expect(makeConfirmedAlphabet()).toEqual({
      bases: [],
      marks: [],
      attestedStacks: [],
      declaredRoles: {},
    });
  });

  it("keeps provided stores", () => {
    const a = makeConfirmedAlphabet({ bases: ["e"], marks: [ACUTE] });
    expect(a.bases).toEqual(["e"]);
    expect(a.marks).toEqual([ACUTE]);
  });
});

describe("makeEmptyPlacementWorklist", () => {
  it("is the empty three-group classification", () => {
    expect(makeEmptyPlacementWorklist()).toEqual({
      ownLetterUnits: [],
      markUnits: [],
      blockedCombinations: [],
    });
  });
});

describe("deriveConfirmedInventory", () => {
  it("projects bases, composed stacks, then lone marks — NFC, first-appearance order", () => {
    const a = makeConfirmedAlphabet({
      bases: ["e", "c"],
      marks: [ACUTE],
      attestedStacks: [{ base: "e", marks: [ACUTE] }],
    });
    expect(deriveConfirmedInventory(a)).toEqual(["e", "c", "é", ACUTE]);
  });

  it("dedupes NFC-equal entries and drops empties", () => {
    const a = makeConfirmedAlphabet({
      bases: ["e", "é".normalize("NFD"), ""],
      marks: [],
      attestedStacks: [{ base: "e", marks: [ACUTE] }],
    });
    // NFD "é" in bases NFC-normalises to the same grapheme the stack composes to.
    expect(deriveConfirmedInventory(a)).toEqual(["e", "é"]);
  });

  it("distinguishes mark order in stacks (order-preserving projection)", () => {
    const a = makeConfirmedAlphabet({
      bases: ["a"],
      marks: [ACUTE, GRAVE],
      attestedStacks: [
        { base: "a", marks: [ACUTE, GRAVE] },
        { base: "a", marks: [GRAVE, ACUTE] },
      ],
    });
    const inv = deriveConfirmedInventory(a);
    // Both orders survive as distinct entries unless NFC unifies them.
    expect(inv).toContain(("a" + ACUTE + GRAVE).normalize("NFC"));
    expect(inv).toContain(("a" + GRAVE + ACUTE).normalize("NFC"));
  });
});

describe("validateConfirmedAlphabet", () => {
  it("accepts a consistent alphabet", () => {
    const a = makeConfirmedAlphabet({
      bases: ["e"],
      marks: [ACUTE],
      attestedStacks: [{ base: "e", marks: [ACUTE] }],
    });
    expect(validateConfirmedAlphabet(a)).toEqual([]);
  });

  it("flags a stack whose base is missing from bases", () => {
    const a = makeConfirmedAlphabet({
      marks: [ACUTE],
      attestedStacks: [{ base: "e", marks: [ACUTE] }],
    });
    expect(validateConfirmedAlphabet(a)).toHaveLength(1);
    expect(validateConfirmedAlphabet(a)[0]).toMatch(/not in bases/);
  });

  it("flags a stack mark missing from marks, and an empty-marks stack", () => {
    const a = makeConfirmedAlphabet({
      bases: ["e"],
      attestedStacks: [
        { base: "e", marks: [ACUTE] },
        { base: "e", marks: [] },
      ],
    });
    const problems = validateConfirmedAlphabet(a);
    expect(problems.some((p) => /not in marks/.test(p))).toBe(true);
    expect(problems.some((p) => /no marks/.test(p))).toBe(true);
  });

  it("requires a declared role for a private-use character", () => {
    const pua = String.fromCodePoint(0xe000);
    const missing = makeConfirmedAlphabet({ bases: [pua] });
    expect(validateConfirmedAlphabet(missing).some((p) => /declared role/.test(p))).toBe(true);
    const declared = makeConfirmedAlphabet({ bases: [pua], declaredRoles: { [pua]: "letter" } });
    expect(validateConfirmedAlphabet(declared)).toEqual([]);
  });
});

describe("confirmedAlphabetKey", () => {
  it("gives content-equal alphabets equal keys regardless of construction order", () => {
    const a = makeConfirmedAlphabet({
      bases: ["e", "o"],
      marks: [ACUTE, GRAVE],
      attestedStacks: [{ base: "e", marks: [ACUTE] }],
      declaredRoles: {},
    });
    const b: typeof a = {
      declaredRoles: {},
      attestedStacks: [{ marks: [ACUTE], base: "e" }],
      marks: [ACUTE, GRAVE],
      bases: ["e", "o"],
    };
    expect(confirmedAlphabetKey(a)).toBe(confirmedAlphabetKey(b));
  });

  it("gives declaredRoles entries in a different insertion order equal keys", () => {
    const pua1 = String.fromCodePoint(0xe000);
    const pua2 = String.fromCodePoint(0xe001);
    const a = makeConfirmedAlphabet({
      bases: [pua1, pua2],
      declaredRoles: { [pua1]: "letter", [pua2]: "mark" },
    });
    const b = makeConfirmedAlphabet({
      bases: [pua1, pua2],
      declaredRoles: { [pua2]: "mark", [pua1]: "letter" },
    });
    expect(confirmedAlphabetKey(a)).toBe(confirmedAlphabetKey(b));
  });

  it("distinguishes genuinely different content", () => {
    const a = makeConfirmedAlphabet({ bases: ["e"], marks: [ACUTE] });
    const b = makeConfirmedAlphabet({ bases: ["e"], marks: [GRAVE] });
    expect(confirmedAlphabetKey(a)).not.toBe(confirmedAlphabetKey(b));
  });

  it("returns a stable key for undefined", () => {
    expect(confirmedAlphabetKey(undefined)).toBe(confirmedAlphabetKey(undefined));
  });
});
