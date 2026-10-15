// see spec.md §7.6 "Corpus-derived placement priors" — PlacementMap fixtures.
// Three representative cases covering the main Phase B rendering scenarios.

import { makePlacementMap } from "../placementMap";
import type { PlacementMap } from "../placementMap";

/**
 * Fixture A — corpus-backed map (Francophone Latin, QWERTY base).
 *
 * U+00E9 LATIN SMALL LETTER E WITH ACUTE has priorCount=5 — five independent
 * keyboards agreed on K_E + RALT, so the corpus prior wins (§7.6 threshold:
 * ≥3 independent sources).  A lower-confidence phonetic anchor appears as the
 * second candidate.
 *
 * Exercises: `"corpus"` priorSource, priorCount≥3, two-candidate ranked list,
 * `bcp47Context` + `baseLayoutFamily` at map level, `pinnedPriorsVersion`.
 */
export const corpusBackedQwerty: PlacementMap = makePlacementMap({
  bcp47Context: "fr-Latn-CI",
  baseLayoutFamily: "QWERTY",
  pinnedPriorsVersion: "1.0.0",
  entries: [
    {
      codepoint: "U+00E9",
      candidates: [
        {
          vkey: "K_E",
          modifiers: ["RALT"],
          mechanism: "direct",
          priorSource: "corpus",
          priorCount: 5,
          confidence: 0.92,
        },
        {
          vkey: "K_QUOTE",
          modifiers: ["SHIFT"],
          mechanism: "deadkey",
          priorSource: "phonetic",
          priorCount: 0,
          confidence: 0.45,
        },
      ],
    },
    {
      codepoint: "U+00E0",
      candidates: [
        {
          vkey: "K_A",
          modifiers: ["RALT"],
          mechanism: "direct",
          priorSource: "corpus",
          priorCount: 4,
          confidence: 0.88,
        },
      ],
    },
  ],
});
