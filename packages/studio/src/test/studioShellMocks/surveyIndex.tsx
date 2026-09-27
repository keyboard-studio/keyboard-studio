// Stub for survey/index.ts — IdentityLite, Prefill and PhaseB render one
// button per callback so a test can click through the wizard; the rest are
// inert.

import { fakeIdentity, fakePhaseResult } from "./fakes.ts";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

export function IdentityLite({ onComplete }: { onComplete: (result: unknown, identity: unknown) => void }) {
  // Stands in for IdentityLite's SurveyRunner, so it publishes under SurveyRunner's handle.
  usePublishStepNav({
    forward: {
      label: "survey-advance",
      onClick: () => onComplete(fakePhaseResult, fakeIdentity),
      testId: "survey-advance",
    },
  });
  return <div data-testid="stage-identity" />;
}

export function Prefill({ onConfirm, onBack }: { onConfirm: () => void; onBack?: () => void }) {
  usePublishStepNav({
    ...(onBack !== undefined ? { back: { label: "prefill-back", onClick: onBack, testId: "prefill-back" } } : {}),
    forward: { label: "prefill-confirm", onClick: onConfirm, testId: "prefill-confirm" },
  });
  return <div data-testid="stage-prefill" />;
}

export function PhaseB({ onComplete, onBack }: { onComplete: (r: unknown) => void; onBack?: () => void }) {
  usePublishStepNav({
    ...(onBack !== undefined ? { back: { label: "phase-b-back", onClick: onBack, testId: "phase-b-back" } } : {}),
    forward: { label: "phase-b-done", onClick: () => onComplete(fakePhaseResult), testId: "phase-b-done" },
  });
  return <div data-testid="stage-B" />;
}

export const PhaseA = () => <div data-testid="stage-A" />;
export const SurveyRunner = () => <div data-testid="survey-runner" />;
export const extractIdentityLite = (r: unknown) => r;
export const extractIdentity = () => ({});
export const extractProvenance = () => ({});
export const buildPrefillRows = () => [];
