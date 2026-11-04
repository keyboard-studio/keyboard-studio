// Stub for editors/adapters/oskAdapter.tsx (the osk step's host).
// Nav buttons publish to the footer under the real component's handles, the
// way the real step does (spec 081); only a stage marker renders in the body.

import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

export function OskEditorAdapter({ onComplete, onBack }: { onComplete: (r: unknown) => void; onBack?: () => void }) {
  usePublishStepNav({
    ...(onBack !== undefined
      ? { back: { label: "Back", onClick: onBack, testId: "osk-back" } }
      : {}),
    forward: { label: "Continue", onClick: () => onComplete({}), testId: "osk-continue" },
  });
  return <div data-testid="stage-osk" />;
}
