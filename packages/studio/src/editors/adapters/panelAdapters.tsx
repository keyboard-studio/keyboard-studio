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
//     - IdentityLiteAdapter (identityStep): writes NOTHING (spec 089) — it
//       forwards the result; the identity step's effects are the recorded
//       decisions and il_copyright_holder's apply, both at StepHost's
//       boundary. Its context and resume are decision-derived (FR-005).
//     - BaseResolutionAdapter (chooseBaseStep): the base-keyboard gallery
//       host wrapper (spec 090 T013) — the decision write is the hosted
//       renderer's onChange; setLocalBase is called before onComplete as
//       the preview/compile channel only.
//     - ScaffoldFormAdapter: retained (legacy; not in manifest).
//     - TrackOneIdentityPanelAdapter: stub for the reserved "package" step.
//
// STEP-SPECIFIC EFFECT PLACEMENT (research R7):
//   The host's generic onComplete path is:
//     [recordPhase + recordAnswersAsDecisions + applyDecisionEffects if SurveyPhaseResult]
//     [applyStepCompletion if step in STEPS_WITH_APPLY_COMPLETION]
//     advance → session.advance(next)
//     [setCharactersSubStage if advanceOutcome carries it]
//   For steps whose handlers call store mutators BEFORE advance
//   (setLocalBase), those writes are placed
//   in the ADAPTER so they fire before onComplete triggers the host's advance call.
//
// Boundary: editors/adapters/ → stores/ and hooks/ is allowed by depcruise.

import { useMemo } from "react";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { useGitHubAuth } from "../../hooks/useGitHubAuth.ts";
import { useValidatorFindings } from "../../hooks/useValidatorFindings.ts";
import type { EditorStepProps } from "../../steps/types.ts";
import { GalleryHost } from "../../steps/galleryHost.tsx";
import { buildGalleryHostDeps } from "../../lib/galleryHostDeps.ts";
import baseKeyboardModule from "../../survey/questions/gallery/baseKeyboard.ts";
import type { BasePreviewExtras } from "../../survey/chooseBase/BaseKeyboardRenderer.tsx";
import { ScaffoldForm } from "../panels/ScaffoldForm.tsx";
import type { ScaffoldSpec } from "../../hooks/useKeyboardArtifact.ts";
import { TrackOneIdentityPanel } from "../panels/TrackOneIdentityPanel.tsx";
import type { SuggestTarget } from "../../lib/suggestBase.ts";
import { useBasePreviewStatusStore } from "../../stores/basePreviewStatusStore.ts";
import { IdentityLite } from "../../survey/index.ts";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import {
  deriveIdentityResult,
  deriveIdentityResume,
  deriveSurveyContext,
} from "../../decisions/identitySelectors.ts";

// ---------------------------------------------------------------------------
// IdentityLiteAdapter (T008)
//
// Real adapter for identityStep — replaces TrackOneIdentityPanelAdapter
// placeholder. Spec 089: the adapter WRITES NOTHING. The identity step's
// effects are the recorded decisions (StepHost's recordAnswersAsDecisions)
// and il_copyright_holder's apply landing the attribution on the working
// copy (StepHost's applyDecisionEffects) — the session fields this adapter
// used to write (identityResult, surveyContext, identityPhaseResult) and
// the working-copy attribution write are all derived or applied at the
// host boundary now. What the adapter still owns is presentation wiring:
// the decision-derived context, the authenticated-profile seed, and the
// decision-derived resume payload.
// ---------------------------------------------------------------------------

export function IdentityLiteAdapter({ onComplete }: EditorStepProps) {
  const decisions = useDecisionStore((s) => s.decisions);
  // The live context prop, derived from the recorded decisions (FR-005) —
  // the successor to the stored surveyContext this adapter used to write.
  const surveyContext = deriveSurveyContext(decisions);
  // Derive per-question findings from the V3 store bridge (spec-014).
  const findingsByQuestionId = useValidatorFindings();
  // Only the profile fields are read here; the auth STATUS is irrelevant to
  // identity capture, and a guest simply gets no seed (D6 then requires a typed
  // name before emission).
  const { authorName, authorEmail } = useGitHubAuth();
  // Prior completed run, rebuilt from the decisions — lets a history pop back
  // onto this step resume the flow at its last question instead of replaying
  // from question 1.
  const identityResume = deriveIdentityResume(decisions);

  function handleComplete(result: SurveyPhaseResult) {
    // Forward the phase result only; the host guards on SurveyPhaseResult
    // shape and runs recordPhase + recordAnswersAsDecisions +
    // applyDecisionEffects.
    onComplete(result);
  }

  return (
    <IdentityLite
      // spec 064 D7: pre-fill attribution from the authenticated profile so the
      // author confirms rather than types. Absent fields fall through to asking.
      authorSeed={{ name: authorName, email: authorEmail }}
      context={surveyContext}
      onComplete={handleComplete}
      findingsByQuestionId={findingsByQuestionId}
      {...(identityResume ? { resume: identityResume } : {})}
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
// BaseResolutionAdapter (preview-before-commit; gallery host wrapper since
// spec 090 T013)
//
// BaseResolution separates PREVIEW (every search-result / suggestion-card
// click) from COMMIT (the single "Choose this keyboard" button). Preview
// writes setLocalBase (which drives the live compile pipeline in StudioShell)
// WITHOUT calling onComplete — the wizard does not advance and the working
// copy is not instantiated. Commit lives in the hosted renderer
// (survey/chooseBase/BaseKeyboardRenderer.tsx): it runs the F1 rebase-confirm
// gate (confirmRebaseTo) SYNCHRONOUSLY, before anything else — window.confirm
// is itself synchronous, so a Cancel returns immediately and neither the
// decision record nor onComplete ever fire; the wizard stays on the picker
// and the working copy/draft are untouched. On confirm the renderer records
// the `base-keyboard` decision through the host's onChange (which arms
// StudioShell's single-instantiation effect, see StudioShell.tsx) BEFORE
// calling onComplete, preserving the R7 "writes before advance" ordering.
// See docs/design-notes/switch-base-popup-behavior-log.md (F1) for why this
// check cannot live in StudioShell's effect: an effect runs AFTER the click
// that already triggered advance() — it can observe a cancelled confirm but
// can no longer un-advance the wizard.
// ---------------------------------------------------------------------------

/**
 * Adapter for BaseResolution. Reads the suggest target from the identity
 * result derived over the decision store (spec 089 FR-005 — recorded by the
 * identity step's completion before this step is reached).
 *
 * previewStatus is read from basePreviewStatusStore (published by
 * StudioShell's SurveyView) so this adapter never imports useKeyboardArtifact
 * or the compile pipeline directly.
 */
export function BaseResolutionAdapter({ onComplete, onBack }: EditorStepProps) {
  const decisions = useDecisionStore((s) => s.decisions);
  const identityResult = deriveIdentityResult(decisions);
  const localBase = useSurveySessionStore((s) => s.localBase);
  const setLocalBase = useSurveySessionStore((s) => s.setLocalBase);

  const previewStatus = useBasePreviewStatusStore((s) => s.status);

  // Spec 090 T013: the adapter is now the gallery-host WRAPPER for the
  // base-keyboard module. The decision write (the confirm) lives in the
  // renderer (survey/chooseBase/BaseKeyboardRenderer.tsx) and reports
  // through the host's onChange; StudioShell's instantiation effect arms
  // off the recorded decision, so `setBaseConfirmed` is gone entirely.
  // What remains here is host-layer plumbing: the suggest target and the
  // preview channel — `setLocalBase` drives StudioShell's live compile
  // pipeline for the PREVIEWED base (preview-before-commit), exactly as
  // StudioShell's own restore path writes it; a preview is not a decision
  // and records nothing.
  const record = useDecisionStore((s) => s.decisions["base-keyboard"]);
  const deps = useMemo(buildGalleryHostDeps, []);

  // `||` not `??`: prefill.script can be "" (no script selected for an
  // unrecognized language), which must also fall back.
  const target: SuggestTarget = {
    script: identityResult?.prefill.script || "Latn",
    ...(identityResult?.bcp47 ? { bcp47: identityResult.bcp47 } : {}),
  };

  const basePreview: BasePreviewExtras = {
    target,
    previewedBase: localBase,
    previewStatus,
    onPreview: (base) => {
      setLocalBase(base);
    },
  };

  return (
    <GalleryHost
      module={baseKeyboardModule}
      record={record}
      stepId="choose_base"
      deps={deps}
      stepContext={{
        onComplete,
        ...(onBack !== undefined && { onBack }),
        extras: { basePreview },
      }}
    />
  );
}
