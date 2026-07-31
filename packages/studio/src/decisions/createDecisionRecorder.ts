// createDecisionRecorder — compose the recording modules into the single
// `recordDecision` callback injected into `ReducerDeps` (specs/053 T019).
//
// This is the only place the three recorders meet, and the only place that knows
// how a step's captured source change is attributed to a decision. Keeping that
// judgement here — rather than inside `StudioShell`'s dep memo — means it can be
// tested without mounting the shell.
//
// ATTRIBUTION RULE, and its deliberate limit
//
// A step boundary yields ONE net source diff (snapshotSource.ts). Attribution is
// therefore only honest when the step produced exactly one decision:
//
//   - an editor step: one aggregated entry, and the boundary diff is its change;
//   - a question step that resolved a single answer: same;
//   - a question step that resolved several answers: the diff CANNOT be split
//     between them, so none of them claims it. Those entries fall through to the
//     on-request counterfactual path (impact.ts), which reports the FR-011 reason
//     when it cannot derive one.
//
// Attaching the whole step's diff to each of four answers would be the easy
// alternative and would make every one of them overstate what it did. An entry
// that says "cannot be isolated, here is why" is worth more than four that lie.

import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { useDecisionLogStore } from "./decisionLogStore.ts";
import { recordSurveyAnswers, type ProposalLookup } from "./recordSurveyAnswers.ts";
import { recordEditorStep, type DeletionCounts } from "./recordEditorStep.ts";
import type { SourceSnapshotter } from "./snapshotSource.ts";

export interface DecisionRecorderDeps {
  /** Boundary source-capture, built by `createSourceSnapshotter`. */
  snapshotter: SourceSnapshotter;
  /** Cumulative carve deletion sizes from the working-copy store. */
  getDeletionCounts: () => DeletionCounts;
  /** Ids of the carved-away nodes/items, for the bounded sample. */
  getDeletedIds: () => readonly string[];
  /**
   * The keyboard identity, once known. Read on every completion so pre-identity
   * entries get stamped the moment an identity exists (FR-004) without any step
   * having to announce it.
   */
  getKeyboardId: () => string | null;
  /** Optional per-question proposal register — see recordSurveyAnswers.ts. */
  resolveProposal?: ProposalLookup;
}

/** Same shape guard the host uses on its generic completion path. */
function isSurveyPhaseResult(r: unknown): r is SurveyPhaseResult {
  return (
    typeof r === "object" &&
    r !== null &&
    Array.isArray((r as { answers?: unknown }).answers)
  );
}

/**
 * Build the `recordDecision` callback.
 *
 * Synchronous and non-throwing: it runs inside a step transition, so it must
 * never delay one and must never break one. The source capture it kicks off is
 * fire-and-forget — the entry is already recorded by the time the diff resolves,
 * and the diff is attached afterwards (see `attachImpact`'s write-once contract).
 */
export function createDecisionRecorder(
  deps: DecisionRecorderDeps,
): (event: { stepId: string; result: unknown }) => void {
  return ({ stepId, result }) => {
    const log = useDecisionLogStore.getState();

    // FR-004: carry the identity onto the record as soon as there is one. Entries
    // recorded before it are untouched apart from the record-level id.
    log.setKeyboardId(deps.getKeyboardId());

    const answerIds = isSurveyPhaseResult(result)
      ? recordSurveyAnswers(stepId, result, {
          append: log.append,
          ...(deps.resolveProposal !== undefined ? { resolveProposal: deps.resolveProposal } : {}),
        })
      : [];

    const editorId = recordEditorStep(stepId, result, {
      append: log.append,
      getDeletionCounts: deps.getDeletionCounts,
      getDeletedIds: deps.getDeletedIds,
    });

    // Advance the source baseline on EVERY completion, whether or not anything
    // was recorded. Skipping non-recording steps would make the next diff span
    // two boundaries and attribute another step's change to this one.
    const attributable = editorId ?? (answerIds.length === 1 ? answerIds[0]! : null);
    void deps.snapshotter
      .captureAtBoundary()
      .then((impact) => {
        if (impact === null || attributable === null) return;
        useDecisionLogStore.getState().attachImpact(attributable, impact);
      })
      .catch(() => {
        // Capture is best-effort by design: the decision is already recorded, and
        // an entry with no captured change is a state the trail renders. Swallowed
        // rather than surfaced because there is nothing the author could do.
      });
  };
}
