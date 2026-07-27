// Curated, version-pinned set of Glottolog "pseudo-family" roots (spec 036
// FR-012, research.md D6). A languoid whose resolved `familyId` is in this set
// is treated as non-genealogical: it never registers relatedness, and two
// languages that share only a pseudo-family are NOT related.
//
// Glottocodes are stable across releases; name-matching would break on
// rename/localisation and `languages.csv` carries no reliable category flag to
// derive from — hence a checked-in code set. REVIEW THIS AT EACH PIN BUMP
// (FR-005): confirm each code still resolves to the intended top-level
// pseudo-family in the newly pinned release before committing.

import type { Glottocode } from "./types.js";

/**
 * Stable Glottolog top-level pseudo-families. Confirmed against the pinned
 * glottolog-cldf release (see scripts/glottolog-version.json).
 */
export const PSEUDO_FAMILIES: ReadonlySet<Glottocode> = new Set<Glottocode>([
  "book1242", // Bookkeeping
  "uncl1493", // Unclassifiable
  "unat1236", // Unattested
  "arti1236", // Artificial Language
  "sign1238", // Sign Language
  "mixe1287", // Mixed Language
  "pidg1258", // Pidgin
  "spee1234", // Speech Register
]);
