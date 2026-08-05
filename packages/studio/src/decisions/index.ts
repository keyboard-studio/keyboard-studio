// decisions — the studio's half of the per-keyboard decision audit
// (specs/053-decision-audit).
//
// Split of responsibilities with the engine: the engine owns what is PURE and
// shared (the differ, the serializer, the tolerant reader, the shed pass — see
// packages/engine/src/decision-audit/). This layer owns everything that depends on
// the session: the append-only log, the three recorders, the boundary source
// capture, on-request impact resolution, and the author-facing trail.
//
// Layer boundaries this module respects:
//   - `steps/` never imports it. Recording reaches the reducer as an INJECTED dep
//     (`ReducerDeps.recordDecision`), so no step or gallery learns that auditing
//     exists (research D-02).
//   - the trail components read no store. `StudioShell` reads the record and
//     passes it down, exactly as it does for `completenessReport` — which is what
//     makes the trail renderable against a fixture record in tests.

export {
  useDecisionLogStore,
  snapshotDecisionRecord,
  applyDecisionRecordSnapshot,
  resetDecisionEntryIds,
  slotKeyOf,
  payloadsEqual,
  liveEntryForSlot,
  chainTip,
} from "./decisionLogStore.ts";
export type { DecisionEntryInput, DecisionLogState, DecisionRecordSnapshot } from "./decisionLogStore.ts";

export { recordSurveyAnswers, deriveAnswerProvenance } from "./recordSurveyAnswers.ts";
export type { AnswerProposal, ProposalLookup, RecordSurveyAnswersDeps } from "./recordSurveyAnswers.ts";

export {
  recordEditorStep,
  observeEditorStep,
  summarizeEditorActivity,
  EDITOR_ACTION_STEPS,
} from "./recordEditorStep.ts";
export type {
  DeletionCounts,
  EditorStepObservation,
  RecordEditorStepDeps,
} from "./recordEditorStep.ts";

export { createSourceSnapshotter } from "./snapshotSource.ts";
export type { ProjectedSource, SourceSnapshotter, SourceSnapshotterDeps } from "./snapshotSource.ts";

export { createDecisionRecorder } from "./createDecisionRecorder.ts";
export type { DecisionRecorderDeps } from "./createDecisionRecorder.ts";

export { resolveImpact, resolveImpactAsync } from "./impact.ts";
export type { ResolveImpactDeps, ResolveImpactAsyncDeps } from "./impact.ts";

// spec 059 — attribution for decisions recorded before a working copy existed.
export { textBaseline, normalizeHistoryDateStamp } from "./projectedText.ts";
export {
  resolveIdentityCounterfactual,
  outputFieldForEntry,
  coDecisionEntryIds,
} from "./counterfactualProjection.ts";
export type { CounterfactualDeps } from "./counterfactualProjection.ts";
export { useEntryImpact } from "./useEntryImpact.ts";
export type { EntryImpactState } from "./useEntryImpact.ts";

export { headlineFor, headlineOf, formatAnswerValue } from "./headline.ts";
export type { HeadlineSpec } from "./headline.ts";

export { DecisionTrailView } from "./DecisionTrailView.tsx";
export type { DecisionTrailViewProps } from "./DecisionTrailView.tsx";
export { DecisionEntryRow } from "./DecisionEntryRow.tsx";
export type { DecisionEntryRowProps } from "./DecisionEntryRow.tsx";
