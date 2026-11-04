// Stub for editors/adapters/oskAdapter.tsx (OSK editor step).
// Nav publishes to the footer under the real handles (spec 081).

import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

export function OskEditorAdapter({
  onComplete,
  onBack,
}: {
  onComplete: () => void;
  onBack?: () => void;
}) {
  usePublishStepNav({
    ...(onBack !== undefined
      ? { back: { label: "osk-back", onClick: onBack, testId: "osk-back" } }
      : {}),
    forward: { label: "osk-continue", onClick: onComplete, testId: "osk-continue" },
  });
  return <div data-testid="stage-osk" />;
}
