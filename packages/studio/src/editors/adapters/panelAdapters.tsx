// panelAdapters — EditorStep adapters for the wizard panel steps.
//
// Each adapter satisfies React.ComponentType<EditorStepProps> (the single
// contract for all editor steps). Adapters self-source inputs from stores/hooks
// (FR-007) rather than receiving them as props from the host.
//
// spec 029 full convergence (Option A):
//   TrackStepAdapter, ProjectNameStepAdapter, and PhaseFAdapter have been DELETED.
//   Those three flows are now live via factory components (flowStepOptions.tsx →
//   makeFlowStepComponent → FlowStepHost). Retained adapters:
//     - IdentityLiteAdapter (identityStep): writes setIdentityResult + setSurveyContext
//       before onComplete (R7 ordering).
//     - BaseResolutionAdapter (chooseBaseStep): writes setLocalBase before onComplete.
//     - ScaffoldFormAdapter: retained (legacy; not in manifest).
//     - TrackOneIdentityPanelAdapter: stub for the reserved "package" step.
//
// STEP-SPECIFIC EFFECT PLACEMENT (research R7):
//   The host's generic onComplete path is:
//     [recordPhase + routeAnswersThroughMutate if SurveyPhaseResult]
//     [applyStepCompletion if step in STEPS_WITH_APPLY_COMPLETION]
//     advance → session.advance(next)
//     [setCharactersSubStage if advanceOutcome carries it]
//   For steps whose handlers call store mutators BEFORE advance
//   (setIdentityResult, setSurveyContext, setLocalBase), those writes are placed
//   in the ADAPTER so they fire before onComplete triggers the host's advance call.
//
// Boundary: editors/adapters/ → stores/ and hooks/ is allowed by depcruise.

import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useGitHubAuth } from "../../hooks/useGitHubAuth.ts";
import { useValidatorFindings } from "../../hooks/useValidatorFindings.ts";
import type { EditorStepProps } from "../../steps/types.ts";
import { ScaffoldForm } from "../panels/ScaffoldForm.tsx";
import type { ScaffoldSpec } from "../../hooks/useKeyboardArtifact.ts";
import { TrackOneIdentityPanel } from "../panels/TrackOneIdentityPanel.tsx";
import { BaseResolution } from "../panels/BaseResolution.tsx";
import type { SuggestTarget } from "../../lib/suggestBase.ts";
import {
  IdentityLite,
  extractIdentityLite,
} from "../../survey/index.ts";
import type { SurveyContext } from "../../survey/types.ts";
import type { IdentityLiteResult } from "../../survey/IdentityLite.tsx";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// contextFromIdentity — derive SurveyContext from IdentityLiteResult.
// Moved from StudioShell.tsx (was private) to here, where the identity adapter
// needs it. Same logic, same output.
// ---------------------------------------------------------------------------

function contextFromIdentity(identity: IdentityLiteResult): SurveyContext {
  return {
    language_name: identity.english || identity.autonym,
    routing_group: identity.prefill.routingGroup,
    script_family: identity.prefill.script,
    ...(identity.bcp47 !== "" ? { bcp47_tag: identity.bcp47 } : {}),
    // spec 059 FR-016: publishing the contact here activates the Phase F
    // pre-fill seam (see CTX_AUTHOR_CONTACT in flowStepOptions.tsx), so
    // pf_contact_info is confirmed rather than asked a second time.
    ...(identity.attribution?.authorEmail !== undefined &&
    identity.attribution.authorEmail !== ""
      ? { author_contact: identity.attribution.authorEmail }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// IdentityLiteAdapter (T008)
//
// Real adapter for identityStep — replaces TrackOneIdentityPanelAdapter
// placeholder. Reads surveyContext + findingsByQuestionId from the store
// bridge; on completion writes setIdentityResult + setSurveyContext (the
// identity-specific session-store effects per research R7) BEFORE calling
// onComplete so the golden-walk mutation order is preserved:
//   setIdentityResult → setSurveyContext → onComplete → (host) advance
// ---------------------------------------------------------------------------

export function IdentityLiteAdapter({ onComplete }: EditorStepProps) {
  // Read surveyContext for the live context prop (identity panel needs it).
  const surveyContext = useSurveySessionStore((s) => s.surveyContext);
  // Derive per-question findings from the V3 store bridge (spec-014).
  const findingsByQuestionId = useValidatorFindings();

  // Step-specific session-store writers (R7 — written before onComplete so the
  // golden-walk ordering is setIdentityResult → setSurveyContext → advance).
  const setIdentityResult = useSurveySessionStore((s) => s.setIdentityResult);
  const setSurveyContext = useSurveySessionStore((s) => s.setSurveyContext);
  const setAttribution = useWorkingCopyStore((s) => s.setAttribution);
  // Only the profile fields are read here; the auth STATUS is irrelevant to
  // identity capture, and a guest simply gets no seed (D6 then requires a typed
  // name before emission).
  const { authorName, authorEmail } = useGitHubAuth();
  const setIdentityPhaseResult = useSurveySessionStore((s) => s.setIdentityPhaseResult);
  // Prior completed run, if any — lets a history pop back onto this step resume
  // the flow at its last question instead of replaying from question 1.
  const identityPhaseResult = useSurveySessionStore((s) => s.identityPhaseResult);

  function handleComplete(result: SurveyPhaseResult, identity: IdentityLiteResult) {
    // R7: identity-specific writes fire here, before onComplete → host → advance.
    setIdentityResult(identity);
    setSurveyContext(contextFromIdentity(identity));
    // spec 059 US1: the working copy is the single source the scaffolder reads
    // for LICENSE.md / store(&COPYRIGHT) / .kps <Copyright>, and it rides the
    // existing draft so attribution survives a reload for free.
    setAttribution(identity.attribution);
    setIdentityPhaseResult(result);
    // Forward the phase result; host guards on SurveyPhaseResult shape and calls
    // recordPhase + routeAnswersThroughMutate.
    onComplete(result);
  }

  return (
    <IdentityLite
      // spec 059 D7: pre-fill attribution from the authenticated profile so the
      // author confirms rather than types. Absent fields fall through to asking.
      authorSeed={{ name: authorName, email: authorEmail }}
      context={surveyContext}
      onComplete={handleComplete}
      findingsByQuestionId={findingsByQuestionId}
      {...(identityPhaseResult ? { resume: identityPhaseResult } : {})}
    />
  );
}

// ---------------------------------------------------------------------------
// ScaffoldFormAdapter
// ---------------------------------------------------------------------------

/**
 * Adapter for ScaffoldForm. Passes the submitted ScaffoldSpec as the step
 * result. ScaffoldForm has no Back affordance in its existing design.
 */
export function ScaffoldFormAdapter({ onComplete }: EditorStepProps) {
  function handleSubmit(spec: ScaffoldSpec) {
    onComplete({ spec });
  }

  return <ScaffoldForm onSubmit={handleSubmit} />;
}

// ---------------------------------------------------------------------------
// TrackOneIdentityPanelAdapter (retained for package step stub)
// ---------------------------------------------------------------------------

/**
 * Adapter for TrackOneIdentityPanel. Retained as the stub component for
 * the reserved "package" step (out of scope for v1). Does not call onComplete
 * (the package step has no completion in v1).
 */
export function TrackOneIdentityPanelAdapter(_props: EditorStepProps) {
  return <TrackOneIdentityPanel />;
}

// ---------------------------------------------------------------------------
// BaseResolutionAdapter (updated for Stage 5)
//
// Writes setLocalBase to surveySessionStore BEFORE calling onComplete so the
// golden-walk mutation ordering is: setLocalBase → onComplete → (host) advance.
// ---------------------------------------------------------------------------

/**
 * Adapter for BaseResolution. Reads the suggest target from the
 * surveySessionStore's identityResult (written by IdentityLiteAdapter's
 * setIdentityResult before this step is reached) and passes the resolved
 * BaseKeyboard as the step result.
 *
 * T-Stage5: calls setLocalBase (surveySessionStore) before onComplete to
 * reproduce the pre-Stage-5 handleBaseResolved mutation ordering.
 */
export function BaseResolutionAdapter({ onComplete, onBack }: EditorStepProps) {
  const identityResult = useSurveySessionStore((s) => s.identityResult);
  const setLocalBase = useSurveySessionStore((s) => s.setLocalBase);

  // `||` not `??`: prefill.script can be "" (no script selected for an
  // unrecognized language), which must also fall back.
  const target: SuggestTarget = {
    script: identityResult?.prefill.script || "Latn",
    ...(identityResult?.bcp47 ? { bcp47: identityResult.bcp47 } : {}),
  };

  return (
    <BaseResolution
      target={target}
      onResolved={(base) => {
        // R7: setLocalBase fires before onComplete → host → advance.
        setLocalBase(base);
        onComplete({ base });
      }}
      {...(onBack ? { onBack } : {})}
    />
  );
}

// Re-export extractIdentityLite for consumers that need it.
export { extractIdentityLite };
