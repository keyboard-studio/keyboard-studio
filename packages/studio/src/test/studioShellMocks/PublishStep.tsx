// Stub for editors/assignLoop/PublishStep.tsx (the publish step, spec 113).
// Nav buttons publish to the footer under the real component's handles, the
// way the real step does (spec 081); only a stage marker renders in the body.
// Completes unsubmitted — the stub never submits a managed PR.

import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

export function PublishStep({
  onComplete,
  onBack,
}: {
  onComplete: (r: unknown) => void;
  onBack?: () => void;
}) {
  usePublishStepNav({
    ...(onBack !== undefined
      ? { back: { label: "Back", onClick: onBack, testId: "publish-back" } }
      : {}),
    forward: {
      label: "Finish",
      onClick: () => onComplete({ submitted: false }),
      testId: "publish-finish",
    },
  });
  return <div data-testid="stage-publish" />;
}
