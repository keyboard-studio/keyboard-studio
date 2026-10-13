// Criteria resolver types (spec 084).
//
// The criteria page judges a keyboard against the full catalog in
// @keyboard-studio/contracts. This module is the vocabulary that judgment is
// expressed in: the pure resolver (resolveCriteria.ts) takes a CriteriaInput
// and produces a CriteriaResult, and the views in later phases render exactly
// what they are handed — status, available controls, and lazy evidence are
// all decided here, never in a component.
//
// Evidence is lazy by design (plan D9): a ResolvedRow carries a closure that
// builds its EvidenceModel only when a row is expanded, so mounting the full
// catalog computes nothing beyond statuses and counts.

import type {
  CompileResult,
  Criterion,
  LintFinding,
} from "@keyboard-studio/contracts";

/**
 * Which surface is asking for the judgment. "authored" judges the author's
 * own studio-built keyboard (the record may carry their answers);
 * "foreign" judges an existing keyboard loaded for comparison, where no
 * scaffolder ran and no author record exists.
 */
export type CriteriaMode = "authored" | "foreign";

/** The six statuses a criterion can resolve to (spec 084). */
export type CriterionStatus =
  | "met"
  | "not-met"
  | "not-applicable"
  | "needs-author"
  | "needs-human"
  | "not-yet-checkable";

/** An author's answer to a yellow-survey criterion, recorded on the page. */
export type AttestationAnswer = "yes" | "no" | "not-applicable";

/**
 * The per-project record of author attestations (yellow band) and human
 * confirmations (red band), keyed by criterion id. In authored mode this is
 * the criteria record store's snapshot; in foreign mode it is always
 * EMPTY_CRITERIA_RECORD.
 */
export interface CriteriaRecordInput {
  attestations: Readonly<
    Record<string, { answer: AttestationAnswer; at: string }>
  >;
  confirmations: Readonly<Record<string, { at: string }>>;
}

/** The shared empty record: no attestations, no confirmations. */
export const EMPTY_CRITERIA_RECORD: CriteriaRecordInput = Object.freeze({
  attestations: Object.freeze({}),
  confirmations: Object.freeze({}),
});

/**
 * Package facts the applicability predicates (applicability.ts) read. Each
 * is a fact about the judged keyboard's package, derived by the host from
 * the artifact under judgment — never guessed from absence of data.
 */
export interface CriteriaFacts {
  /** The package bundles a font. */
  fontBundled: boolean;
  /** The keyboard is deprecated. */
  deprecated: boolean;
  /** The package is a partner-organization package. */
  partnerPackage: boolean;
}

/** Everything the pure resolver needs, and nothing it does not. */
export interface CriteriaInput {
  criteria: readonly Criterion[];
  mode: CriteriaMode;
  lintFindings: readonly LintFinding[];
  record: CriteriaRecordInput;
  facts: CriteriaFacts;
  /**
   * Implemented checks whose required input is unavailable for this
   * keyboard, keyed by lintRuleId, with the human name of the missing
   * input as the value (e.g. "the linguist inventory for this keyboard").
   * A check named here resolves Not yet checkable, never Met: a check
   * that did not run is not a check that passed.
   */
  contextMissing?: Readonly<Record<string, string>>;
  /**
   * Lint codes precertified by generation (precertify.ts): settled at
   * generation time from the generator's closed manifest, authored mode
   * only. The authored host supplies PRECERTIFIED_LINT_CODES because
   * the artifact it judges IS the generated output bundle; the foreign
   * host never supplies it, and the resolver ignores it in foreign mode
   * regardless — a foreign keyboard can never claim precertification.
   */
  precertified?: ReadonlySet<string>;
  /**
   * The compile result for the artifact under judgment (Batch 1: the
   * §7.6/§7.21 severity mapping). Absent or null means no compile ran
   * for this artifact — the compile rows then resolve Not yet checkable
   * with that reason, never Met: a compile that did not happen is not a
   * clean compile. Both hosts supply it from their artifact stage
   * (stage.compileResult) once the stage is ready.
   */
  compileResult?: CompileResult | null;
}

/**
 * The evidence behind one row's status, built lazily when the row is
 * expanded. `lines` are plain evidence sentences for the view to render;
 * `lintRuleId` and `findings` are present on layer-c rows so the expanded
 * evidence can name the check that ran (traceability inside evidence only).
 */
export interface EvidenceModel {
  kind:
    | "scaffolder"
    | "precertified"
    | "compile"
    | "lint-pass"
    | "lint-finding"
    | "not-implemented"
    | "context-missing"
    | "foreign-bake"
    | "attested"
    | "needs-author"
    | "confirmed"
    | "needs-human"
    | "not-applicable";
  lines: readonly string[];
  lintRuleId?: string;
  findings?: readonly LintFinding[];
}

/** One catalog row after resolution, in catalog order. */
export interface ResolvedRow {
  criterion: Criterion;
  status: CriterionStatus;
  /** The in-place control this row offers, resolved here — never in a view. */
  controls: "attest" | "confirm" | null;
  /** Lazy evidence: call only when the row's evidence is shown. */
  evidence: () => EvidenceModel;
}

/**
 * The resolver's whole output. `counts` and `bandCounts` are tallied from
 * the emitted rows in the same pass, so a summary header built from them
 * can never disagree with the rows below it.
 */
export interface CriteriaResult {
  rows: readonly ResolvedRow[];
  counts: Record<CriterionStatus, number>;
  bandCounts: Record<Criterion["band"], Record<CriterionStatus, number>>;
  total: number;
  /** Rows with a definite verdict: met + not-met + not-applicable. */
  resolvedCount: number;
}
