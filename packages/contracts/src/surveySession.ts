// see spec.md §7.1 (three sources of axis vector input) and §7.2 (strategy
// selector consumes the merged vector). Companion to surveyPhaseResult.ts.

import type { DiscoveryAxisVector } from "./axes";
import type { SurveyPhaseResult } from "./surveyPhaseResult";

/**
 * Session-level running state across all survey phases.
 *
 * The axis vector is built from three sources (spec §7.1 v1.1.0 amendment):
 * 1. `irAxes` — axes pre-populated from recognized patterns in the working IR,
 *    available before Phase A runs. Updated by carve gallery decisions.
 *    Seeded from `KeyboardIR.recognizedPatterns` (prereq: #231/#232).
 * 2. Phase results via `mergePhaseResults()` — survey confirmations/corrections
 *    layered on top of `irAxes`, last phase wins.
 * 3. Carve gallery decisions via `updateIrAxes()` — deleting IR rules can change
 *    scale/strategy axes; call `updateIrAxes` to recompute (prereq: #234).
 *
 * The merged `axes` field is what the §7.2 decision tree consumes.
 * Pass `session.axes` to `PatternLibraryService.filterFor()` once all required
 * axes are present.
 *
 * @see spec.md §7.1 §7.2
 */
export interface SurveySession {
  /**
   * Running merged axis-vector across all sources.
   * Later survey phases override earlier ones; all survey phases override
   * `irAxes`. `undefined` on a field means that axis has not yet been elicited.
   */
  axes: Partial<DiscoveryAxisVector>;
  /**
   * Axis values pre-populated from recognized patterns in the working IR,
   * before any survey phase runs. Set to `{}` until KeyboardIR (#232) lands.
   * Updated via `updateIrAxes()` when carve gallery decisions change the IR.
   */
  irAxes: Partial<DiscoveryAxisVector>;
  /** Phase results in order of completion. */
  phaseResults: SurveyPhaseResult[];
  /** Pattern IDs selected across all phases (deduplicated). */
  selectedPatternIds: string[];
}

/**
 * Merge an ordered list of phase results over an IR-derived axis baseline.
 *
 * Merge rule: `irAxes` is the baseline; each phase's `computedAxes` spreads
 * on top in phase order (A → B → C → …), with later phases winning on overlap.
 * Sub-axes `clusterSensitivity` (A2a) and `remapPosture` (A7a) are only
 * present when explicitly elicited — `exactOptionalPropertyTypes` enforces
 * that `undefined` is distinct from an absent key.
 *
 * @param irAxes  Axes derived from the working IR (pass `{}` until #232 lands).
 * @param phaseResults  Completed phase results in chronological order.
 */
export function mergePhaseResults(
  irAxes: Partial<DiscoveryAxisVector>,
  phaseResults: SurveyPhaseResult[]
): SurveySession {
  const axes = phaseResults.reduce<Partial<DiscoveryAxisVector>>(
    (acc, phase) => ({ ...acc, ...phase.computedAxes }),
    { ...irAxes }
  );
  const selectedPatternIds = [
    ...new Set(phaseResults.flatMap((p) => p.selectedPatternIds ?? [])),
  ];
  return { axes, irAxes: { ...irAxes }, phaseResults, selectedPatternIds };
}

/**
 * Recompute a session's merged axes after the IR-derived baseline changes.
 *
 * Call this when a carve gallery decision adds or removes patterns from the
 * working IR, potentially changing scale (A1) or strategy axes (A3, A4).
 * Survey phase results are preserved unchanged; only `irAxes` and the
 * re-derived `axes` are updated.
 *
 * @param session    The session to update.
 * @param newIrAxes  Freshly recomputed IR-derived axis baseline.
 */
export function updateIrAxes(
  session: SurveySession,
  newIrAxes: Partial<DiscoveryAxisVector>
): SurveySession {
  return mergePhaseResults(newIrAxes, session.phaseResults);
}
