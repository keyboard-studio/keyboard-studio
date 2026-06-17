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

/**
 * Fixture B — phonetic-anchor map (Hausa, QWERTY base).
 *
 * U+0294 LATIN LETTER GLOTTAL STOP has no corpus prior (priorCount=0) — the
 * phonetic anchor places it on K_7 (visually similar to ʔ).  Only one
 * candidate; confidence is moderate.
 *
 * Exercises: `"phonetic"` priorSource, priorCount=0, single-candidate entry,
 * optional fields absent (no pinnedPriorsVersion).
 */
export const phoneticAnchorHausa: PlacementMap = makePlacementMap({
  bcp47Context: "ha-Latn-NG",
  baseLayoutFamily: "QWERTY",
  entries: [
    {
      codepoint: "U+0294",
      candidates: [
        {
          vkey: "K_7",
          modifiers: [],
          mechanism: "direct",
          priorSource: "phonetic",
          priorCount: 0,
          confidence: 0.61,
        },
      ],
    },
    {
      codepoint: "U+014B",
      candidates: [
        {
          vkey: "K_N",
          modifiers: ["RALT"],
          mechanism: "direct",
          priorSource: "corpus",
          priorCount: 7,
          confidence: 0.95,
        },
      ],
    },
  ],
});

/**
 * Fixture C — collision case (two characters propose the same key slot).
 *
 * U+00E8 (è) and U+00EA (ê) both propose K_E + RALT — a collision that §8
 * Phase B must surface as a single resolve-one question rather than two silent
 * pre-fills (spec §8 §1096).
 *
 * The `collisions()` helper should return one group of two entries for this
 * map.  The lower-confidence second candidates differ so the survey can offer
 * alternatives when the user resolves the collision.
 *
 * Exercises: collision detection via `collisions()`, two entries sharing a top
 * candidate slot, distinct lower candidates.
 */
export const collisionCase: PlacementMap = makePlacementMap({
  bcp47Context: "fr-Latn-FR",
  baseLayoutFamily: "QWERTY",
  entries: [
    {
      codepoint: "U+00E8",
      candidates: [
        {
          vkey: "K_E",
          modifiers: ["RALT"],
          mechanism: "direct",
          priorSource: "corpus",
          priorCount: 3,
          confidence: 0.78,
        },
        {
          vkey: "K_LBRKT",
          modifiers: [],
          mechanism: "direct",
          priorSource: "unicode-decomp",
          priorCount: 0,
          confidence: 0.3,
        },
      ],
    },
    {
      codepoint: "U+00EA",
      candidates: [
        {
          vkey: "K_E",
          modifiers: ["RALT"],
          mechanism: "direct",
          priorSource: "corpus",
          priorCount: 3,
          confidence: 0.74,
        },
        {
          vkey: "K_6",
          modifiers: [],
          mechanism: "deadkey",
          priorSource: "unicode-decomp",
          priorCount: 0,
          confidence: 0.28,
        },
      ],
    },
    {
      codepoint: "U+00E9",
      candidates: [
        {
          vkey: "K_E",
          modifiers: ["SHIFT", "RALT"],
          mechanism: "direct",
          priorSource: "corpus",
          priorCount: 4,
          confidence: 0.85,
        },
      ],
    },
  ],
});
