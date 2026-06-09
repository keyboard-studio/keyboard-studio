// see spec.md section 8 - data flow (Phases A..G; "C-prime" is the reorder phase)

import type { AnswerType } from "./pattern";
import type { DiscoveryAxisVector } from "./axes";
import type { KeyboardIdentity } from "./keyboardIdentity";

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

// Maps each AnswerType to its runtime value shape. SurveyAnswer is derived by
// iterating over AnswerType so new members added to AnswerType automatically
// appear in SurveyAnswer. A missing AnswerValueMap entry produces value: never,
// making that variant impossible to construct and flagging the omission.
type AnswerValueMap = {
  "char-list": string[];
  "char-single": string;
  "key-name": string;
  "store-content": string;
  "boolean": boolean;
  "select": string;
  "text": string;
};

/** Discriminated union of all survey answer shapes keyed by {@link AnswerType}. Narrow on `answerType` to access the correctly-typed `value`. @see spec.md §8 */
export type SurveyAnswer = {
  [K in AnswerType]: {
    questionId: string;
    answerType: K;
    value: K extends keyof AnswerValueMap ? AnswerValueMap[K] : never;
  };
}[AnswerType];

export interface SurveyPhaseResult {
  phase: SurveyPhase;
  answers: SurveyAnswer[];
  /** Typed identity fields resolved from Phase A; undefined for phases B..G. */
  identity?: KeyboardIdentity;
  /** Axes resolved at this phase; merged across phases to build the full vector. */
  computedAxes?: Partial<DiscoveryAxisVector>;
  /** Pattern IDs selected from the gallery during this phase. */
  selectedPatternIds?: string[];
}
