// see spec.md section 11 - criteria.md compliance; section 14 decision 4 (four bands)

export type CriteriaBand =
  | "scaffolder-bake" // band 1: enforced at scaffold time, never user-visible
  | "layer-c-enforce" // band 2: lint engine blocks on violation
  | "yellow-survey" // band 3: surfaced as a plain-language question
  | "red-checklist"; // band 4: manual pre-submit checklist

/**
 * The six DISCUS keyboard-design principles (Durdin, EMDC Online 2023) —
 * Discoverability, Intuition, Simplicity, Consistency, Usability, Standards.
 * The two distinct "S" principles disambiguate to `"simplicity"` and
 * `"standards"`.
 *
 * Carried as the optional `principle` tag on a {@link Criterion} so the
 * section-18 ("Design heuristics (DISCUS)") rows can record which design
 * principle they operationalize. Pre-existing repo-hygiene criteria leave it
 * unset.
 *
 * @see docs/discus-principles-integration.md
 * @see docs/keyboard-design-principles.md
 */
export type DiscusPrinciple =
  | "discoverability"
  | "intuition"
  | "simplicity"
  | "consistency"
  | "usability"
  | "standards";

/**
 * Fields every band shares.
 */
interface BaseCriterion {
  /** Stable ID derived from the criteria.md section number and rule slug (e.g. "1.1-no-files-outside-keyboard-folder"). */
  id: string;
  /** criteria.md section heading the rule lives under. */
  section: string;
  description: string;
  /**
   * The DISCUS design principle this criterion operationalizes, if any.
   * Populated for the section-18 design-heuristics rows; absent on the
   * mechanical repo-hygiene criteria that predate the framework.
   *
   * @see docs/discus-principles-integration.md
   */
  principle?: DiscusPrinciple;
}

/**
 * Band 1 — enforced by the scaffolder at template-fill time; never
 * user-visible. The `scaffolderRule` field is the canonical hook;
 * other-band hooks (lintRuleId, surveyQuestionId, preSubmitChecklistText)
 * are NOT permitted on this variant.
 */
export interface ScaffolderBakeCriterion extends BaseCriterion {
  band: "scaffolder-bake";
  /** Rule identifier the scaffolder applies (e.g. "strip-ncaps", "set-version-1-0"). */
  scaffolderRule?: string;
}

/**
 * Band 2 — Layer C lint engine blocks on violation per edit / at submit.
 * The `lintRuleId` field is the canonical hook.
 */
export interface LayerCEnforceCriterion extends BaseCriterion {
  band: "layer-c-enforce";
  /** Lint-rule identifier the Layer C engine checks (e.g. "KM_LINT_MISSING_LICENSE"). */
  lintRuleId?: string;
}

/**
 * Band 3 — surfaced as a plain-language survey question at the relevant
 * phase. The `surveyQuestionId` field is the canonical hook.
 */
export interface YellowSurveyCriterion extends BaseCriterion {
  band: "yellow-survey";
  /** PatternQuestion id (or survey-flow question id) the criterion maps to. */
  surveyQuestionId?: string;
}

/**
 * Band 4 — manual pre-submit checklist; user must check off before PR
 * submission. The `preSubmitChecklistText` field is the canonical hook.
 */
export interface RedChecklistCriterion extends BaseCriterion {
  band: "red-checklist";
  /** Text rendered to the user on the pre-submit checklist. */
  preSubmitChecklistText?: string;
}

/**
 * Discriminated union over `band`. Each variant carries only the
 * automation-hook field meaningful for its band — assigning the wrong
 * field for a band (e.g. `{ band: "scaffolder-bake", lintRuleId: "x" }`)
 * is now a TS type error.
 *
 * Hooks remain optional today so the existing `criteria.json` (no hooks
 * populated yet) still validates; the type-narrowed shape exists to
 * catch wrong-field assignments going forward and to force the per-band
 * hook to be the only legal field for that band when content team
 * populates them per #70.
 *
 * @see spec.md §11 / §14 D4
 * @see #103 (this type narrowing)
 * @see #70 (content-side population of the hooks)
 */
export type Criterion =
  | ScaffolderBakeCriterion
  | LayerCEnforceCriterion
  | YellowSurveyCriterion
  | RedChecklistCriterion;
