import type { PlacementMap, PlacementEntry } from "@keyboard-studio/contracts";
import type { PlacementPriorsJSON } from "./model.js";

/**
 * Minimum number of independent keyboards that must agree on a placement
 * before it is eligible to appear as a gallery suggestion.
 * A single-keyboard signal is noise; require at least 2.
 */
const MIN_PRIOR_COUNT = 2;

/**
 * Only standard physical keys (K_A–K_Z, K_0–K_9, punctuation K_*) are
 * meaningful suggestions in the gallery key-picker.  Touch-layout virtual
 * keys (T_*) and other non-K_* names are custom to specific keyboards and
 * cannot be shown as actionable suggestions.
 */
function isStandardKey(vkey: string): boolean {
  return vkey.startsWith("K_");
}

/**
 * NCAPS (NumLock-equivalent modifier) is idiomatic in Myanmar/Ethiopic
 * keyboards but is not a modifier a Latin-script keyboard author would use.
 * Exclude any candidate that requires NCAPS to be in any modifier position.
 */
function hasNcapsModifier(modifiers: string[]): boolean {
  return modifiers.includes("NCAPS");
}

/**
 * Convert a PlacementPriorsJSON (corpus-extracted, keyed by 4-char hex)
 * into the PlacementMap shape that MechanismGallery accepts.
 *
 * Confidence renormalization: renormalize per-codepoint so confidence =
 * priorCount / totalCount (fraction of keyboards that chose this placement
 * for this character). The gallery's suggestion threshold (> 0.5, strictly)
 * fires only when one placement has a strict majority of corpus votes.
 *
 * Candidates with priorCount < MIN_PRIOR_COUNT are stripped before
 * renormalization so single-keyboard outliers cannot win by tie-breaking.
 *
 * @see spec.md §7.6 (corpus-derived placement priors)
 * @see packages/contracts/src/placementMap.ts (PlacementMap shape)
 */
export function corpusPriorsToPlacementMap(priors: PlacementPriorsJSON): PlacementMap {
  const entries: PlacementEntry[] = [];

  for (const [hexKey, entry] of Object.entries(priors.entries)) {
    if (entry.placements.length === 0) continue;

    // Drop ASCII (U+0000–U+007F): those characters are already on the keyboard
    // and do not need placement suggestions.
    const cp = parseInt(hexKey, 16);
    if (cp <= 0x007f) continue;

    // Drop single-keyboard outliers, non-physical keys, and NCAPS candidates.
    const qualified = entry.placements.filter(
      (c) =>
        c.priorCount >= MIN_PRIOR_COUNT &&
        isStandardKey(c.vkey) &&
        !hasNcapsModifier(c.modifiers),
    );
    if (qualified.length === 0) continue;

    // Sort by priorCount descending.
    const sorted = [...qualified].sort((a, b) => b.priorCount - a.priorCount);
    const totalCount = sorted.reduce((sum, c) => sum + c.priorCount, 0);

    // Per-codepoint renormalization: confidence = priorCount / totalCount.
    // A strict majority (> 0.5) is required by the gallery threshold, so a
    // suggestion fires only when one placement has more corpus votes than all
    // others combined.
    const renormalized = sorted.map((c) => ({
      ...c,
      confidence: totalCount > 0 ? c.priorCount / totalCount : 0,
    }));

    entries.push({
      codepoint: `U+${hexKey.toUpperCase().padStart(4, "0")}`,
      candidates: renormalized,
    });
  }

  return {
    entries,
    pinnedPriorsVersion: priors.version,
  };
}
