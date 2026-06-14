// Survey-results store — persists phase results across the hybrid flow so the
// gallery and §7.2 strategy selector can read survey context + answers, instead
// of discarding them on each phase transition. See spec §8 (data flow) and
// docs/workflow-model.md (the survey-results store is the data bus that connects
// the survey island to the scaffold/output spine). refs #334, #369.
//
// Mirrors the Zustand pattern in irStore.ts. The merged `session` is derived
// from `irAxes` + `phaseResults` via the contract's mergePhaseResults(), so the
// scoped assignment map (spec §7.7, SurveySession.assignments) and the merged
// axis vector are available to downstream consumers from one place.

import { create } from "zustand";
import {
  mergePhaseResults,
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
  setIrAxes: (irAxes) => set(remerge(irAxes, get().phaseResults)),
  reset: () => set(remerge({}, [])),
}));
