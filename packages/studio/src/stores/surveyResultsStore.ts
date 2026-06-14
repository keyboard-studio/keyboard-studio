// Survey-results store — persists phase results across the hybrid flow so the
// gallery and §7.2 strategy selector can read survey context + answers, instead
// of discarding them on each phase transition. See spec §8 (data flow) and
// docs/workflow-model.md (the survey-results store is the data bus that connects
// the survey island to the scaffold/output spine).
//
// Mirrors the Zustand pattern in irStore.ts. The merged `session` is derived
// from `irAxes` + `phaseResults` via the contract's mergePhaseResults(), so the
// scoped assignment map (spec §7.7, SurveySession.assignments) and the merged
// axis vector are available to downstream consumers from one place.

import { create } from "zustand";
import {
  mergePhaseResults,
  type MechanismAssignment,
  type SurveyPhaseResult,
  type SurveySession,
  type DiscoveryAxisVector,
} from "@keyboard-studio/contracts";

interface SurveyResultsState {
  /** Phase results captured so far, in completion order (A → B → … → F). */
  phaseResults: SurveyPhaseResult[];
  /**
   * IR-derived axis baseline, set before/at Phase A from the working IR's
   * recognized patterns. `{}` until IR seeding lands (#231/#232); updating it
   * (e.g. after a carve-gallery decision) re-derives the session.
   */
  irAxes: Partial<DiscoveryAxisVector>;
  /** Merged session: `mergePhaseResults(irAxes, phaseResults)`. The single source downstream consumers read. */
  session: SurveySession;
  /**
   * Record a phase's result, then re-merge. Re-running a phase **replaces** its
   * earlier result (keyed by `phase`) rather than appending a duplicate, so the
   * merge's last-wins semantics stay correct on back-navigation + redo.
   */
  recordPhase: (result: SurveyPhaseResult) => void;
  /**
   * Convenience action for the §7.7 mechanism gallery: record a Phase C result
   * carrying the supplied assignments. Assignments are merged last-wins per
   * (modality, scope, target) via mergePhaseResults — prior Phase C assignments
   * are REPLACED (not accumulated) by this call so the gallery's "remove"
   * action works correctly. Call with an empty array to clear all assignments.
   *
   * Character-class scope is supported here (the store is scope-agnostic);
   * the gallery UI currently exposes only keyboard-default and individual.
   */
  recordAssignments: (assignments: MechanismAssignment[]) => void;
  /** Update the IR-derived baseline (carve gallery / recognizer), then re-merge. */
  setIrAxes: (irAxes: Partial<DiscoveryAxisVector>) => void;
  /** Reset to an empty session (start over). */
  reset: () => void;
}

function remerge(
  irAxes: Partial<DiscoveryAxisVector>,
  phaseResults: SurveyPhaseResult[],
): Pick<SurveyResultsState, "phaseResults" | "irAxes" | "session"> {
  return {
    phaseResults,
    irAxes,
    session: mergePhaseResults(irAxes, phaseResults),
  };
}

export const useSurveyResultsStore = create<SurveyResultsState>((set, get) => ({
  ...remerge({}, []),
  recordPhase: (result) => {
    const prev = get().phaseResults;
    const idx = prev.findIndex((p) => p.phase === result.phase);
    const next =
      idx === -1
        ? [...prev, result]
        : prev.map((p, i) => (i === idx ? result : p));
    set(remerge(get().irAxes, next));
  },
  recordAssignments: (assignments) => {
    // Build / replace the Phase C result so the merge's last-wins semantics
    // apply correctly. Any prior Phase C answers / selectedPatternIds are
    // preserved; only the assignments field is replaced.
    const prev = get().phaseResults;
    const existingC = prev.find((p) => p.phase === "C");
    const next: SurveyPhaseResult = {
      phase: "C",
      answers: existingC?.answers ?? [],
      ...(existingC?.selectedPatternIds !== undefined
        ? { selectedPatternIds: existingC.selectedPatternIds }
        : {}),
      assignments,
    };
    const idx = prev.findIndex((p) => p.phase === "C");
    const updated =
      idx === -1 ? [...prev, next] : prev.map((p, i) => (i === idx ? next : p));
    set(remerge(get().irAxes, updated));
  },
  setIrAxes: (irAxes) => set(remerge(irAxes, get().phaseResults)),
  reset: () => set(remerge({}, [])),
}));
