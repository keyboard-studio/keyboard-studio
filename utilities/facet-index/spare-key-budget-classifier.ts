/**
 * Spare-key-budget classifier (spec 043 US2, T031) — rule-structure archetype.
 *
 * Axis A7 (how much room the base has to place more characters): value ∈
 * {many, ralt-only, fully-booked} (FR-022, data-model). Read from how saturated
 * the base's SHIFT and AltGr (RALT) planes are over the stock physical key set.
 *
 * The base (unshifted) plane is the always-occupied primary layer on desktop —
 * every physical char key either produces directly or falls through to the OS
 * layout — so it carries no spare budget and is excluded. The spare budget lives
 * in the SHIFT and AltGr planes. Reserved system combos (Ctrl/Alt chords that are
 * not AltGr) are excluded — they are not available placement slots (FR-022).
 *
 * Over the stock `kbdus` physical char keys (N ≈ 47, the pinned base-layout
 * table), we count the distinct keys the base's rules BIND in each plane:
 *   - `many`         — the SHIFT plane is less than half bound: lots of primary
 *                      spare room, regardless of AltGr.
 *   - `ralt-only`    — SHIFT is at least half bound but the AltGr plane is not:
 *                      the remaining budget is the AltGr plane.
 *   - `fully-booked` — both SHIFT and AltGr planes are at least half bound: little
 *                      room left anywhere.
 * Half-of-N is the deterministic saturation boundary (auditable, tunable), the
 * same style of contiguous banding `added-char-count` uses for axis A1.
 *
 * **Spec 052 (FR-016): this classifier is now a thin DELEGATE.** The measurement
 * itself was promoted verbatim to `packages/contracts/src/keyBudget.ts` as the
 * single authoritative key-budget determination, so the marks station and this
 * index cannot report different answers for the same base (SC-008). Everything
 * below the delegation is unchanged: the `Categorization` wrapper still owns
 * confidence, provenance tier, analysed coverage, and the honest `undetermined`
 * fallback, so the shipped `docs/keyboard-facet-index.json` values do not move.
 */

import type { KeyboardIR, KeyBudgetBand } from "@keyboard-studio/contracts";
import { measureKeyBudget } from "@keyboard-studio/contracts";

import { undeterminedFallback } from "./measurement.js";
import { computeAnalyzedCoverage } from "./outcome.js";
import type { Categorization, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

/**
 * The facet's value domain. Structurally identical to the canonical
 * `KeyBudgetBand` — aliased rather than redeclared so the two cannot drift.
 */
export type SpareKeyBudget = KeyBudgetBand;

/**
 * Content-derived spare-key budget, or null when the base binds no physical key
 * at all (empty/opaque-only) so the caller falls through to the fallback. Never
 * throws.
 *
 * Delegates the measurement to `measureKeyBudget`; this function's remaining job
 * is the `Categorization` wrapper the facet index expects.
 */
export function classifySpareKeyBudget(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  void def; // every emitted value is one of the three members, within limits by construction.

  const budget = measureKeyBudget(ir);
  if (budget === null) return null; // no pinned key set, or no physical-key rules.

  return {
    value: budget.band,
    confidence: null,
    confidenceClass: "confident",
    provenanceTier: "content-derived",
    // Distinct keys bound in the two measured planes — the evidence behind the
    // band, read off the canonical measurement's own plane counts (unchanged
    // from what this classifier reported before the measurement moved).
    evidenceSize: budget.planes.shiftBound + budget.planes.altgrBound,
    analyzedCoverage: computeAnalyzedCoverage(ir),
    analysisOutcome: ir.raw.length > 0 ? "partially" : "fully",
    consistency: 1, // a single keyboard-level budget determination
    notes: budget.notes,
  };
}

/**
 * Fallback: the base binds no physical key (empty/opaque-only) or `parse()`
 * threw. No declared-metadata source names a spare-key budget, so this is an
 * honest `undetermined`.
 */
export function spareKeyBudgetFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void kb;
  void def;
  return undeterminedFallback("no physical-key rules (empty/opaque-only or parse failure); spare-key budget undetermined");
}
