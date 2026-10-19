// placementInventory — regression suite for issue #2293: the placement
// walk set is derived ONCE from the marks series' answers (worklist units
// + the non-alphabet complement), not re-derived per gallery from the
// flat inventory. The flat inventory always carries BOTH representations
// of a marked letter (every attested stack composed to NFC, plus every
// lone mark); the placement set must carry exactly the representation
// the intervening questions chose.
//
// Fixtures are built with the REAL engine derivation
// (buildPlacementWorklist over groupMarkClasses/proposeAttachments-shaped
// inputs), so the worklist in each test is the one the marks series would
// actually hand off for those answers.

import { describe, it, expect } from "vitest";
import {
  deriveConfirmedInventory,
  makeConfirmedAlphabet,
  makeEmptyPlacementWorklist,
  type ConfirmedAlphabet,
  type PlacementWorklist,
} from "@keyboard-studio/contracts";
import { buildPlacementWorklist, makeMarkTreatmentAnswer } from "@keyboard-studio/engine";
import type { MarkClass } from "@keyboard-studio/engine";
import {
  derivePlacementInventory,
  deriveTreatmentFilteredChars,
} from "./placementInventory.ts";

const GRAVE = "̀"; // U+0300
const CIRC = "̂"; // U+0302
const CARON = "̌"; // U+030C

// The Bafut (bfd) sample's 22 distinct attested base+mark sequences
// (verified against the pasted NFD passage, 2026-10-19).
const BAFUT_STACKS: Array<[string, string]> = [
  ["a", GRAVE], ["ə", GRAVE], ["i", GRAVE], ["ɨ", GRAVE], ["a", CIRC],
  ["n", GRAVE], ["u", GRAVE], ["u", CIRC], ["ŋ", GRAVE], ["ɛ", GRAVE],
  ["o", GRAVE], ["ə", CIRC], ["m", GRAVE], ["ɨ", CIRC], ["i", CIRC],
  ["ɔ", GRAVE], ["o", CIRC], ["O", GRAVE], ["ɔ", CARON], ["A", GRAVE],
  ["o", CARON], ["a", CARON],
];
const BAFUT_BASES = [
  "a", "b", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p",
  "r", "s", "t", "u", "v", "w", "y", "z",
  "ə", "ɨ", "ŋ", "ɛ", "ɔ", "ʼ",
  "A", "L", "M", "N", "O", "Y", "Ŋ",
];
const BAFUT_COMPOSED = BAFUT_STACKS.map(([base, mark]) => (base + mark).normalize("NFC"));

function bafutAlphabet(): ConfirmedAlphabet {
  return makeConfirmedAlphabet({
    bases: BAFUT_BASES,
    marks: [GRAVE, CIRC, CARON],
    attestedStacks: BAFUT_STACKS.map(([base, mark]) => ({
      base,
      marks: [mark],
      source: "text" as const,
    })),
  });
}

const BAFUT_CLASSES: MarkClass[] = [
  { id: "above-1", label: "Marks above the letter (group 1)", marks: [GRAVE] },
  { id: "above-2", label: "Marks above the letter (group 2)", marks: [CIRC] },
  { id: "above-3", label: "Marks above the letter (group 3)", marks: [CARON] },
];

/** Attachments as S1 leaves them when the author accepts exactly the attested pairs. */
function attestedOnlyAttachments(alphabet: ConfirmedAlphabet): Record<string, Record<string, boolean>> {
  const attested = new Set(alphabet.attestedStacks.map((s) => `${s.base}${s.marks.join("")}`));
  const out: Record<string, Record<string, boolean>> = {};
  for (const mark of alphabet.marks) {
    out[mark] = {};
    for (const base of alphabet.bases) out[mark]![base] = attested.has(`${base}${mark}`);
  }
  return out;
}

function bafutWorklist(
  treatment: "own-key" | "composed",
  promoted: string[] = [],
): PlacementWorklist {
  const alphabet = bafutAlphabet();
  const answer = {
    ...makeMarkTreatmentAnswer("postfix"),
    classTreatment: {
      "above-1": treatment,
      "above-2": treatment,
      "above-3": treatment,
    },
    promoted,
  };
  return buildPlacementWorklist({
    alphabet,
    classes: BAFUT_CLASSES,
    attachments: attestedOnlyAttachments(alphabet),
    treatment: answer,
    prefills: [],
  });
}

/** A phase-C punctuation contribution, to prove the complement survives filtering. */
const NON_ALPHABET = "«";

function bafutInventory(alphabet: ConfirmedAlphabet): string[] {
  return [...deriveConfirmedInventory(alphabet), NON_ALPHABET];
}

describe("derivePlacementInventory — Bafut, postfix own-key treatment (issue #2293 AC4a)", () => {
  it("walks the 3 marks and every base — none of the 22 composed forms", () => {
    const alphabet = bafutAlphabet();
    const placement = derivePlacementInventory(
      bafutInventory(alphabet),
      alphabet,
      bafutWorklist("own-key"),
    );

    for (const mark of [GRAVE, CIRC, CARON]) expect(placement).toContain(mark);
    for (const base of ["ə", "ɨ", "ŋ", "ɛ", "ɔ", "ʼ", "Ŋ"]) {
      expect(placement).toContain(base);
    }
    for (const composed of BAFUT_COMPOSED) {
      expect(placement).not.toContain(composed);
    }
    // Exactly: all bases (flat-inventory order) + the 3 marks + the
    // non-alphabet complement — nothing else.
    expect(placement).toEqual([...BAFUT_BASES, GRAVE, CIRC, CARON, NON_ALPHABET]);
  });
});

describe("derivePlacementInventory — composed-treatment mirror (issue #2293 AC4b)", () => {
  it("walks the composed forms — the lone marks are not placement units", () => {
    const alphabet = bafutAlphabet();
    const placement = derivePlacementInventory(
      bafutInventory(alphabet),
      alphabet,
      bafutWorklist("composed"),
    );

    for (const composed of BAFUT_COMPOSED) expect(placement).toContain(composed);
    for (const mark of [GRAVE, CIRC, CARON]) expect(placement).not.toContain(mark);
    expect(placement).toEqual([...BAFUT_BASES, ...BAFUT_COMPOSED, NON_ALPHABET]);
  });
});

describe("derivePlacementInventory — promoted combinations (issue #2293 AC4c)", () => {
  it("keeps a promoted combination placeable under own-key treatment (with its derived capital)", () => {
    const alphabet = bafutAlphabet();
    // MarksSeriesStep case-expands promotions before building the worklist:
    // promoting à also promotes À. Every other composed form stays out.
    const placement = derivePlacementInventory(
      bafutInventory(alphabet),
      alphabet,
      bafutWorklist("own-key", ["à", "À"]),
    );

    expect(placement).toContain("à");
    expect(placement).toContain("À");
    for (const composed of BAFUT_COMPOSED) {
      if (composed === "à" || composed === "À") continue;
      expect(placement).not.toContain(composed);
    }
    for (const mark of [GRAVE, CIRC, CARON]) expect(placement).toContain(mark);
  });
});

describe("derivePlacementInventory — fallbacks and edge cases", () => {
  it("is the flat inventory when no worklist exists (pre-046 / series not run)", () => {
    const alphabet = bafutAlphabet();
    const flat = bafutInventory(alphabet);
    expect(derivePlacementInventory(flat, alphabet, undefined)).toEqual(flat);
  });

  it("is the flat inventory for the empty S0-skip worklist sentinel", () => {
    const alphabet = bafutAlphabet();
    const flat = bafutInventory(alphabet);
    expect(derivePlacementInventory(flat, alphabet, makeEmptyPlacementWorklist())).toEqual(flat);
  });

  it("is the flat inventory when the alphabet is absent (complement uncomputable)", () => {
    const alphabet = bafutAlphabet();
    const flat = bafutInventory(alphabet);
    expect(derivePlacementInventory(flat, undefined, bafutWorklist("own-key"))).toEqual(flat);
  });

  it("appends a worklist unit the flat inventory never carried (plausible-accepted pair)", () => {
    // "q" is a confirmed base with NO attested grave stack; the author
    // checked the plausible pair at S1 under composed treatment, so the
    // worklist carries q+grave as a composed unit even though the flat
    // inventory (attested stacks only) does not.
    const alphabet = makeConfirmedAlphabet({
      bases: ["a", "q"],
      marks: [GRAVE],
      attestedStacks: [{ base: "a", marks: [GRAVE] }],
    });
    const classes: MarkClass[] = [{ id: "above-1", label: "Marks above", marks: [GRAVE] }];
    const worklist = buildPlacementWorklist({
      alphabet,
      classes,
      attachments: { [GRAVE]: { a: true, q: true } },
      treatment: {
        ...makeMarkTreatmentAnswer("postfix"),
        classTreatment: { "above-1": "composed" },
      },
      prefills: [],
    });
    const flat = deriveConfirmedInventory(alphabet); // [a, q, à, GRAVE]
    const placement = derivePlacementInventory(flat, alphabet, worklist);
    expect(placement).toEqual(["a", "q", "à", "q̀"]);
    expect(placement).not.toContain(GRAVE);
  });
});

describe("deriveTreatmentFilteredChars — the strip-selection gate (issue #2293)", () => {
  it("own-key treatment: every attested composed form is filtered, no mark or base is", () => {
    const alphabet = bafutAlphabet();
    const flat = bafutInventory(alphabet);
    const filtered = deriveTreatmentFilteredChars(flat, alphabet, bafutWorklist("own-key"));
    expect(new Set(filtered)).toEqual(new Set(BAFUT_COMPOSED));
    for (const mark of [GRAVE, CIRC, CARON]) expect(filtered.has(mark)).toBe(false);
    for (const base of BAFUT_BASES) expect(filtered.has(base)).toBe(false);
    expect(filtered.has(NON_ALPHABET)).toBe(false);
  });

  it("composed treatment: the lone marks are filtered, composed forms are not", () => {
    const alphabet = bafutAlphabet();
    const flat = bafutInventory(alphabet);
    const filtered = deriveTreatmentFilteredChars(flat, alphabet, bafutWorklist("composed"));
    expect(new Set(filtered)).toEqual(new Set([GRAVE, CIRC, CARON]));
    for (const form of BAFUT_COMPOSED) expect(filtered.has(form)).toBe(false);
  });

  it("mixed treatment: own-key classes' forms and the composed class's lone mark are filtered", () => {
    const alphabet = bafutAlphabet();
    const answer = {
      ...makeMarkTreatmentAnswer("postfix"),
      classTreatment: {
        "above-1": "own-key" as const,
        "above-2": "own-key" as const,
        "above-3": "composed" as const,
      },
      promoted: [] as string[],
    };
    const worklist = buildPlacementWorklist({
      alphabet,
      classes: BAFUT_CLASSES,
      attachments: attestedOnlyAttachments(alphabet),
      treatment: answer,
      prefills: [],
    });
    const filtered = deriveTreatmentFilteredChars(bafutInventory(alphabet), alphabet, worklist);
    const caronForms = new Set(
      BAFUT_STACKS.filter(([, m]) => m === CARON).map(([b, m]) => (b + m).normalize("NFC")),
    );
    // Own-key classes (grave, circumflex): their composed forms are
    // filtered. Composed class (caron): its forms are placement units,
    // its lone mark is filtered instead.
    const expected = new Set([
      ...BAFUT_COMPOSED.filter((f) => !caronForms.has(f)),
      CARON,
    ]);
    expect(new Set(filtered)).toEqual(expected);
  });

  it("fallbacks are empty: no worklist, empty worklist, no alphabet", () => {
    const alphabet = bafutAlphabet();
    const flat = bafutInventory(alphabet);
    expect(deriveTreatmentFilteredChars(flat, alphabet, undefined).size).toBe(0);
    expect(
      deriveTreatmentFilteredChars(flat, alphabet, makeEmptyPlacementWorklist()).size,
    ).toBe(0);
    expect(
      deriveTreatmentFilteredChars(flat, undefined, bafutWorklist("own-key")).size,
    ).toBe(0);
  });
});
