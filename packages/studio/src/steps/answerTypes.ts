// answerTypes — the saved-answer model shared by the answer store, the evidence
// keys and the re-proposal view (spec 079 data-model.md §1-§3).
//
// Why these live in steps/ and not beside the store: the depcruise `steps-layer`
// and `decisions-layer` rules forbid steps/ and decisions/ importing stores/
// (type-only imports included). `reconcile()` (steps/evidence.ts) and the
// decision recorder both need these shapes, so they sit here, and
// stores/surveyAnswerStore.ts re-exports them. Studio-local: none of this is in
// @keyboard-studio/contracts, and `AnswerType` is only read from there.

import type { AnswerType } from "@keyboard-studio/contracts";

/** Manifest step id. */
export type StepId = string;
/** One author-facing screen, i.e. one Next (FR-060). */
export type ScreenId = string;
/** A question id, or `<screen>.<subject>` for a screen that asks several things. */
export type AnswerId = string;
/** Opaque fingerprint of the evidence an answer depends on. Compared, never parsed. */
export type EvidenceKey = string;

/** The value shapes a survey answer can hold — the same ones `SurveyAnswer["value"]` uses. */
export type SavedValue = string | string[] | boolean;

export interface SavedAnswer {
  value: SavedValue;
  answerType: AnswerType;
  origin: "proposed" | "confirmed" | "overturned";
  /** FR-008: a draft until its screen's Next confirms it. */
  stage: "draft" | "confirmed";
  /** `null` = the answer depends on no earlier answer. */
  evidenceKey: EvidenceKey | null;
  screenId: ScreenId;
  /** Ordering and debugging only; never shown. */
  savedAt: number;
}

/** Why a step passed without asking (FR-065). Rendered through the catalog. */
export interface NotAskedReason {
  code: string;
}

export type StepStatus =
  | { kind: "in-progress" }
  | { kind: "finished" }
  | { kind: "not-asked"; reason: NotAskedReason; evidenceKey: EvidenceKey };

export interface StepAnswers {
  answers: Record<AnswerId, SavedAnswer>;
  /** Where the author is inside the step: a screen id, question id or position token. */
  position: string | null;
  status: StepStatus;
  /** Hash of each screen's answers at its last Next — the FR-040 no-op check. */
  lastRecorded: Record<ScreenId, string>;
}

export interface SurveyAnswerSnapshot {
  steps: Record<StepId, StepAnswers>;
  /** Which screen each decision entry was recorded on (journey-strip grouping). */
  recordedScreenOf: Record<string, ScreenId>;
}

// ---------------------------------------------------------------------------
// Re-proposal view (data-model.md §3)
// ---------------------------------------------------------------------------

export interface ReproposalReason {
  code: "evidence-added" | "evidence-removed" | "outside-script" | "now-applicable";
  /** e.g. the added character; rendered through the catalog. */
  subject: string;
  /** The step whose answer changed. */
  sourceStepId: StepId;
}

export type AnswerView<V> =
  | { state: "current"; value: V; saved: SavedAnswer }
  | { state: "reproposed"; value: V; saved: SavedAnswer; reason: ReproposalReason }
  | { state: "proposed"; value: V }
  /** The answer's subject is gone from the evidence: kept, but not asked. */
  | { state: "inactive"; value: V; saved: SavedAnswer };
