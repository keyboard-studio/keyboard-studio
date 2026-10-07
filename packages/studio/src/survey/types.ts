// TypeScript interfaces for the survey flow shape.
// These describe the static question-module definition shape (survey/questions/**) —
// distinct from the runtime SurveyAnswer/SurveyPhaseResult types in @keyboard-studio/contracts.

import type {
  Attribution,
  DecisionProposalSource,
  HelpDocsAnswers,
  HistoryEntryState,
  IRPath,
  KeyboardIR,
} from "@keyboard-studio/contracts";
import type { DecisionId, DecisionRendererProps, DecisionSet } from "../decisions/decisionTypes.ts";
import type { ExtractContext } from "../decisions/extractContext.ts";
import type { IdentityPatch } from "../stores/workingCopyStore.ts";

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
  /** Documented loop-back to an earlier question; ignored by order derivation. */
  loopBack?: true;
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
  /**
   * Structural shape the answer must match, beyond required/non-blank.
   * Only "email" exists today (a basic `local@domain.tld` check) — SurveyRunner's
   * canAdvance applies it when non-blank; blank still passes for an optional
   * field. Declarative rather than a validate() function so it survives
   * a derived FlowDef's definition-only questions (validate() does not).
   */
  format?: "email";
  options?: FlowOption[];
  /** Reference to a dynamic options source (e.g. "@langtags_iso639"). Not resolved in v1. */
  options_source?: string;
  next?: string | null | FlowGotoRule[];
  /** When true, this node is engine-resolved and never rendered to the user. */
  engine_resolved?: boolean;
  /** Advisory (non-gating) question; runners may render it softer. Used by RTL questions. */
  advisory?: boolean;
}

/** A flow as derived from its question modules (survey/loadDerivedFlow.ts). */
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
  /**
   * The value the entry was pre-filled with, when a caller seed supplied one
   * (a debug pin is not a proposal). Kept alongside `value` so the saved answer
   * can say whether the author kept the default or overturned it.
   */
  proposal?: SeedProposal;
}

/** A caller seed and, when known, where it came from. */
export interface SeedProposal {
  value: string | string[];
  source?: DecisionProposalSource;
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
// Output reach (spec 059 FR-016, contracts/question-output-reach.md)
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
export type IdentityOverlayField = "displayName" | "bcp47" | "languageName" | "websiteUrl";

/** One output artifact + field a question's answer reaches. */
export interface OutputWrite {
  target: OutputTargetId;
  field: IdentityOverlayField;
}

/**
 * Context passed to a module's `apply()` (spec 089, contracts/apply-contract.md).
 *
 * Everything an apply may read, and nothing it may write directly: the
 * working copy's current IR (null before instantiation), the module's own
 * declared `writes` containment set, the FULL decision set as recorded
 * before this completion's applies run (the completion's own records
 * included — recording precedes applying, contract A6), and the working
 * copy's current HISTORY-entry state (the one channel whose next value is
 * a function of its previous value).
 */
export interface ApplyContext {
  /** Current working-copy IR, or null before instantiation. `apply()` MUST NOT mutate it. */
  readonly ir: KeyboardIR | null;
  /** The module's declared `writes` paths — the only IR locations the patch's `ir` channel may touch. */
  readonly writes: readonly IRPath[];
  /** The recorded decisions, including this completion's (A6: record, then apply). */
  readonly decisions: DecisionSet;
  /** The working copy's current HISTORY-entry state, or null before it is first derived. */
  readonly currentHistoryEntryState: HistoryEntryState | null;
}

/**
 * The multi-channel result of a module's `apply()` (spec 089 FR-001).
 *
 * Every channel is optional; absence means "no write on this channel".
 * Channels are whole-value replaces — the apply builds the complete next
 * slice value from `ctx.decisions` (plus `ctx.currentHistoryEntryState`
 * for the history channel), never a diff. Which channels a module may
 * return is fixed by the authorization table in contracts/apply-contract.md
 * (A3): the runner rejects an unauthorized channel with `ApplyChannelError`
 * and applies nothing.
 */
export interface WorkingCopyPatch {
  /** IR patch, merged under the module's declared `writes` via the checked merge (A4). */
  ir?: Partial<KeyboardIR>;
  /** The working copy's identity slice (whole-value replace). */
  identity?: IdentityPatch;
  /** The working copy's attribution slice (whole-value replace). */
  attribution?: Attribution;
  /** The working copy's help-docs slice (whole-value replace). */
  helpDocs?: HelpDocsAnswers;
  /** The working copy's HISTORY-entry state slice (whole-value replace). */
  historyEntryState?: HistoryEntryState;
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
   * Output artifacts this question's answer reaches, if any (spec 059 FR-016).
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
   * The question module's decision-effect hook (spec 089 FR-001,
   * contracts/apply-contract.md). PURE: computes the completion's effect on
   * the working copy from the recorded decisions and returns it as a
   * {@link WorkingCopyPatch}; MUST NOT mutate `ctx` or perform side effects.
   * The runner (`applyDecisionEffects` in steps/reducer.ts) executes it
   * unconditionally for every answered module that declares it, after the
   * completion's decisions are recorded (A6). Channel authorization is
   * fixed by the contract's table (A3) — returning an unauthorized channel
   * throws `ApplyChannelError` and applies nothing. An empty patch `{}` is
   * valid and writes nothing. Modules whose decisions have no working-copy
   * effect omit `apply` entirely.
   */
  apply?: (value: string | string[] | undefined, ctx: ApplyContext) => WorkingCopyPatch;

  
  /**
   * Which spec unit(s) govern this question module (spec 031 FR-002). Same
   * vocabulary and shape as Step.specRef (steps/types.ts): `§N` / `§Na` or
   * `specs/<slug>`, each resolvable against docs/spec-trace.json. Optional —
   * unlike the manifest requirement, question modules may omit it.
   */
  specRef?: string | readonly string[];

  // -------------------------------------------------------------------------
  // Decision-spike seam (km/decisions-spike). All optional: absent = no
  // decision wiring, so every existing module and the contract suite compile
  // unchanged.
  // -------------------------------------------------------------------------

  /**
   * The typed decisions this module provides once answered. `orderDecisions()`
   * derives the walk order from `provides`/`requires` instead of
   * hand-maintained YAML lists and spine flags. One module may provide
   * several decisions (spec 087 Q4); the duplicate-provider rule applies
   * per decision, not per module.
   */
  provides?: DecisionId[];

  /** Decisions that must be resolved before this module can run. */
  requires?: readonly DecisionId[];

  /**
   * Base-keyboard probe: read this module's decisions from the import bundle
   * (spec 087 Q1) instead of asking the author. Return `undefined` when the
   * bundle carries no evidence for the decision. The result runs through
   * `validate()` before acceptance — a rejected extract falls through to
   * asked/default.
   */
  extract?: (ctx: ExtractContext) => unknown;

  /**
   * Custom renderer for bulk decisions (e.g. a character-inventory picker).
   * Absent (or "default") = the standard question field; a component dissolves
   * a large editor panel into the same module registry. Size lives in the
   * renderer, not the module system.
   *
   * Typed as DecisionRendererProps<any>: modules in one registry carry
   * different answer types T, so the field is heterogeneous by design — the
   * same pattern as EditorStepProps in steps/types.ts. Each component
   * declares its own T (e.g. DecisionRendererProps<string[]>).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderer?: "default" | React.ComponentType<DecisionRendererProps<any>>;

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
