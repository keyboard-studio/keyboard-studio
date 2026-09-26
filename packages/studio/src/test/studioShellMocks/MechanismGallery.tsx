// Stub for editors/assignLoop/MechanismGallery.tsx.
// Nav buttons publish to the footer under the real components' handles, the
// way the real step does (spec 081); only in-page choices render in the body.

import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

export function MechanismGallery({ onComplete, onBack }: { onComplete: () => void; onBack?: () => void }) {
  usePublishStepNav({
    ...(onBack !== undefined
      ? { back: { label: "mechanisms-back", onClick: onBack, testId: "mechanisms-back" } }
      : {}),
    forward: { label: "mechanisms-continue", onClick: onComplete, testId: "mechanisms-continue" },
  });
  return <div data-testid="stage-mechanisms" />;
}
