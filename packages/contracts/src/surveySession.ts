// see spec.md §7.1 (three sources of axis vector input) and §7.2 (strategy
// selector consumes the merged vector). Companion to surveyPhaseResult.ts.

import type { DiscoveryAxisVector } from "./axes";
import type { SurveyPhaseResult } from "./surveyPhaseResult";
import type { MechanismAssignment } from "./assignmentMap";
import { mergeAssignments } from "./assignmentMap";

/**
 * Session-level running state across all survey phases.
 *
 * **Working-copy spine (spec §8 v1.3.0).** This session object is the
 * survey-layer view of the session's single persistent working copy — a
 * `KeyboardIR` + `VirtualFS` pair instantiated at keyboard selection and
 * mutated by every subsequent step. Two entry tracks reach the shared spine:
 *
 * - Track 1 (`instantiateFromBase`): copy a base keyboard + reset identity.
 *   Enters the §8 hybrid survey flow.
 * - Track 2 (`instantiateFromExisting`): load an existing keyboard, preserve
 *   identity. Enters via source-picker; skips identity-lite.
 *
 * After instantiation both tracks share this session; all survey/gallery
 * phases mutate the same working copy. The working copy is serialized to
 * `.zip` or fork+PR only at output (spec §12); there are no intermediate
 * disk writes during authoring.
 *
 * NOTE — instantiation-mode / origin field: the field that distinguishes
 * Track 1 from Track 2 on this type (e.g. `instantiationMode: 'new' |
 * 'adapted'`) is intentionally absent in v1.3.0. It will be added as an
 * additive optional field when Phase 2 (explicit instantiation mode) lands
 * in a forthcoming session. Do not add it here without that joint session.
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
 * @see spec.md §7.1 §7.2 §8 §12
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
  /**
   * Merged scoped assignment map across all phases (spec §7.7), last-wins per
   * `modality+scope+target` (see {@link mergeAssignments}). **Additive (issue
   * #368)** — carried alongside `selectedPatternIds`. `[]` until a gallery phase
   * produces assignments. Resolve per-character mechanisms with
   * `effectiveMechanisms` and check coverage (criterion 18.6) with
   * `uncoveredTargets` (assignmentMap.ts).
   */
  assignments: MechanismAssignment[];
  /**
   * Deduped union of all phases' `confirmedInventory` (NFC graphemes the
   * keyboard must produce). Populated by {@link mergePhaseResults} — empties and
   * whitespace-only entries are dropped, first-appearance order is preserved,
   * each entry is NFC-normalised. **Additive** — required on session but always
   * populated via mergePhaseResults; literal SurveySession objects need
   * `confirmedInventory: []`.
   */
  confirmedInventory: string[];
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
  const assignments = mergeAssignments(phaseResults.map((p) => p.assignments));
  // Deduped union across phases: NFC-normalise, drop empties/whitespace, first-appearance order.
  const seen = new Set<string>();
  const confirmedInventory: string[] = [];
  for (const phase of phaseResults) {
    for (const raw of phase.confirmedInventory ?? []) {
      const g = raw.normalize("NFC").trim();
      if (g.length > 0 && !seen.has(g)) {
        seen.add(g);
        confirmedInventory.push(g);
      }
    }
  }
  return {
    axes,
    irAxes: { ...irAxes },
    phaseResults,
    selectedPatternIds,
    assignments,
    confirmedInventory,
  };
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
