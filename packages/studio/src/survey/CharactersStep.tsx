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

import { useEffect, useRef, type ComponentType } from "react";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import type { EditorStepProps } from "../steps/types.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { usePhaseBDraftStore, draftConfirmedAlphabet } from "../stores/phaseBDraftStore.ts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { peekStepCursor } from "../stores/stepWalkStore.ts";
import { useValidatorFindings } from "../hooks/useValidatorFindings.ts";
import { Prefill, PhaseB } from "./index.ts";

// Manifest step id — matches steps/manifest.ts's "characters" entry.
//
// SINGLE WRITER (spec 079 T035/T081/FR-004): this component is the ONLY place
// that writes this step's surveyAnswerStore position. Two writers sharing one
// slot (this component's coarse "prefill"/"B" and PhaseB's own "intro"/
// "build-list") used to overwrite each other and race on restore; now the
// vocabulary is PhaseB's screen id — "prefill" | "intro" | "build-list" — all
// written from here by combining `charactersSubStage` with `discoveryMethod`
// (both already live in surveySessionStore). While discoveryMethod ===
// "manual" the position is instead a question id owned entirely by
// SurveyRunner's own per-question cursor (spec 079 T031, same step id) — this
// component must never write while manual, and PhaseB writes nothing here at
// all any more (see PhaseB.tsx's module comment).
//
// Restore-from-position is a fallback only: charactersSubStage and
// discoveryMethod are themselves already restored via surveySessionStore's
// own persisted snapshot on an app reload, so this only fills the gap for a
// same-session deep link (lib/jumpToLocation.ts writes the position directly,
// ahead of the remount that reads it) or a bare mock (a mocked PhaseB in a
// unit test) that never reaches PhaseB's own state to restore it.
const CHARACTERS_STEP_ID = "characters";

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
  const discoveryMethod = useSurveySessionStore((s) => s.discoveryMethod);
  const setDiscoveryMethod = useSurveySessionStore((s) => s.setDiscoveryMethod);
  const resetPhaseBDraft = usePhaseBDraftStore((s) => s.reset);
  const setPosition = useSurveyAnswerStore((s) => s.setPosition);

  const findingsByQuestionId = useValidatorFindings();

  // Restore, once, on a fresh mount: if charactersSubStage is still at its
  // default "prefill" but a finer position was saved for this step, the
  // author had reached "B" before — land there rather than replaying prefill
  // (FR-004), also restoring `discoveryMethod` so PhaseB renders the right
  // branch immediately (IntroChooser / BuildListView / the manual
  // SurveyRunner walk) instead of always landing back on the intro chooser.
  // A saved token that is neither "intro" nor "build-list" is a SurveyRunner
  // question id (the manual path) — SurveyRunner reads the SAME saved
  // position itself (its own restore, spec 079 T031) once discoveryMethod
  // says "manual", so nothing further is written here for that case.
  // Only fires once per mount; a genuine Back to prefill afterwards is the
  // author's own choice and must not be reverted by this effect running
  // again.
  const restoredOnce = useRef(false);
  useEffect(() => {
    if (restoredOnce.current) return;
    restoredOnce.current = true;
    if (charactersSubStage === "prefill") {
      const saved = peekStepCursor(CHARACTERS_STEP_ID);
      if (saved !== undefined && saved !== "prefill") {
        setCharactersSubStage("B");
        if (saved === "build-list") setDiscoveryMethod("build-list");
        else if (saved !== "intro") setDiscoveryMethod("manual");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once by design (restoredOnce guard)
  }, []);

  // Mirror the step's position into the answer store on every change — the
  // ONLY writer for this step's position slot (see the module comment
  // above). While inside "B" the value is `discoveryMethod`'s own vocabulary
  // ("intro" for the chooser, "build-list" once chosen); while
  // discoveryMethod === "manual" nothing is written here at all —
  // SurveyRunner owns that finer per-question cursor.
  useEffect(() => {
    if (charactersSubStage === "prefill") {
      setPosition(CHARACTERS_STEP_ID, "prefill");
      return;
    }
    if (discoveryMethod === "manual") return;
    setPosition(CHARACTERS_STEP_ID, discoveryMethod === null ? "intro" : discoveryMethod);
  }, [charactersSubStage, discoveryMethod, setPosition]);

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
        // Conditionally spread (not `() => onBack?.()`) — F7 sweep: an
        // always-truthy wrapper would make Prefill always render its own Back
        // button (Prefill gates on `onBack !== undefined`) even when StepHost
        // omitted onBack because there is genuinely nothing to back into.
        {...(onBack !== undefined ? { onBack } : {})}
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
        // confirmedInventory (spec 071 US5): the build-list draft store is
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
