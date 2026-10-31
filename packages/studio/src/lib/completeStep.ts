// completeStep — the generic step-completion path (spec 028 Stage 5 contract
// §2, FR-004), lifted out of StepHost.handleComplete (spec 107 FR-040) so the
// UI and the headless author run the same completion code.
//
// Steps 1-3 of the centralized onComplete:
//   1. SurveyPhaseResult-shaped results: recordPhase, record the completion's
//      decisions, run their effects, rebuild the working copy from the changed
//      decisions;
//   2. the STEPS_WITH_APPLY_COMPLETION reducer effects;
//   2b. the decision audit (spec 053);
//   3. the pure advance policy over the post-completion decision snapshot.
//
// The host keeps what depends on React or navigation: session advance, the
// characters sub-stage, revise-and-return and the output hop.

import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { getDecisionSnapshot, selectTouchSeedSource, selectTrack } from "../stores/decisionStore.ts";
import { deriveIdentityResult } from "../decisions/identitySelectors.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
import type { DecisionId } from "../decisions/decisionTypes.ts";
import {
  applyDecisionEffects,
  applyStepCompletion,
  recordAnswersAsDecisions,
  recordStepCompletion,
  type ReducerDeps,
} from "../steps/reducer.ts";
import { advance, STEPS_WITH_APPLY_COMPLETION, type AdvanceOutcome } from "../steps/advance.ts";

type CompletedStepId = Parameters<typeof advance>[0];

/** Shape guard for the generic completion path: recordPhase + effects only run for these. */
export function isSurveyPhaseResult(r: unknown): r is SurveyPhaseResult {
  return (
    typeof r === "object" &&
    r !== null &&
    typeof (r as { phase?: unknown }).phase === "string" &&
    Array.isArray((r as { answers?: unknown }).answers)
  );
}

export interface CompleteStepOptions {
  /** The working-copy store's recordPhase action. */
  recordPhase: (result: SurveyPhaseResult, opts: { stepId: string }) => void;
  /** The Phase F hard gate (useInventoryCoverageGate / deriveInventoryCoverageGate). */
  allCharactersImplemented: boolean;
}

export function completeStep(
  stepId: string,
  result: unknown,
  reducerDeps: ReducerDeps,
  opts: CompleteStepOptions,
): AdvanceOutcome {
  // 1. If SurveyPhaseResult-shaped: recordPhase, record the completion's
  //    decisions, then run their effects (spec 089 contract A6 — recording
  //    precedes applying, so an apply composes from a decision set that
  //    includes its own completion's records).
  if (isSurveyPhaseResult(result)) {
    // spec 079 D-4: the step owns its own answers within the phase slot.
    opts.recordPhase(result, { stepId });
    // Spec 088 FR-003 (contract C-2): the same completion writes one
    // decision record per provided decision into the decision store.
    recordAnswersAsDecisions(result, stepId, reducerDeps);
    // Spec 089 FR-001/FR-002: run each answered module's apply()
    // unconditionally through the checked patch sink.
    applyDecisionEffects(result, reducerDeps);
    // Spec 093 T009: the recorded change recalculates its downstream
    // closure and the working copy is rebuilt by replay from the
    // checkpoint before the first changed decision — the rebuilt
    // state installs over the incremental applies above, so what the
    // author continues from is the derived working copy. A no-op when
    // the host wired no rebuild (pre-093 behaviour) or when this
    // completion recorded no decisions.
    if (reducerDeps.rebuildFromDecisions !== undefined) {
      const changed: DecisionId[] = [];
      for (const answer of result.answers) {
        const mod = questionRegistry[answer.questionId];
        if (mod?.provides !== undefined) changed.push(...mod.provides);
      }
      if (changed.length > 0) reducerDeps.rebuildFromDecisions(changed);
    }
  }

  // 2. If step has reducer side effects: applyStepCompletion.
  //    Data-driven via STEPS_WITH_APPLY_COMPLETION (R7 effect table).
  if (STEPS_WITH_APPLY_COMPLETION.has(stepId)) {
    applyStepCompletion(stepId, result, reducerDeps);
  }

  // 2b. Decision audit (spec 053). AFTER the reducer, so an editor step's
  //     summary reads the working-copy state the step's own side effects just
  //     produced. Called for every step — unlike step 2 this is deliberately
  //     NOT gated on the effect table, because FR-001 records every survey
  //     answer, and most question steps have no reducer side effect at all.
  //     A no-op when no recorder is injected (see ReducerDeps.recordDecision).
  recordStepCompletion(stepId, result, reducerDeps);

  // 3. Pure advance policy → next step + optional signals.
  //    Read the track and identity support from the decision snapshot —
  //    NOT from a render-time closure: the completion above has just
  //    recorded this step's decisions, so the snapshot already holds the
  //    post-completion values.
  // Spec 088 FR-004/FR-005: routing reads the decision store. The track
  // and seed values are selectors over the store snapshot (the session
  // fields they used to be read from are deleted), and the snapshot
  // itself is the gate set advance() evaluates.
  const decisions = getDecisionSnapshot();
  // stepId is a manifest step id; the manifest guarantees every step id is
  // a valid ActiveStepId, so the cast is safe. advance() is defined in
  // advance.ts with a local ActiveStepId mirror — not imported from stores/
  // (depcruise boundary preserved).
  return advance(stepId as CompletedStepId, result, {
    decisions,
    selectedTrack: selectTrack(decisions),
    identitySupported: deriveIdentityResult(decisions)?.supported ?? true,
    touchSeedSource: selectTouchSeedSource(decisions),
    allCharactersImplemented: opts.allCharactersImplemented,
  });
}
