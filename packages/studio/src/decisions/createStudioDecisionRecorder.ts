// createStudioDecisionRecorder — the studio's ReducerDeps["recordDecision"]
// wiring, extracted so StudioShell.tsx and its tests share ONE definition
// (specs/055-legible-decision-trail post-implement review, P1).
//
// Before this file existed, the ~15-getter dependency block that adapts
// `createDecisionRecorder` (createDecisionRecorder.ts) onto the studio's real
// stores was written inline in StudioShell.tsx's `useMemo`, and
// reducer.decisionRecording.test.ts's `realRecorder()` restated it verbatim
// because it had nothing to import. That is a second source of truth for the
// wiring itself — production and test could silently diverge, which is the
// exact failure mode specs/055 exists to close (see this module's own
// `createDecisionRecorder` docstring, and the KNOWN LIMITATION note the test
// file carried before this change). This factory is now the one place that
// wiring is written; StudioShell and the test both call it.
//
// The working-copy store accessor is a PARAMETER, not a module-level import of
// `useWorkingCopyStore`, so a caller controls exactly which store state the
// getters read — in production that is `useWorkingCopyStore.getState`, and the
// test passes the same accessor because it drives decisions through the real
// store's actions (deleteNode, recordAssignments, etc.), never a mock.
//
// `WorkingCopyStateForRecording` below is a structural subset of
// stores/workingCopyStore.ts's `WorkingCopyState` — named locally rather than
// imported, because the depcruise `decisions-layer` rule forbids decisions/ ->
// stores/ (the trail reads no store directly; StudioShell is the only place
// that reaches into stores/ and hands data down). The real `WorkingCopyState`
// satisfies this interface structurally, so `useWorkingCopyStore.getState`
// type-checks as the `getWorkingCopyState` argument with no store import here.

import type {
  BaseKeyboard,
  DiscoveryAxisVector,
  KeyboardIR,
  RemovalCapability,
  SurveyPhaseResult,
} from "@keyboard-studio/contracts";
import { settlesForStep } from "../steps/stepDependencies.ts";
import type { DecisionSet } from "./decisionTypes.ts";
import { selectDesktopAssignments } from "../lib/unimplementedInventory.ts";
import { deriveProjectKeyFromWorkingCopy } from "../lib/draftPersistence.ts";
import { createDecisionRecorder, type DecisionRecorder, type DecisionRecorderDeps } from "./createDecisionRecorder.ts";
import type { InstantiatedMode } from "./recordBaseContribution.ts";
import type { AnswerProposal } from "./recordSurveyAnswers.ts";
import type { SavedAnswer } from "../steps/answerTypes.ts";
import type { SourceSnapshotter } from "./snapshotSource.ts";

export interface WorkingCopyStateForRecording {
  deletedNodeIds: ReadonlySet<string>;
  deletedItemIds: ReadonlySet<string>;
  /** Issue #1809, ruling §1: the aggregated carved character set. */
  carveChars: ReadonlySet<string>;
  deletedTouchKeyIds: ReadonlySet<string>;
  phaseResults: readonly SurveyPhaseResult[];
  baseIr: KeyboardIR | null;
  identity: { keyboardId?: string } | null;
  baseKeyboard: BaseKeyboard | null;
  irAxes: Partial<DiscoveryAxisVector>;
  instantiationMode: InstantiatedMode | null;
  removalCapabilities: Map<string, RemovalCapability>;
}

export interface CreateStudioDecisionRecorderDeps {
  /** Read the current working-copy store state — `useWorkingCopyStore.getState` in production. */
  getWorkingCopyState: () => WorkingCopyStateForRecording;
  /**
   * Boundary source-capture, built by `createSourceSnapshotter`. Stateful (it
   * carries the previous boundary's text) — the caller owns its lifetime, this
   * factory only forwards it.
   */
  snapshotter: SourceSnapshotter;
  /**
   * spec 079 R-04 answer-store hooks, forwarded to `createDecisionRecorder`.
   * StudioShell wires them to stores/surveyAnswerStore.ts (decisions/ may not
   * import it).
   */
  onScreenRecorded?: DecisionRecorderDeps["onScreenRecorded"];
  getLastRecordedHash?: DecisionRecorderDeps["getLastRecordedHash"];
  resolveCompletionScreen?: DecisionRecorderDeps["resolveCompletionScreen"];
  /**
   * A question's saved answer, read from stores/surveyAnswerStore.ts by
   * StudioShell. Its `proposal` (what the field was pre-filled with) lets a
   * survey seed the author kept record as the studio's suggestion rather than
   * as their own choice.
   */
  getSavedAnswer?: (
    stepId: string,
    questionId: string,
  ) => Pick<SavedAnswer, "answerType" | "proposal"> | undefined;
  /**
   * spec 090 US5: read the live decision set (the 088 decision store's
   * snapshot), from which this factory resolves each completing step's
   * settled gallery decisions. StudioShell wires it to
   * `getDecisionSnapshot`. Optional — without it the recorder records no
   * gallery-decision entries (unit fixtures that never settled any).
   */
  getDecisions?: () => DecisionSet;
}

/**
 * Build the studio's `recordDecision` callback: `createDecisionRecorder`
 * (createDecisionRecorder.ts) composed with the studio's own working-copy
 * store as the source for every count/id/proposal it reports.
 */
export function createStudioDecisionRecorder(
  deps: CreateStudioDecisionRecorderDeps,
): DecisionRecorder {
  const { getWorkingCopyState, snapshotter } = deps;

  return createDecisionRecorder({
    snapshotter,
    ...(deps.onScreenRecorded !== undefined ? { onScreenRecorded: deps.onScreenRecorded } : {}),
    ...(deps.getLastRecordedHash !== undefined ? { getLastRecordedHash: deps.getLastRecordedHash } : {}),
    ...(deps.resolveCompletionScreen !== undefined
      ? { resolveCompletionScreen: deps.resolveCompletionScreen }
      : {}),
    // spec 090 US5: a step's settled gallery decisions are its `settles`
    // list (steps/stepDependencies.ts — the one declaration of what a step
    // settles) resolved against the live decision set. A settles id with
    // no record is a decision the step did not settle this session; it
    // contributes no entry, which is the G7 check's "gap" made visible
    // rather than papered over.
    ...(deps.getDecisions !== undefined
      ? {
          getStepDecisions: (stepId: string) => {
            const decisions = deps.getDecisions!();
            return settlesForStep(stepId).flatMap((id) => {
              const record = decisions[id];
              return record !== undefined ? [record] : [];
            });
          },
        }
      : {}),
    getDeletionCounts: () => {
      const wc = getWorkingCopyState();
      return {
        nodes: wc.deletedNodeIds.size,
        items: wc.deletedItemIds.size,
        touchKeys: wc.deletedTouchKeyIds.size,
      };
    },
    getDeletedIds: () => {
      const wc = getWorkingCopyState();
      return [...wc.deletedNodeIds, ...wc.deletedItemIds, ...wc.deletedTouchKeyIds];
    },
    // The store's phase-C physical mechanism assignments, via the ONE
    // documented selector every other reader of this filter also uses
    // (unimplementedInventory.ts's `selectDesktopAssignments` docstring) —
    // recordEditorStep must never fork this definition (research D-01).
    getMechanismAssignments: () => selectDesktopAssignments(getWorkingCopyState().phaseResults),
    // The base IR the working copy was instantiated from (research D-05) —
    // `null` before instantiation.
    getBaseIr: () => getWorkingCopyState().baseIr,
    getDeletedNodeIds: () => getWorkingCopyState().deletedNodeIds,
    getDeletedItemIds: () => getWorkingCopyState().deletedItemIds,
    // Issue #1809, ruling §1: the aggregated carved character set for the
    // single aggregated-R projection pass.
    getCarveChars: () => getWorkingCopyState().carveChars,
    // The keyboard's own id once the author has set one, else the base's. This
    // CALLS the project-key derivation rather than restating it: the comment
    // here used to claim it was "matching how deriveProjectKeyFromWorkingCopy
    // keys a project" while independently recomputing the same expression, so
    // "the record and the draft agree on which keyboard this is" held only by
    // prose. Nothing would have caught a change to one and not the other — the
    // shape of the aria-label/filename divergence this spec fixes.
    getKeyboardId: () => deriveProjectKeyFromWorkingCopy(getWorkingCopyState()),
    // specs/055 FR-030..FR-035 (research D-11): the base baseline, read
    // straight off the instantiated store — never a re-read of the base's
    // source. `null` before instantiation; `recordBaseContribution` (called
    // only at `choose_base` completion) treats that as "no entry yet",
    // never a fabricated zero.
    getBaseKeyboard: () => getWorkingCopyState().baseKeyboard,
    getIrAxes: () => getWorkingCopyState().irAxes,
    getInstantiationMode: () => getWorkingCopyState().instantiationMode,
    getRemovalCapabilities: () => getWorkingCopyState().removalCapabilities,
    // specs/055 FR-032/FR-033: `resolveProposal` seeded with the base's
    // inherited values — the SAME three fields `recordBaseContribution`'s
    // `inheritedMetadataOf` reports above (script/targets/version), read
    // straight off the instantiated store, never a re-read of the base's
    // source. This is the wiring `recordSurveyAnswers.ts`'s module header
    // anticipates: when a recorded answer's value equals one of these, it
    // was carried from the base, not typed by the author, so
    // `deriveAnswerProvenance` returns `{ agency: "base-derived", source:
    // "base" }` instead of falling through to `"hand-set"` — reaching the
    // already-authored `trail.entry.headline.fromBase` message.
    //
    // No new provenance concept (FR-032): this is a lookup over data the
    // base-contribution recorder already reads, not a second "came from
    // base" flag. And no mutation when the author later overrides one of
    // these values (FR-033) — a differing answer simply fails the
    // value-equality check in `deriveAnswerProvenance` and records as
    // `"hand-set"`, so the base's own entry (recorded once, above, at
    // `choose_base` completion) and the author's superseding answer both
    // stay on the append-only record, exactly as 053 FR-015's supersede
    // semantics require.
    //
    // Any other question falls back to the proposal its saved answer was
    // pre-filled with, so a seeded default the author kept reads as accepted
    // rather than chosen.
    resolveProposal: (questionId, stepId) => {
      const base = getWorkingCopyState().baseKeyboard;
      if (base !== null) {
        switch (questionId) {
          case "script":
            return { value: base.script, source: "base" };
          case "targets":
            return { value: base.targets, source: "base" };
          case "version":
            return { value: base.version, source: "base" };
        }
      }
      const saved = deps.getSavedAnswer?.(stepId, questionId);
      return saved?.proposal !== undefined ? recordedProposal(saved.proposal, saved.answerType) : undefined;
    },
  });
}

/**
 * A saved proposal in the shape `deriveAnswerProvenance` compares against. The
 * survey field holds a bool question's value as the string "true"/"false", but
 * the recorded answer holds a boolean (SurveyRunner's `toSurveyAnswer`), so the
 * string form is converted or a kept default would never match.
 */
function recordedProposal(
  proposal: NonNullable<SavedAnswer["proposal"]>,
  answerType: SavedAnswer["answerType"],
): AnswerProposal {
  const value = answerType === "boolean" ? proposal.value === "true" || proposal.value === true : proposal.value;
  return proposal.source !== undefined ? { value, source: proposal.source } : { value };
}
