// orth.display-difficulty derivation (spec 041 P3, FR-030/031).
//
// Pure per-script function: how well common fonts/rendering stacks are likely to
// support a target script's characters. This feeds the content/facets/ INPUT
// facet content/facets/orth/display-difficulty.yaml (a per-script session input),
// NOT a per-keyboard keyboard-facet — it does not flow through DEFAULT_CLASSIFIERS
// or facet-index-lint; it is validated by `pnpm run facet-lint`.
//
// Primary signal — the script's first-assigned Unicode version (block age) from
// the pinned UCD data (utilities/facet-index/ucd/generated/, derived from
// DerivedAge.txt ⋈ Scripts.txt). Older/mainstream blocks are broadly supported;
// recently-assigned ones cannot assume a mainstream font exists. The two era
// boundaries are ALSO recorded as derivation params in the facet YAML (FR-031),
// so the YAML and this module stay a single source of the same numbers.
//
// Override — `puaObserved` (any corpus PUA usage attributed to the script, at
// script-level granularity per the clarification) forces poorly-supported: heavy
// PUA reliance signals no mainstream rendering even for a long-assigned block.

import { firstVersionOfScript } from "./ucd/generated/scriptLookup.js";

export type DisplayDifficulty = "well-supported" | "partially-supported" | "poorly-supported";

/**
 * Era boundaries (Unicode MAJOR version) that split first-assigned block age
 * into the three support tiers. Mirrored as derivation params in
 * content/facets/orth/display-difficulty.yaml (FR-031):
 *   well-supported      first assigned ≤ Unicode 5.x   (major < 6)
 *   partially-supported first assigned 6.0 – 10.0      (6 ≤ major < 11)
 *   poorly-supported    first assigned ≥ Unicode 11.0  (major ≥ 11)
 */
export const DISPLAY_DIFFICULTY_ERA_BOUNDARIES = {
  /** First MAJOR version that is no longer "well-supported". */
  partiallyFromMajor: 6,
  /** First MAJOR version that is "poorly-supported". */
  poorlyFromMajor: 11,
} as const;

/**
 * Display-support difficulty for a target script (ISO-15924 short code, e.g.
 * "Latn", "Adlm"). `puaObserved` overrides block age to poorly-supported.
 * An unknown script (no assigned codepoints in the pinned UCD) falls back to the
 * conservative middle tier rather than over- or under-claiming support.
 */
export function displayDifficultyOfScript(
  script: string,
  { puaObserved }: { puaObserved: boolean },
): DisplayDifficulty {
  if (puaObserved) return "poorly-supported";

  const version = firstVersionOfScript(script);
  if (!version) return "partially-supported";

  const major = version[0];
  if (major >= DISPLAY_DIFFICULTY_ERA_BOUNDARIES.poorlyFromMajor) return "poorly-supported";
  if (major >= DISPLAY_DIFFICULTY_ERA_BOUNDARIES.partiallyFromMajor) return "partially-supported";
  return "well-supported";
}
