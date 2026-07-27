// CharactersStep — self-contained characters step adapter (spec 027 Stage 4).
//
// Owns the prefill -> PhaseB substage internally. Satisfies EditorStepProps so
// the manifest can drive it as a component (first runtime use of step.component).
//
// Store reads:
//   surveySessionStore: identityResult, localBase, surveyContext, charactersSubStage
//   workingCopyStore:   validatorFindings (via useValidatorFindings hook)
//
// No survey-level side effects (Article IV / G2): the component reports
// completion and back via props; the host (SurveyView) runs the reducer path.
//
// placementMap is intentionally omitted from PhaseB props (D-INT-2, v1).

import type { ComponentType } from "react";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import type { EditorStepProps } from "../steps/types.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { usePhaseBDraftStore, draftConfirmedAlphabet } from "../stores/phaseBDraftStore.ts";
import { useValidatorFindings } from "../hooks/useValidatorFindings.ts";
import { Prefill, PhaseB } from "./index.ts";

/**
 * Self-contained characters step adapter.
 *
 * Hosts the prefill -> PhaseB substage driven by the persisted
 * `charactersSubStage` store slot, so back-from-carve remounts at PhaseB
 * rather than replaying prefill (spec 027 §4).
 */
const CharactersStep: ComponentType<EditorStepProps> = ({
  onComplete,
  onBack,
}: EditorStepProps) => {
  // --- store reads (selectors) ---
  const identityResult = useSurveySessionStore((s) => s.identityResult);
  const localBase = useSurveySessionStore((s) => s.localBase);
  const surveyContext = useSurveySessionStore((s) => s.surveyContext);
  const charactersSubStage = useSurveySessionStore((s) => s.charactersSubStage);
  const setCharactersSubStage = useSurveySessionStore((s) => s.setCharactersSubStage);
  const resetPhaseBDraft = usePhaseBDraftStore((s) => s.reset);

  const findingsByQuestionId = useValidatorFindings();

  // Guard: prefill requires both identity and base (unreachable once the step
  // is properly entered, but matches today's null fallback).
  if (charactersSubStage === "prefill") {
    if (identityResult === null || localBase === null) {
      return null;
    }
    return (
      <Prefill
        identity={identityResult}
        base={localBase}
        onConfirm={() => {
          // Fresh draft alphabet each time the build-list screen is (re)entered
          // (spec character-map pane work) — NOT on every BuildListView/
          // CharacterMapPane render, only on this prefill -> B transition.
          resetPhaseBDraft();
          setCharactersSubStage("B");
        }}
        onBack={() => onBack?.()}
      />
    );
  }

  // substage === "B"
  // NOTE: placementMap intentionally omitted (D-INT-2).
  return (
    <PhaseB
      context={surveyContext}
      onComplete={(result) => {
        // Commit the three-store ConfirmedAlphabet alongside the flat
        // confirmedInventory (spec 046 US5): the build-list draft store is
        // canonical for it; a manual-flow completion leaves the draft empty,
        // so the field stays absent there (additive optional).
        const phaseResult = result as SurveyPhaseResult;
        const alphabet = draftConfirmedAlphabet();
        const hasStores =
          alphabet.bases.length > 0 ||
          alphabet.marks.length > 0 ||
          alphabet.attestedStacks.length > 0;
        onComplete(hasStores ? { ...phaseResult, alphabet } : phaseResult);
      }}
      onBack={() => setCharactersSubStage("prefill")}
      findingsByQuestionId={findingsByQuestionId}
    />
  );
};

export { CharactersStep };
