// see spec.md section 8 - data flow (Phases A..G; "C-prime" is the reorder phase)

import type { DiscoveryAxisVector } from "./axes";

export type SurveyPhase = "A" | "B" | "C" | "C-prime" | "D" | "E" | "F" | "G";

export interface SurveyAnswer {
  questionId: string;
  value: string;
}

export interface SurveyPhaseResult {
  phase: SurveyPhase;
  answers: SurveyAnswer[];
  /** Axes resolved at this phase; merged across phases to build the full vector. */
  computedAxes?: Partial<DiscoveryAxisVector>;
  /** Pattern IDs selected from the gallery during this phase. */
  selectedPatternIds?: string[];
}
