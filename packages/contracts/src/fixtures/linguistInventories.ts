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
 * Fixture C — Hebrew RTL with directionControlChars.
 * Exercises the RTL optional field; directionControlChars stores code-point
 * notation strings ("U+200F", "U+200E") not raw invisible char bytes — this
 * matches the prompt template format and the YAML survey option values.
 */
export const hebrewRtlCoverageOnly: LinguistInventory = {
  language: "he",
  script: "Hebrew",
  alphabetCore: { lowercase: ["א", "ב", "ג"], uppercase: [] },
  mandatoryDiacriticsAndLigatures: [],
  languageSpecificPunctuation: [],
  numerals: ["0", "1"],
  directionControlChars: ["U+200F", "U+200E"],
};

/**
 * Fixture D — Cree (Canadian Syllabics) with syllabicFinalMarkers.
 * Exercises the syllabic-script optional field with a linguistically realistic
 * inventory: U+1427 CANADIAN SYLLABICS FINAL MIDDLE DOT is the period-like
 * dot that marks a syllable-final w- in the Cree/Ojibwe traditions.
 */
export const creeWithSyllabicFinals: LinguistInventory = {
  language: "cr-Cans",
  script: "Canadian Syllabics",
  alphabetCore: { lowercase: ["ᐁ", "ᐃ", "ᐅ"], uppercase: [] },
  mandatoryDiacriticsAndLigatures: [],
  languageSpecificPunctuation: [],
  numerals: ["0", "1"],
  syllabicFinalMarkers: ["ᐧ"],
};
