// Stub for editors/assignLoop/TrialStep.tsx (the trial step, spec 113).
// Nav buttons publish to the footer under the real component's handles, the
// way the real step does (spec 081); only a stage marker renders in the body.
// Completes with zero builds at completion — the stub makes no test build.

import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

export function TrialStep({
  onComplete,
  onBack,
}: {
  onComplete: (r: unknown) => void;
  onBack?: () => void;
}) {
  usePublishStepNav({
    ...(onBack !== undefined
      ? { back: { label: "Back", onClick: onBack, testId: "trial-back" } }
      : {}),
    forward: {
      label: "Continue",
      onClick: () => onComplete({ buildsAtCompletion: 0 }),
      testId: "trial-continue",
    },
  });
  return <div data-testid="stage-trial" />;
}
