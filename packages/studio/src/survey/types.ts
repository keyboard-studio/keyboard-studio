// TypeScript interfaces for the Phase YAML survey flow format.
// These describe the static definition shape parsed from content/flows/*.yaml —
// distinct from the runtime SurveyAnswer/SurveyPhaseResult types in @keyboard-studio/contracts.

import type { IRPath, KeyboardIR } from "@keyboard-studio/contracts";

/**
 * The two authoring tracks (spec §8 v1.3.0).
 *
 * Canonical location: was declared in survey/index.ts (post spec-029 barrel
 * convergence, after phaseWrappers.tsx/PhaseTrack.tsx were deleted) so that
 * stores/surveySessionStore.ts's type-only import kept resolving. Moved here
 * (a leaf types module with no runtime imports of its own) so
 * surveySessionStore.ts can import it WITHOUT going through survey/index.ts —
 * that barrel re-exports PhaseB.tsx at runtime, and PhaseB.tsx now imports
 * surveySessionStore.ts at runtime too (the Phase B character-map pane work),
 * which would otherwise close a runtime dependency cycle. index.ts re-exports
 * this type for existing external consumers.
 */
export type Track = "copy" | "adapt";

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
  /**
   * Optional short noun-phrase override for this question's decision-trail
   * headline (spec 055 FR-009, catalog-audit-label.contract.md). Authored
   * only where `prompt` reads badly as a headline; sparse by design.
   */
  audit_label?: string;
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

// ---------------------------------------------------------------------------
// Output reach (spec 057 FR-016, contracts/question-output-reach.md)
// ---------------------------------------------------------------------------

/**
 * An emitted artifact a question's answer reaches.
 *
 * One member today. The point of the type is that the set is CLOSED and named:
 * a question cannot declare it reaches "the package" in prose that no check can
 * read.
 */
export type OutputTargetId = "package-descriptor";

/**
 * An identity-overlay field the answer feeds. Names match `IdentityOverlay`'s
 * own fields (`lib/projectWorkingCopyVfs.ts`) so the counterfactual can vary the
 * declared field directly rather than translating between two vocabularies.
 */
export type IdentityOverlayField = "displayName" | "bcp47" | "languageName";

/** One output artifact + field a question's answer reaches. */
export interface OutputWrite {
  target: OutputTargetId;
  field: IdentityOverlayField;
}

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
   * Output artifacts this question's answer reaches, if any (spec 057 FR-016).
   *
   * DIFFERENT ADDRESS SPACE from `writes`. `writes` is `IRPath[]` over
   * `KeyboardIR` and governs `mutate()` containment; `outputs` names emitted
   * ARTIFACTS. A question may legitimately declare `writes: []` and a non-empty
   * `outputs` — an identity answer writes no IR and still ships in the `.kps`.
   * That combination was previously inexpressible, which is why a question could
   * promise the author their answer went on the finished keyboard while nothing
   * in the repository could check the claim.
   *
   * Absent is permitted (most questions reach no output artifact directly); an
   * explicit `[]` states it deliberately. `questions/outputReach.test.ts`
   * validates every declared entry against the writer's own consumed-field table.
   */
  outputs?: readonly OutputWrite[];

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
