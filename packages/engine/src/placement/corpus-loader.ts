import type { PlacementMap, PlacementEntry } from "@keyboard-studio/contracts";
import type { PlacementPriorsJSON } from "./model.js";

/**
 * Convert a PlacementPriorsJSON (corpus-extracted, keyed by 4-char hex)
 * into the PlacementMap shape that MechanismGallery accepts.
 *
 * Confidence renormalization: the global confidence in PlacementPriorsJSON
 * is normalized to the maximum across all entries (so common letters dominate).
 * For UI purposes, renormalize per-codepoint so the top candidate for each
 * character gets confidence = 1.0, and others are relative to it.
 * This means MechanismGallery's threshold (>= 0.5) fires for any character
 * that has a clear winner (top candidate has > 50% of the priorCount votes
 * for that codepoint).
 *
 * @see spec.md §7.6 (corpus-derived placement priors)
 * @see packages/contracts/src/placementMap.ts (PlacementMap shape)
 */
export function corpusPriorsToPlacementMap(priors: PlacementPriorsJSON): PlacementMap {
  const entries: PlacementEntry[] = [];

  for (const [hexKey, entry] of Object.entries(priors.entries)) {
    if (entry.placements.length === 0) continue;

    // Sort by priorCount descending.
    const sorted = [...entry.placements].sort((a, b) => b.priorCount - a.priorCount);
    const totalCount = sorted.reduce((sum, c) => sum + c.priorCount, 0);

    // Per-codepoint renormalization: confidence = priorCount / totalCount
    // (fraction of keyboards that used this placement for this character).
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
