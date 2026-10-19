// Bafut (bfd) session fixture for the issue #2293 gallery-walk suites
// (MechanismGallery.placementWalk / TouchGallery.placementWalk).
//
// Reproduces the 2026-10-19 smoke-test session shape: the author pasted a
// fully-NFD Bafut passage, so the confirmed alphabet carries 22 attested
// base+mark stacks over only 3 marks (U+0300 grave, U+0302 circumflex,
// U+030C caron), and the flat session inventory (the alphabet projection
// mergePhaseResults folds in) carries BOTH representations — every
// composed form plus every lone mark. The worklist is built with the REAL
// engine derivation from the marks answers each case states, exactly as
// MarksSeriesStep's completion builds it.

import {
  makeConfirmedAlphabet,
  type ConfirmedAlphabet,
  type PlacementWorklist,
} from "@keyboard-studio/contracts";
import { buildPlacementWorklist, makeMarkTreatmentAnswer } from "@keyboard-studio/engine";
import type { MarkClass } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

export const GRAVE = "̀"; // U+0300
export const CIRC = "̂"; // U+0302
export const CARON = "̌"; // U+030C
export const BAFUT_MARKS = [GRAVE, CIRC, CARON];

/** The sample's 22 distinct attested base+mark sequences. */
export const BAFUT_STACKS: Array<[string, string]> = [
  ["a", GRAVE], ["ə", GRAVE], ["i", GRAVE], ["ɨ", GRAVE], ["a", CIRC],
  ["n", GRAVE], ["u", GRAVE], ["u", CIRC], ["ŋ", GRAVE], ["ɛ", GRAVE],
  ["o", GRAVE], ["ə", CIRC], ["m", GRAVE], ["ɨ", CIRC], ["i", CIRC],
  ["ɔ", GRAVE], ["o", CIRC], ["O", GRAVE], ["ɔ", CARON], ["A", GRAVE],
  ["o", CARON], ["a", CARON],
];

export const BAFUT_BASES = [
  "a", "b", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p",
  "r", "s", "t", "u", "v", "w", "y", "z",
  "ə", "ɨ", "ŋ", "ɛ", "ɔ", "ʼ",
  "A", "L", "M", "N", "O", "Y", "Ŋ",
];

/** Every composed form the flat inventory carries for the stacks (NFC). */
export const BAFUT_COMPOSED = BAFUT_STACKS.map(([base, mark]) =>
  (base + mark).normalize("NFC"),
);

export function bafutAlphabet(): ConfirmedAlphabet {
  return makeConfirmedAlphabet({
    bases: BAFUT_BASES,
    marks: [...BAFUT_MARKS],
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

/**
 * The worklist the marks series hands off for the stated answers:
 * attachments = exactly the attested pairs (the author accepted the S1
 * proposals as-is), inputOrder postfix ("letter, then diacritic").
 * `promoted` is the CASE-EXPANDED set, as MarksSeriesStep records it.
 */
export function bafutWorklist(
  treatment: "own-key" | "composed",
  promoted: string[] = [],
): PlacementWorklist {
  const alphabet = bafutAlphabet();
  const attested = new Set(
    alphabet.attestedStacks.map((s) => `${s.base}${s.marks.join("")}`),
  );
  const attachments: Record<string, Record<string, boolean>> = {};
  for (const mark of alphabet.marks) {
    attachments[mark] = {};
    for (const base of alphabet.bases) {
      attachments[mark]![base] = attested.has(`${base}${mark}`);
    }
  }
  return buildPlacementWorklist({
    alphabet,
    classes: BAFUT_CLASSES,
    attachments,
    treatment: {
      ...makeMarkTreatmentAnswer("postfix"),
      classTreatment: {
        "above-1": treatment,
        "above-2": treatment,
        "above-3": treatment,
      },
      promoted,
    },
    prefills: [],
  });
}

/**
 * Seed the working copy with the Bafut session: the alphabet rides the
 * Phase B result (mergePhaseResults folds its projection into
 * session.confirmedInventory — both forms, as in production), and the
 * marks worklist rides the Phase C result, as MarksSeriesStep emits it.
 */
export function seedBafutSession(worklist: PlacementWorklist): void {
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    alphabet: bafutAlphabet(),
  });
  useWorkingCopyStore.getState().recordPhase({
    phase: "C",
    answers: [],
    marksWorklist: worklist,
  });
}
