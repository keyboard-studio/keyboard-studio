/**
 * Local aggregate types for the placement post-pass.
 *
 * These are internal to the placement module — they do NOT extend the locked
 * Pattern / Criterion contracts (spec §18, D-INT-1). The PlacementCandidate
 * type they reference is the contract export from @keyboard-studio/contracts.
 *
 * @see spec.md §7.6 (corpus-derived placement priors)
 */

import type { PlacementCandidate } from "@keyboard-studio/contracts";

/**
 * Per-keyboard summary produced by emitPlacementMap and then fed to
 * aggregatePlacements.  Lives in this module only — never serialised to
 * contracts or exposed to the SPA.
 */
export interface KeyboardPlacementReport {
  keyboardId: string;
  bcp47: string[];
  baseLayoutFamily: "QWERTY" | "AZERTY" | "QWERTZ" | "other";
  /** key = 4-char hex codepoint (e.g. "0253"), value = candidates for that codepoint. */
  candidatesByCodepoint: Map<string, PlacementCandidate[]>;
  /** SHA-256 fingerprint of the (codepoint → vkey+modifiers) map.
   *  Used for fork-collapse: keyboards that produce an identical
   *  (codepoint → vkey+modifiers) placement map are treated as one vote
   *  (exact SHA-256 fingerprint match). */
  placementFingerprint: string;
}

/**
 * Aggregated multi-keyboard entry for one target codepoint.
 * Produced by aggregatePlacements; one entry per unique codepoint across the
 * surviving (fork-collapsed) corpus.
 */
export interface AggregatedEntry {
  /** 4-char uppercase hex, e.g. "0253" (no "U+" prefix — matches JSON key). */
  codepoint: string;
  placements: PlacementCandidate[];
  bcp47Context: string[];
  baseLayoutFamily: string;
}

/**
 * Top-level structure of the emitted placement-priors.json file.
 *
 * @see spec.md §7.6
 */
export interface PlacementPriorsJSON {
  version: string;
  /** Provenance string, e.g. "keymanapp/keyboards@<sha>". */
  generatedFrom: string;
  priorCount: number;
  /** Map from 4-char hex codepoint (e.g. "0253") to AggregatedEntry. */
  entries: Record<string, AggregatedEntry>;
}
