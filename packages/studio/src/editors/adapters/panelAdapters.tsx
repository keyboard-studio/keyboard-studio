// panelAdapters — EditorStep adapters for the wizard panel steps.
//
// Each adapter satisfies React.ComponentType<EditorStepProps> (the single
// contract for all editor steps). Adapters self-source inputs from stores/hooks
// (FR-007) rather than receiving them as props from the host.
//
// spec 028 Stage 5 (T008-T011):
//   - IdentityLiteAdapter: real adapter replacing TrackOneIdentityPanelAdapter
//     placeholder for identityStep. Writes setIdentityResult + setSurveyContext
//     directly (step-specific effect per research R7) before calling onComplete.
//   - PhaseFAdapter: real adapter replacing TrackOneIdentityPanelAdapter
//     placeholder for helpStep. Reads surveyContext + findingsByQuestionId from
//     the validatorFindings store bridge.
//   - BaseResolutionAdapter: updated to write setLocalBase before onComplete so
//     the host's generic advance sees the correct store-mutation ordering.
//   - TrackStepAdapter: updated to use PhaseTrack (survey component) + write
//     track-specific session store mutations before calling onComplete.
//   - ProjectNameStepAdapter: updated to use PhaseProjectName + write
//     setScaffoldSpec + setIdentity before calling onComplete.
//
// STEP-SPECIFIC EFFECT PLACEMENT (research R7):
//   The host's generic onComplete path is:
//     [recordPhase + routeAnswersThroughMutate if SurveyPhaseResult]
//     [applyStepCompletion if step in STEPS_WITH_APPLY_COMPLETION]
//     advance → session.advance(next)
//     [setCharactersSubStage if advanceOutcome carries it]
//   For steps whose pre-Stage-5 handlers called store mutators BEFORE advance
//   (setIdentityResult, setSurveyContext, setLocalBase, setSelectedTrack,
//   setScaffoldSpec, setIdentity), those writes are placed in the ADAPTER so
//   they fire before onComplete triggers the host's advance call — reproducing
//   the exact ordering the golden-walk oracle asserts (SC-001).
//
// Boundary: editors/adapters/ → stores/ and hooks/ is allowed by depcruise.

import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { buildFindingsByQuestionId } from "../../lint/lintToQuestion.ts";
import type { EditorStepProps } from "../../steps/types.ts";
import { TrackStep } from "../panels/TrackStep.tsx";
import type { Track } from "../panels/TrackStep.tsx";
import { ScaffoldForm } from "../panels/ScaffoldForm.tsx";
import type { ScaffoldSpec } from "../../hooks/useKeyboardArtifact.ts";
import { TrackOneIdentityPanel } from "../panels/TrackOneIdentityPanel.tsx";
import { BaseResolution } from "../panels/BaseResolution.tsx";
import type { SuggestTarget } from "../../lib/suggestBase.ts";
import {
  IdentityLite,
  PhaseTrack,
  PhaseProjectName,
  PhaseF,
  extractIdentityLite,
} from "../../survey/index.ts";
import type { SurveyContext } from "../../survey/types.ts";
import type { IdentityLiteResult } from "../../survey/IdentityLite.tsx";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { useMemo } from "react";

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
  // Read validator findings from the store bridge (spec-014 V3, single useValidator
  // in SurveyView publishes here; identity adapter derives per-question findings).
  const validatorFindings = useWorkingCopyStore((s) => s.validatorFindings);
  const findingsByQuestionId = useMemo(
    () => buildFindingsByQuestionId(validatorFindings),
    [validatorFindings],
  );

  // Step-specific session-store writers (R7 — written before onComplete so the
  // golden-walk ordering is setIdentityResult → setSurveyContext → advance).
  const setIdentityResult = useSurveySessionStore((s) => s.setIdentityResult);
  const setSurveyContext = useSurveySessionStore((s) => s.setSurveyContext);

  function handleComplete(result: SurveyPhaseResult, identity: IdentityLiteResult) {
    // R7: identity-specific writes fire here, before onComplete → host → advance.
    setIdentityResult(identity);
    setSurveyContext(contextFromIdentity(identity));
    // Forward the phase result; host guards on SurveyPhaseResult shape and calls
    // recordPhase + routeAnswersThroughMutate.
    onComplete(result);
  }

  return (
    <IdentityLite
      context={surveyContext}
      onComplete={handleComplete}
      findingsByQuestionId={findingsByQuestionId}
    />
  );
}

// ---------------------------------------------------------------------------
// PhaseFAdapter (T009)
//
// Real adapter for helpStep — replaces TrackOneIdentityPanelAdapter
// placeholder. Reads surveyContext + findingsByQuestionId from the store
// bridge; emits the Phase F SurveyPhaseResult via onComplete.
// The host's generic path handles recordPhase + applyStepCompletion + advance.
// ---------------------------------------------------------------------------

export function PhaseFAdapter({ onComplete, onBack }: EditorStepProps) {
  const surveyContext = useSurveySessionStore((s) => s.surveyContext);
  const validatorFindings = useWorkingCopyStore((s) => s.validatorFindings);
  const findingsByQuestionId = useMemo(
    () => buildFindingsByQuestionId(validatorFindings),
    [validatorFindings],
  );

  return (
    <PhaseF
      context={surveyContext}
      onComplete={(result) => onComplete(result)}
      {...(onBack !== undefined ? { onBack } : {})}
      findingsByQuestionId={findingsByQuestionId}
    />
  );
}

// ---------------------------------------------------------------------------
// TrackStepAdapter (updated for Stage 5)
//
// Uses PhaseTrack (survey component, mocked in tests) instead of TrackStep
// (editors/panels) so the golden-walk test's vi.mock("../survey/index.ts")
// intercepts it. Writes track-specific session-store mutations BEFORE calling
// onComplete so the golden-walk ordering is preserved:
//   copy:  setSelectedTrack → onComplete → (host) advance
//   adapt: setSelectedTrack → setScaffoldSpec(null) → onComplete →
//          (host) advance → (host from advanceOutcome) setCharactersSubStage
// ---------------------------------------------------------------------------

export function TrackStepAdapter({ onComplete, onBack }: EditorStepProps) {
  const localBase = useSurveySessionStore((s) => s.localBase);
  const setSelectedTrack = useSurveySessionStore((s) => s.setSelectedTrack);
  const setScaffoldSpec = useSurveySessionStore((s) => s.setScaffoldSpec);

  if (localBase === null) {
    // Guard: base must be set before this step is shown.
    return null;
  }

  function handleTrackSelected(track: Track) {
    // R7: track-specific writes before onComplete → host → advance.
    setSelectedTrack(track);
    if (track !== "copy") {
      // Adapt-track: null scaffold spec (host's advanceOutcome carries
      // setCharactersSubStage:"prefill" which fires AFTER advance).
      setScaffoldSpec(null);
    }
    // Pass track in result for advance policy context (ctx reads selectedTrack
    // from the store, but the payload carries it for symmetry).
    onComplete({ track });
  }

  return (
    <PhaseTrack
      baseDisplayName={localBase.displayName}
      onTrackSelected={handleTrackSelected}
      onBack={onBack ?? (() => undefined)}
    />
  );
}

// ---------------------------------------------------------------------------
// ProjectNameStepAdapter (updated for Stage 5)
//
// Uses PhaseProjectName (survey component, mocked in tests). Writes
// setScaffoldSpec + setIdentity (workingCopyStore) BEFORE calling onComplete
// so the golden-walk ordering is:
//   setScaffoldSpec → setIdentity → onComplete → (host) advance →
//   (host from advanceOutcome) setCharactersSubStage
// ---------------------------------------------------------------------------

export function ProjectNameStepAdapter({ onComplete, onBack }: EditorStepProps) {
  const identityResult = useSurveySessionStore((s) => s.identityResult);
  const setScaffoldSpec = useSurveySessionStore((s) => s.setScaffoldSpec);
  const setStoreIdentity = useWorkingCopyStore((s) => s.setIdentity);

  const defaultDisplayName =
    identityResult !== null
      ? identityResult.autonym || identityResult.english
      : "";

  function handleProjectNameNext(displayName: string, keyboardId: string) {
    // R7: step-specific writes before onComplete → host → advance.
    // Order: setScaffoldSpec → setIdentity (matches pre-Stage-5 handleProjectNameNext).
    setScaffoldSpec({ keyboardId, displayName });
    setStoreIdentity({ keyboardId, displayName });
    // Host's advanceOutcome for project_name carries setCharactersSubStage:"prefill"
    // which fires AFTER advance — matching the pre-Stage-5 ordering.
    onComplete({ displayName, keyboardId });
  }

  return (
    <PhaseProjectName
      defaultDisplayName={defaultDisplayName}
      onProjectNameNext={handleProjectNameNext}
      onBack={onBack ?? (() => undefined)}
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
 * Adapter for BaseResolution. Reads the suggest target from the working-copy
 * store and passes the resolved BaseKeyboard as the step result.
 *
 * T-Stage5: calls setLocalBase (surveySessionStore) before onComplete to
 * reproduce the pre-Stage-5 handleBaseResolved mutation ordering.
 */
export function BaseResolutionAdapter({ onComplete, onBack }: EditorStepProps) {
  const identity = useWorkingCopyStore((s) => s.identity);
  const setLocalBase = useSurveySessionStore((s) => s.setLocalBase);

  const target: SuggestTarget = {
    script: identity?.targetScript ?? "Latn",
    ...(identity?.bcp47 !== undefined ? { bcp47: identity.bcp47 } : {}),
  };

  return (
    <BaseResolution
      target={target}
      onResolved={(base) => {
        // R7: setLocalBase fires before onComplete → host → advance.
        setLocalBase(base);
        onComplete({ base });
      }}
      {...(onBack !== undefined ? { onBack } : {})}
    />
  );
}

// Re-export extractIdentityLite for consumers that need it.
export { extractIdentityLite };
