// freshSession — throw away the current project and start clean.
//
// Shared by WelcomeScreen's "Continue as guest" and the start screen's "Create a
// new keyboard". A durable draft may already have been restored at boot (main.tsx's
// pre-mount loadDraft), so a fresh start clears that draft (and the active-project
// pointer) and resets every session store, rather than keeping the restored state
// around for a later boot to re-surface.

import { discardActiveDraft } from "./draftPersistence.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useViewStateStore } from "../stores/viewStateStore.ts";
import { useStepWalkStore } from "../stores/stepWalkStore.ts";
import { useStepNavStore } from "../stores/stepNavStore.ts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";

export function startFreshSession(): void {
  discardActiveDraft();
  useSurveySessionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
  // Spec 057 FR-052: view state clears with the session. This and StudioShell's
  // handleStartOver are the only places a reset belongs.
  useViewStateStore.getState().reset();
  // Within-step positions belong to the abandoned walk — see the same call in
  // StudioShell's handleStartOver.
  useStepWalkStore.getState().reset();
  useStepNavStore.getState().reset();
  useSurveyAnswerStore.getState().reset();
  // Spec 088 FR-007: decision records reset with the answers.
  useDecisionStore.getState().reset();
}
