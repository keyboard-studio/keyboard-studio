// see spec.md section 4 / section 7.5 — BaseKeyboard test fixtures

import { makeBaseKeyboard } from "../baseKeyboard";
import type { BaseKeyboard } from "../baseKeyboard";

/**
 * US-English offline fallback keyboard (spec §4).
 * Always present even when the GitHub API is unavailable.
 * Languages from basic_kbdus.kps <Languages> block (representative sample).
 */
export const basicKbdus: BaseKeyboard = makeBaseKeyboard({
  id: "basic_kbdus",
  path: "release/basic/basic_kbdus",
  script: "Latn",
  targets: ["windows", "macosx", "linux", "web"],
  displayName: "US English (Basic)",
  version: "1.0",
  sourceUrl:
    "https://github.com/keymanapp/keyboards/tree/master/release/basic/basic_kbdus",
  languages: ["en", "id", "ms", "ht", "bi-Latn"],
});

/**
 * SIL Euro Latin — multi-family diacritics exemplar (spec §7.5).
 * Used in the strategy validation table for alphabetic + multi-family diacritics.
 * Languages from sil_euro_latin.kps <Languages> block (representative sample).
 */
export const silEuroLatin: BaseKeyboard = makeBaseKeyboard({
  id: "sil_euro_latin",
  path: "release/sil/sil_euro_latin",
  script: "Latn",
  targets: ["windows", "macosx", "linux", "web"],
  displayName: "SIL Euro Latin",
  version: "3.0.3",
  sourceUrl:
    "https://github.com/keymanapp/keyboards/tree/master/release/sil/sil_euro_latin",
  packageId: "sil_euro_latin",
  languages: [
    "aae", "acf", "af", "aln", "an", "ast", "azz", "bar", "bi", "bjt",
    "fr", "de", "es", "pt", "it", "nl", "pl", "cs", "sk", "ro",
    "ha", "sw", "yo", "ig",
  ],
});

/**
 * SIL Devanagari Phonetic — abugida + clusters exemplar (spec §7.5).
 * Used in the strategy validation table for abugida + cluster sensitivity.
 * Languages from sil_devanagari_phonetic.kps <Languages> block (verbatim).
 * `hi`/`mai` are stored bare exactly as the .kps declares them; their
 * suppress-script is Deva (IANA registry), so bare `hi` already implies `hi-Deva`.
 * The suggestBases() script-guard additionally requires base.script === target.script,
 * so a romanized `hi-Latn` target never false-matches this Devanagari base.
 */
export const silDevanagariPhonetic: BaseKeyboard = makeBaseKeyboard({
  id: "sil_devanagari_phonetic",
  path: "release/sil/sil_devanagari_phonetic",
  script: "Deva",
  targets: ["windows", "macosx", "linux", "web", "mobile", "tablet"],
  displayName: "SIL Devanagari Phonetic",
  version: "2.0",
  sourceUrl:
    "https://github.com/keymanapp/keyboards/tree/master/release/sil/sil_devanagari_phonetic",
  packageId: "sil_devanagari_phonetic",
  languages: ["hi", "mai", "lif-Deva", "cdm-Deva"],
});

/** All sample BaseKeyboard fixtures as an ordered array. */
export const sampleBaseKeyboards: BaseKeyboard[] = [
  basicKbdus,
  silEuroLatin,
  silDevanagariPhonetic,
];
