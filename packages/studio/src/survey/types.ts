// TypeScript interfaces for the Phase YAML survey flow format.
// These describe the static definition shape parsed from content/flows/*.yaml —
// distinct from the runtime SurveyAnswer/SurveyPhaseResult types in @keyboard-studio/contracts.

/** Rendering-level question type as declared in the YAML flow. */
export type FlowQuestionType =
  | "text"
  | "short_text"
  | "autocomplete"
  | "select"
  | "radio"
  | "bool"
  | "multi_select"
  | "notice";

/** A single option within a select/radio/multi_select question. */
export interface FlowOption {
  value: string;
  label: string;
  note?: string;
}

/**
 * A conditional routing rule: if `condition` evaluates truthy against the
 * current answer, navigate to `goto`. The sentinel `default` key is used for
 * the fallthrough branch.
 */
export interface FlowGotoRule {
  condition?: string;
  goto: string | null;
  default?: true;
}

/**
 * A single question node inside a FlowDef.
 * The `next` field is either a plain string id, null (terminal), or an
 * ordered list of conditional goto rules (evaluated top-to-bottom; first
 * matching condition wins).
 */
export interface FlowQuestion {
  id: string;
  type: FlowQuestionType;
  prompt?: string;
  label?: string;
  body?: string;
  help_text?: string;
  required?: boolean;
  options?: FlowOption[];
  /** Reference to a dynamic options source (e.g. "@langtags_iso639"). Not resolved in v1. */
  options_source?: string;
  next?: string | null | FlowGotoRule[];
  /** When true, this node is engine-resolved and never rendered to the user. */
  engine_resolved?: boolean;
  /** Advisory (non-gating) question; runners may render it softer. Used by RTL questions. */
  advisory?: boolean;
}

/** Top-level shape of a parsed phase_*.yaml file. */
export interface FlowDef {
  flow_id: string;
  phase: string;
  questions: FlowQuestion[];
  /** Supplemental question list present in Phase A for provenance data. */
  provenance_questions?: FlowQuestion[];
}

/**
 * Runtime context passed into SurveyRunner. Accumulates key answers from
 * prior phases so `{{language_name}}`, `{{detected_group}}`, and
 * `{{script_family}}` interpolations work.
 */
export interface SurveyContext {
  language_name?: string;
  detected_group?: string;
  script_family?: string;
  routing_group?: string;
  [key: string]: string | undefined;
}

/**
 * One entry in the SurveyRunner's back-navigation answer stack.
 * Stores the question id that was active AND the answer (if any) so that
 * Back can restore both the position and prior value.
 */
export interface AnswerStackEntry {
  questionId: string;
  value: string | string[] | undefined;
}

/**
 * Result of a per-question validate() call.
 * ok:true — value passes; ok:false — code is the stable machine-readable
 * identifier (e.g. "required", "too_long", "invalid_bcp47") asserted by tests;
 * message is the human-readable form surfaced in the editor gutter.
 */
export type ValidationResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

/**
 * Per-question module shape (see packages/studio/src/survey/questions/).
 *
 * Each question module exports:
 *   - definition  : the FlowQuestion node (id, type, prompt, next, …)
 *   - validate    : optional client-side validator (called in the 300 ms cycle)
 *   - mutate      : optional IR mutation hook — stub comment only for now;
 *                   KeyboardIR mutation surface is not yet a real contract.
 *   - fixtures    : test vectors consumed by colocated vitest specs
 */
export interface QuestionModule {
  /** The static FlowQuestion definition, including routing in definition.next. */
  definition: FlowQuestion;

  /**
   * Optional synchronous validator.
   * Runs on the UI thread within the 300 ms debounce cycle.
   * Must complete in <5 ms to stay inside budget.
   */
  validate?: (value: string | string[] | undefined) => ValidationResult;

  /**
   * Optional IR mutation hook.
   * STUB: KeyboardIR mutation surface is not yet a real API.
   * Signature reserved for fan-out cycle. Do not call.
   */
  // mutate?: (value, ctx) => Partial<KeyboardIR>;
  // Eventual consumer: SurveyAnswer in packages/contracts/src/surveyPhaseResult.ts
  // → KeyboardIR mutation in packages/contracts/src/keyboard-ir.ts
  // Currently surfaceless; do NOT implement until the engine has a real mutation seam.

  /** Test vectors exercised by the colocated vitest spec. */
  fixtures: {
    valid: Array<{ value: string | string[] | undefined; note?: string }>;
    invalid: Array<{
      value: string | string[] | undefined;
      note?: string;
      /** Asserts against ValidationResult.code (stable machine-readable id), not message text. */
      expectedCode?: string;
    }>;
  };
}
