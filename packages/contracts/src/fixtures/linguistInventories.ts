// see spec.md section 8 step 4 — representative LinguistInventory fixtures
// for the five optional fields added in issue #191.

import type { LinguistInventory } from "../linguistInventory";

/**
 * Fixture A — Hausa (Latin) with digraphsAsPhonemeUnits.
 * Exercises the S-01 digraph signal path.
 */
export const hausaWithDigraphs: LinguistInventory = {
  language: "ha",
  script: "Latin",
  alphabetCore: { lowercase: ["a", "b", "c"], uppercase: ["A", "B", "C"] },
  mandatoryDiacriticsAndLigatures: [],
  languageSpecificPunctuation: [],
  numerals: ["0", "1", "2"],
  digraphsAsPhonemeUnits: ["sh", "ts", "ny", "ng"],
};

/**
 * Fixture B — Hindi (Devanagari) with nuktaAndBorrowedSoundMarkers and
 * independentVowels.  Exercises the Indic-script optional fields.
 */
export const hindiWithNukta: LinguistInventory = {
  language: "hi",
  script: "Devanagari",
  alphabetCore: { lowercase: ["क", "ख", "ग"], uppercase: [] },
  mandatoryDiacriticsAndLigatures: [],
  languageSpecificPunctuation: [],
  numerals: ["०", "१"],
  nuktaAndBorrowedSoundMarkers: ["क़", "ख़"],
  independentVowels: ["अ", "आ", "इ", "ई"],
};

/**
 * Fixture C — Hebrew RTL with directionControlChars and syllabicFinalMarkers.
 * Exercises the remaining two optional fields from issue #191.
 * syllabicFinalMarkers is included here for completeness even though Hebrew
 * is not a syllabic script — the type allows any script to carry the field.
 */
export const hebrewWithDirectionMarks: LinguistInventory = {
  language: "he",
  script: "Hebrew",
  alphabetCore: { lowercase: ["א", "ב", "ג"], uppercase: [] },
  mandatoryDiacriticsAndLigatures: [],
  languageSpecificPunctuation: [],
  numerals: ["0", "1"],
  directionControlChars: ["‏", "‎"],
  syllabicFinalMarkers: ["ᐧ"],
};
