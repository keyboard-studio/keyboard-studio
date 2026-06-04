// see spec.md section 4 / section 7.5 — BaseKeyboard test fixtures

import { makeBaseKeyboard } from "../baseKeyboard";
import type { BaseKeyboard } from "../baseKeyboard";

/**
 * US-English offline fallback keyboard (spec §4).
 * Always present even when the GitHub API is unavailable.
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
});

/**
 * SIL Euro Latin — multi-family diacritics exemplar (spec §7.5).
 * Used in the strategy validation table for alphabetic + multi-family diacritics.
 */
export const silEuroLatin: BaseKeyboard = makeBaseKeyboard({
  id: "sil_euro_latin",
  path: "release/sil/sil_euro_latin",
  script: "Latn",
  targets: ["windows", "macosx", "linux", "web"],
  displayName: "SIL Euro Latin",
  version: "1.1",
  sourceUrl:
    "https://github.com/keymanapp/keyboards/tree/master/release/sil/sil_euro_latin",
  packageId: "sil_euro_latin",
});

/**
 * SIL Devanagari Phonetic — abugida + clusters exemplar (spec §7.5).
 * Used in the strategy validation table for abugida + cluster sensitivity.
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
});

/** All sample BaseKeyboard fixtures as an ordered array. */
export const sampleBaseKeyboards: BaseKeyboard[] = [
  basicKbdus,
  silEuroLatin,
  silDevanagariPhonetic,
];
