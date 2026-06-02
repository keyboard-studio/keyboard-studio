// see spec.md section 11 - criteria.md compliance; section 14 decision 4 (four bands)

export type CriteriaBand =
  | "scaffolder-bake" // band 1: enforced at scaffold time, never user-visible
  | "layer-c-enforce" // band 2: lint engine blocks on violation
  | "yellow-survey" // band 3: surfaced as a plain-language question
  | "red-checklist"; // band 4: manual pre-submit checklist

export interface Criterion {
  /** Stable ID from criteria.md (e.g. "SS12"). */
  id: string;
  /** criteria.md section heading the rule lives under. */
  section: string;
  band: CriteriaBand;
  description: string;
  /** Optional automation hooks per band. */
  scaffolderRule?: string;
  lintRuleId?: string;
  surveyQuestionId?: string;
  preSubmitChecklistText?: string;
}
