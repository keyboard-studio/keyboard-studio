// Stub for editors/adapters/fallbackPolicyAdapter.tsx — matches real footer nav (spec 081).

import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

export function FallbackPolicyAdapter({
  onComplete,
  onBack,
}: {
  onComplete: (r: unknown) => void;
  onBack?: () => void;
}) {
  usePublishStepNav({
    ...(onBack !== undefined
      ? { back: { label: "Back", onClick: onBack, testId: "fallback-policy-back" } }
      : {}),
    forward: {
      label: "Continue",
      onClick: () => onComplete(undefined),
      testId: "fallback-policy-continue",
    },
  });
  return <div data-testid="stage-fallback_policy" />;
}
