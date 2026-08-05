/**
 * Local aggregate types for the placement post-pass.
 *
 * These are internal to the placement module — they do NOT extend the locked
 * Pattern / Criterion contracts (spec §18, D-INT-1). The PlacementCandidate
 * type they reference is the contract export from @keyboard-studio/contracts.
 *
 * @see spec.md §7.6 (corpus-derived placement priors)
 */

import type { PlacementCandidate, TouchPlacementEntry } from "@keyboard-studio/contracts";

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
 * **Versioning (placement-priors v2):** `version` is semver-style
 * (`"2.0.0"` as of v2). The MAJOR component is a breaking-shape marker —
 * `corpus-loader.ts`'s `corpusPriorsToPlacementMap` fails closed (throws) on
 * a major-version mismatch rather than silently misreading a shape it does
 * not understand. v2 added `deadkeySkipReasons` and `touch`; both are
 * optional/additive, so a v1 (`"1.0.0"`) snapshot is a DIFFERENT major and is
 * rejected, not merely "missing the new optional fields".
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
  /**
   * Corpus-wide counted reasons the v2 deadkey/store-index extraction pass
   * discarded a rule (see `deadkey.ts`'s `DEADKEY_SKIP_REASONS`) — e.g.
   * `{ "multi-deadkey-context": 3, "any-over-non-char-store": 15 }`. Mirrors
   * the codec's `opaqueFeatures` counting. Optional — absent from a v1
   * snapshot or when no deadkey rule was discarded.
   */
  deadkeySkipReasons?: Record<string, number>;
  /**
   * Corpus-mined touch (longpress) placement priors (placement-priors v2) —
   * see `TouchPlacementEntry`. Optional — absent from a v1 snapshot or when
   * no corpus keyboard's `.keyman-touch-layout` yielded a longpress host.
   */
  touch?: TouchPlacementEntry[];
}
