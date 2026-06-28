// TypeScript interfaces for the Phase YAML survey flow format.
// These describe the static definition shape parsed from content/flows/*.yaml —
// distinct from the runtime SurveyAnswer/SurveyPhaseResult types in @keyboard-studio/contracts.

import type { IRPath, KeyboardIR } from "@keyboard-studio/contracts";

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
  /** BCP47 target tag derived from the identity-lite step (e.g. "yo-Latn", "ha"). */
  bcp47_tag?: string;
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
 * Context passed to a module's `mutate()` (spec-014, mutate-seam.contract.md).
 *
 * The contract leaves the exact field set to the reducer apply site (gated task
 * T014); kept deliberately minimal here — the read-only current `KeyboardIR`
 * snapshot plus the module's own declared `writes` containment set, which the
 * reducer asserts the returned patch stays within.
 *
 * TODO(P5): extend with whatever the reducer apply path (steps/mutateApply.ts)
 * needs once T014 lands — do NOT over-build the shape ahead of that gate.
 */
export interface MutateContext {
  /** Read-only snapshot of the working-copy IR at apply time. `mutate()` MUST NOT mutate it. */
  readonly ir: KeyboardIR;
  /** The module's declared `writes` paths — the only IR locations the returned patch may touch. */
  readonly writes: readonly IRPath[];
}

/**
 * Per-question module shape (see packages/studio/src/survey/questions/).
 *
 * Each question module exports:
 *   - definition  : the FlowQuestion node (id, type, prompt, next, …)
 *   - validate    : optional client-side validator (called in the 300 ms cycle)
 *   - inputs      : (P2 contract) IR locations this question reads (IRPath[])
 *   - writes      : (P2 contract) IR locations this question will populate (IRPath[])
 *   - mutate      : optional IR mutation hook — stub comment only for now;
 *                   KeyboardIR mutation surface is not yet a real contract.
 *   - fixtures    : test vectors consumed by colocated vitest specs
 *
 * Address-space rule: `inputs` and `writes` are both `IRPath[]` over the same
 * `KeyboardIR` space (clarification Q1, spec §010). A survey-answer dependency
 * is expressed as the IR location that answer ultimately populates — there is no
 * separate answer-key space, so inputs and writes are directly comparable for
 * the orphan-input lint.
 *
 * Coverage rule: every shipped module declares PRESENT `inputs`/`writes`
 * fields; a question that reads/writes nothing MUST declare an explicit empty
 * array (`inputs: []` / `writes: []`). CI fails only on an ABSENT field.
 * The fields are optional on the interface (so library/reserve modules and
 * a revert leave things structurally valid), but the coverage gate enforces
 * presence on all shipped modules.
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
   * IR locations this question READS — declared as static data.
   * Both `inputs` and `writes` address the same `IRPath` space over `KeyboardIR`
   * (one path algebra; no separate answer-key space). Consumed by the P0 dashboard
   * and the orphan-input lint without invoking `mutate()`.
   * Explicit `[]` is required for questions that read nothing (G7 / FR-006).
   */
  inputs?: readonly IRPath[];

  /**
   * IR locations this question will POPULATE — declared now, executed in P5.
   * Declared as static data; no IR-write execution happens here (G8 / FR-005).
   * Explicit `[]` is required for questions that write nothing (G7 / FR-006).
   */
  writes?: readonly IRPath[];

  /**
   * Optional IR mutation hook — the question-module IR write seam (spec-014,
   * mutate-seam.contract.md). RATIFIED SIGNATURE; the implementation in any
   * module and the reducer apply path remain GATED (task T014) — modules keep
   * their stubs and nothing calls this yet.
   *
   * Contract:
   *  - PURE: returns a `Partial<KeyboardIR>` patch; MUST NOT mutate `ctx.ir`
   *    in place or perform side effects (M1/FR-002).
   *  - The reducer applies the patch as a path-scoped DEEP merge restricted to
   *    the module's declared `writes` `IRPath`s; nested siblings under a shared
   *    parent are preserved, not branch-replaced (M2/Q9).
   *  - Writing outside the declared `writes` is a FAIL-FAST whole-patch
   *    rejection in all builds — never a partial apply, never swallowed, IR
   *    left unchanged (M3/Q11/FR-003).
   *  - IDEMPOTENT: applying the same `value` against the same IR twice is
   *    byte-identical to applying it once (M4/FR-004).
   *  - An empty patch `{}` is valid and merges to a no-op (M5); display-only
   *    (empty `writes`) modules leave `mutate` absent (FR-007).
   *
   * Reducer apply path: steps/reducer.ts `applyStepCompletion` →
   * steps/mutateApply.ts — OUT of scope for the contract surface (gated T014).
   */
  mutate?: (value: string | string[] | undefined, ctx: MutateContext) => Partial<KeyboardIR>;

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
