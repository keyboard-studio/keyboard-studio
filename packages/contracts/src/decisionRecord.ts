// Per-keyboard decision record — the append-only audit of what the author
// decided and what each decision did to the source (specs/053-decision-audit).
//
// Contract: specs/053-decision-audit/contracts/decision-record.contract.md §1.
// Field semantics + validation: specs/053-decision-audit/data-model.md.
//
// Three shape rules are load-bearing and must not be "tidied":
//
//   1. `AnswerType` is IMPORTED from ./pattern, never redeclared. A survey
//      decision's answer type is the same closed set the survey uses; a second
//      copy here would be a fork of a locked contract type (research D-01).
//
//   2. `kind` lives on `payload` as the discriminant, not duplicated onto
//      `DecisionEntry`. An entry cannot then disagree with its own payload.
//
//   3. `SurveyAnswer` in ./surveyPhaseResult is NOT extended. The recorded
//      value keeps that type's per-`answerType` value discipline by DERIVING
//      from it (see `DecisionPayload` below), so the two can never drift, but
//      the locked survey type gains no audit field (research D-03).
//
// Provenance is two independent axes, not one flattened enum: `agency` says
// WHOSE value this is, `source` says where a proposal came from. That split is
// what lets a headline distinguish "Accepted suggested X from langtags" from
// "Chose X" without a substring test (research D-03).
//
// @see specs/053-decision-audit/spec.md — FR-001, FR-003, FR-007, FR-021
// @see specs/032-journey-corpus/spec.md — the event vocabulary this implements

import type { AnswerType } from "./pattern";
import type { SurveyAnswer } from "./surveyPhaseResult";

/**
 * The two kinds of thing that get recorded.
 *
 * Taken unchanged from the specs/032-journey-corpus vocabulary (FR-007): a
 * survey answer is one question resolved; an editor action is a step's worth of
 * direct editing, summarised at the step boundary rather than keystroke by
 * keystroke.
 */
export type DecisionEventKind = "survey-answer" | "editor-action";

/**
 * WHOSE value the recorded value is.
 *
 * `"base-derived"` and `"hand-set"` are reused verbatim from
 * {@link TouchKeyProvenance} in ./keyboard-ir. `"tool-proposed"` replaces that
 * union's `"physical-suggested"` because the latter is specific to physical→
 * touch propagation and would be wrong on a survey answer.
 *
 * `"tool-proposed"` means the stored value IS the tool's proposal, unmodified.
 * An author who overrode a proposal records `"hand-set"` — the proposal is not
 * what shipped, so it is not what the audit claims.
 */
export type DecisionAgency = "base-derived" | "tool-proposed" | "hand-set";

/**
 * WHERE a proposal came from. Independent of {@link DecisionAgency}: a
 * `"hand-set"` value has no source, and two `"tool-proposed"` values can come
 * from different places.
 *
 * The labels are lifted from the specs/002-defaults-engine "Provenance label"
 * entity, so this adds no new naming for the source dimension.
 */
export type DecisionProposalSource =
  | "langtags"
  | "cldr"
  | "corpus"
  | "axis-fill"
  | "base"
  | "identity"
  | "region"
  | "derived-from-axis";

/** Agency plus, for a proposal, where the proposal came from. */
export interface DecisionProvenance {
  agency: DecisionAgency;
  /** Omitted when `agency` is `"hand-set"` — an author's own value has no proposal source. */
  source?: DecisionProposalSource;
}

/**
 * Which editor produced a step's activity.
 *
 * The three literals are the specs/032-journey-corpus FR-002 vocabulary
 * unchanged — `"gallery_edit"` covers the character/carve galleries,
 * `"mechanism_edit"` the physical mechanism assignment, `"touch_edit"` the
 * touch layout.
 */
export type EditorActionType = "gallery_edit" | "mechanism_edit" | "touch_edit";

/**
 * One editor step's activity, aggregated.
 *
 * Counts, not a transcript: a carve that removes three hundred keys is three
 * hundred in `keysRemoved` and at most {@link EDITOR_ACTION_SAMPLE_LIMIT}
 * identifiers in `sample`. `sampleTruncated` says so when it bites, so the
 * bound is never silent (spec Edge Cases).
 *
 * Every count is optional, and absence means "not measured" — never coerce a
 * missing producer to `0` (specs/055-legible-decision-trail FR-005/FR-005a,
 * research D-06). A present `0` means "measured, and unchanged". A consumer
 * must handle the absent case explicitly; that is the point of the type
 * being optional rather than defaulted.
 */
export interface EditorActionSummary {
  keysRemoved?: number;
  keysAdded?: number;
  mechanismsAssigned?: number;
  touchKeysAffected?: number;
  /** Bounded sample of affected identifiers — never the full list. */
  sample: readonly string[];
  /** True when `sample` is shorter than the real affected set. */
  sampleTruncated: boolean;
}

/**
 * One unified-diff hunk over the emitted `.kmn` text.
 *
 * Line numbers are 1-based, as in unified diff. A hunk with `oldLines === 0`
 * (pure insertion) carries `oldStart` as the line number it follows, which is
 * the same convention `diff -u` uses.
 */
export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Unified-diff lines, each prefixed `" "`, `"+"`, or `"-"`. */
  lines: readonly string[];
}

/**
 * Why an isolated change could not be attributed to a decision.
 *
 * A structured code, not a sentence: the studio renders it as localized prose,
 * so FR-016 holds even though the engine writes the record (research D-11).
 *
 * - `"lock-gate-dependency"` — the decision sits behind a lock gate that has
 *   already passed, so its effect cannot be isolated by re-deriving it.
 * - `"no-rederivable-write-path"` — there is no pure `mutate()` to re-run for
 *   this question, or the mutate seam is disabled in this build (research D-05).
 */
export type ImpactUnavailableReason = "lock-gate-dependency" | "no-rederivable-write-path";

/**
 * One changed file within a captured {@link DecisionImpact}.
 *
 * `path` is a VFS path from the same projection that produces the shipped
 * keyboard, e.g. `source/foo.kmn` (specs/055-legible-decision-trail FR-018).
 */
export interface DecisionFileChange {
  path: string;
  hunks: readonly DiffHunk[];
  magnitude: { added: number; removed: number };
}

/**
 * What a decision did to the source.
 *
 * Three states, all of them positive statements. `"none"` means the decision
 * genuinely changed no source — it is NOT an empty `"captured"`, precisely so
 * the trail can say "changed nothing" instead of rendering a blank diff as if
 * something had failed (spec Edge Cases, FR-011).
 *
 * `"captured"` widened from a single file to a set (specs/055-legible-decision-trail
 * FR-016/FR-018): `files` is never empty — a capture with no changed file is
 * `{ state: "none" }`, not an empty array. `magnitude` is the aggregate over
 * `files`, so a consumer that only reads `magnitude` keeps working unchanged.
 * `sharedWith` names co-decision `entryId`s attributed to the same boundary
 * capture; absent means this entry is solely responsible, and an entry never
 * names itself (research D-10).
 */
export type DecisionImpact =
  | {
      state: "captured";
      /** Non-empty: one entry per changed text file. */
      files: readonly DecisionFileChange[];
      /** Aggregate over `files`. */
      magnitude: { added: number; removed: number };
      /** Other entries' `entryId`s attributed to the same boundary capture. */
      sharedWith?: readonly string[];
    }
  | { state: "none" }
  | { state: "unavailable"; reason: ImpactUnavailableReason };

/**
 * The recorded value of a survey answer, carrying the same per-`answerType`
 * value discipline as {@link SurveyAnswer}.
 *
 * DERIVED from `SurveyAnswer` rather than restated: the value shape for each
 * `answerType` is looked up out of that union, so adding a member to
 * `AnswerType` (and to the survey's own value map) propagates here with no
 * edit — and a mismatch is impossible by construction rather than by review.
 */
export type SurveyAnswerValueFor<K extends AnswerType> = Extract<
  SurveyAnswer,
  { answerType: K }
>["value"];

/** Every value shape a recorded survey answer can hold, without the correlation. */
export type SurveyAnswerValue = SurveyAnswer["value"];

/**
 * What the working copy inherited when it was instantiated, recorded once at
 * `choose_base` as the baseline every later count is read against
 * (specs/055-legible-decision-trail FR-030/FR-031/FR-034/FR-035, research D-11).
 *
 * `startingKeyCount` follows the same absence convention as the
 * {@link EditorActionSummary} counts: absent means the inventory could not be
 * measured, never `0` — `0` is reserved for a genuinely empty starting layout.
 * `derivedAxes` and `inheritedMetadata[].field` carry codes, not prose; the
 * trail renders them through the catalog (FR-008).
 */
export interface BaseContribution {
  kind: "base-contribution";
  baseId: string;
  baseDisplayName: string;
  startingKeyCount?: number;
  derivedAxes: readonly string[];
  inheritedMetadata: readonly { field: string; value: string }[];
  /**
   * The two literals are taken verbatim from `workingCopyStore`'s
   * `InstantiationMode` (excluding its `null` pre-instantiation state, since
   * this entry is only ever written once instantiation has happened).
   */
  instantiationMode: "new-from-base" | "adapt-existing";
}

/**
 * What a decision entry is about. `kind` is the discriminant (see the module
 * header, rule 2).
 */
export type DecisionPayload =
  | {
      [K in AnswerType]: {
        kind: "survey-answer";
        questionId: string;
        answerType: K;
        value: SurveyAnswerValueFor<K>;
      };
    }[AnswerType]
  | { kind: "editor-action"; actionType: EditorActionType; summary: EditorActionSummary }
  | BaseContribution;

/**
 * One decision, as recorded.
 *
 * Append-only (FR-003): an entry is never edited once written. Revisiting a
 * decision appends a NEW entry whose `supersedes` names the one it replaces,
 * and the replaced entry stays in the record as history (FR-015).
 *
 * `impact` is the one field written after the fact, and only ever from absent
 * to a value, or to `null` when detail is shed to fit a save budget (research
 * D-09). The decision facts — `payload`, `provenance`, `supersedes` — are
 * immutable from the moment the entry exists.
 */
export interface DecisionEntry {
  /** Stable, unique within a record. Superseding entries reference it. */
  entryId: string;
  /** Manifest step this decision belongs to, or {@link PRE_IDENTITY_STEP_ID}. */
  stepId: string;
  payload: DecisionPayload;
  provenance: DecisionProvenance;
  /** Epoch ms. Ordering is by position in `entries`, not by this field. */
  recordedAt: number;
  /** `entryId` of the entry this one replaces, or `null` for a first decision. */
  supersedes: string | null;
  /**
   * The attributed source change. Absent means "not captured yet"; `null` means
   * "captured once and then shed to fit the save budget" — the trail renders
   * those two differently, so they must stay distinguishable.
   */
  impact?: DecisionImpact | null;
}

/** The whole per-keyboard record. */
export interface DecisionRecord {
  format: typeof DECISION_RECORD_FORMAT;
  version: number;
  /**
   * The keyboard this record belongs to, or `null` while the session has not
   * assigned an identity yet. Pre-identity entries are recorded under `null`
   * and carried forward verbatim when the identity arrives (FR-004).
   */
  keyboardId: string | null;
  /** Append order. Index order IS decision order (FR-012). */
  entries: readonly DecisionEntry[];
  /** Non-null when detail was dropped to fit a save budget; states itself in the trail. */
  truncated: { shedCount: number } | null;
}

/** Format discriminator written into the packaged record. */
export const DECISION_RECORD_FORMAT = "keyboard-studio.decision-record" as const;

/**
 * Schema version of the record.
 *
 * A reader that does not recognise this reads what it can and reports the rest
 * as dropped — it never rejects the whole record (contract §5, SC-009).
 *
 * Bumped 1 -> 2 for specs/055-legible-decision-trail (research D-01/D-07): a
 * record whose `version < 2` has every {@link EditorActionSummary} count
 * normalized to absent on read, and a captured {@link DecisionImpact}'s old
 * single `path`/`hunks`/`magnitude` lifted into a one-element `files` array.
 * That normalization is a reader concern (specs/055.../contracts/record-shape.contract.md
 * §5) — this module only states the version, it does not perform the read.
 */
export const DECISION_RECORD_VERSION = 2 as const;

/** Placeholder `stepId` for a decision recorded before any step is known (FR-004). */
export const PRE_IDENTITY_STEP_ID = "__pre_identity__" as const;

/**
 * Ceiling on {@link EditorActionSummary.sample} (contract §6).
 *
 * Exported so the recorder and its tests share one literal instead of two that
 * can disagree.
 */
export const EDITOR_ACTION_SAMPLE_LIMIT = 12 as const;

/** Unified-diff context lines per hunk (contract §6). */
export const DECISION_DIFF_CONTEXT_LINES = 3 as const;

/** An empty record, for a fresh session or an unreadable read. */
export function makeEmptyDecisionRecord(keyboardId: string | null = null): DecisionRecord {
  return {
    format: DECISION_RECORD_FORMAT,
    version: DECISION_RECORD_VERSION,
    keyboardId,
    entries: [],
    truncated: null,
  };
}
