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
import { useValidatorFindings } from "../../hooks/useValidatorFindings.ts";
import type { EditorStepProps } from "../../steps/types.ts";
import { ScaffoldForm } from "../panels/ScaffoldForm.tsx";
import type { ScaffoldSpec } from "../../hooks/useKeyboardArtifact.ts";
import { TrackOneIdentityPanel } from "../panels/TrackOneIdentityPanel.tsx";
import { BaseResolution } from "../panels/BaseResolution.tsx";
import type { SuggestTarget } from "../../lib/suggestBase.ts";
import { useBasePreviewStatusStore } from "../../stores/basePreviewStatusStore.ts";
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
  const setIdentityPhaseResult = useSurveySessionStore((s) => s.setIdentityPhaseResult);
  // Prior completed run, if any — lets a history pop back onto this step resume
  // the flow at its last question instead of replaying from question 1.
  const identityPhaseResult = useSurveySessionStore((s) => s.identityPhaseResult);

  function handleComplete(result: SurveyPhaseResult, identity: IdentityLiteResult) {
    // R7: identity-specific writes fire here, before onComplete → host → advance.
    setIdentityResult(identity);
    setSurveyContext(contextFromIdentity(identity));
    setIdentityPhaseResult(result);
    // Forward the phase result; host guards on SurveyPhaseResult shape and calls
    // recordPhase + routeAnswersThroughMutate.
    onComplete(result);
  }

  return (
    <IdentityLite
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
// BaseResolutionAdapter (preview-before-commit)
//
// BaseResolution now separates PREVIEW (every search-result / suggestion-card
// click) from COMMIT (the single "Choose this keyboard" button). Preview
// writes setLocalBase (which drives the live compile pipeline in StudioShell)
// and clears baseConfirmed WITHOUT calling onComplete — the wizard does not
// advance and the working copy is not instantiated. Commit sets
// baseConfirmed=true (which arms StudioShell's single-instantiation effect,
// see StudioShell.tsx) BEFORE calling onComplete, preserving the R7
// "writes before advance" ordering.
// ---------------------------------------------------------------------------

/**
 * Adapter for BaseResolution. Reads the suggest target from the
 * surveySessionStore's identityResult (written by IdentityLiteAdapter's
 * setIdentityResult before this step is reached).
 *
 * previewStatus is read from basePreviewStatusStore (published by
 * StudioShell's SurveyView) so this adapter never imports useKeyboardArtifact
 * or the compile pipeline directly.
 */
export function BaseResolutionAdapter({ onComplete, onBack }: EditorStepProps) {
  const identityResult = useSurveySessionStore((s) => s.identityResult);
  const localBase = useSurveySessionStore((s) => s.localBase);
  const setLocalBase = useSurveySessionStore((s) => s.setLocalBase);
  const setBaseConfirmed = useSurveySessionStore((s) => s.setBaseConfirmed);

  const previewStatus = useBasePreviewStatusStore((s) => s.status);

  // `||` not `??`: prefill.script can be "" (no script selected for an
  // unrecognized language), which must also fall back.
  const target: SuggestTarget = {
    script: identityResult?.prefill.script || "Latn",
    ...(identityResult?.bcp47 ? { bcp47: identityResult.bcp47 } : {}),
  };

  return (
    <BaseResolution
      target={target}
      previewedBase={localBase}
      previewStatus={previewStatus}
      onPreview={(base) => {
        // A fresh preview re-arms the commit gate — any prior confirmation
        // no longer applies to a DIFFERENT (or cleared) base.
        setBaseConfirmed(false);
        setLocalBase(base);
      }}
      onConfirm={() => {
        if (localBase) {
          // R7: setBaseConfirmed fires before onComplete → host → advance.
          setBaseConfirmed(true);
          onComplete({ base: localBase });
        }
      }}
      {...(onBack ? { onBack } : {})}
    />
  );
}

// Re-export extractIdentityLite for consumers that need it.
export { extractIdentityLite };
