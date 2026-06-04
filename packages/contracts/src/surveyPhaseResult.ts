// see spec.md section 8 - data flow (Phases A..G; "C-prime" is the reorder phase)

import type { DiscoveryAxisVector } from "./axes";

/**
 * Survey phase identifiers per spec §8.
 *
 * The literal `"C-prime"` is the ASCII-safe programmatic form of the spec's
 * `C'` notation (apostrophe; pronounced "C prime"). User-facing UI labels
 * should render this as `C'` to match the spec. The string-literal form
 * exists so grep and TS string narrowing don't have to deal with the
 * apostrophe character.
 *
 * @see spec.md §8 (data flow — Phases A..G with C-prime reorder)
 */
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
