// Stub for survey/index.ts — IdentityLite, Prefill and PhaseB render one
// button per callback so a test can click through the wizard; the rest are
// inert.

import { fakeIdentity, fakePhaseResult } from "./fakes.ts";

export function IdentityLite({ onComplete }: { onComplete: (result: unknown, identity: unknown) => void }) {
  return (
    <div data-testid="stage-identity">
      <button
        type="button"
        data-testid="identity-complete"
        onClick={() => onComplete(fakePhaseResult, fakeIdentity)}
      >
        identity-complete
      </button>
    </div>
  );
}

export function Prefill({ onConfirm, onBack }: { onConfirm: () => void; onBack?: () => void }) {
  return (
    <div data-testid="stage-prefill">
      <button type="button" data-testid="prefill-confirm" onClick={onConfirm}>
        prefill-confirm
      </button>
      {onBack !== undefined && (
        <button type="button" data-testid="prefill-back" onClick={onBack}>
          prefill-back
        </button>
      )}
    </div>
  );
}

export function PhaseB({ onComplete, onBack }: { onComplete: (r: unknown) => void; onBack?: () => void }) {
  return (
    <div data-testid="stage-B">
      <button type="button" data-testid="phaseB-complete" onClick={() => onComplete(fakePhaseResult)}>
        phaseB-complete
      </button>
      {onBack !== undefined && (
        <button type="button" data-testid="phaseB-back" onClick={onBack}>
          phaseB-back
        </button>
      )}
    </div>
  );
}

export const PhaseA = () => <div data-testid="stage-A" />;
export const SurveyRunner = () => <div data-testid="survey-runner" />;
export const extractIdentityLite = (r: unknown) => r;
export const extractIdentity = () => ({});
export const extractProvenance = () => ({});
export const buildPrefillRows = () => [];
