// Stub for editors/adapters/deadkeyAdapter.tsx (spec 083 Deadkeys step).
// Nav buttons publish to the footer under the real surface's handles, the
// way the real step does (spec 081); only in-page choices render in the body.
// The real DeadkeySurface renders its own in-body Back/Continue; the stub
// keeps the same testid handles ("deadkeys-back" / "deadkeys-continue") so
// walks drive the step identically.

import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

export function DeadkeyAdapter({ onComplete, onBack }: { onComplete: () => void; onBack?: () => void }) {
  usePublishStepNav({
    ...(onBack !== undefined
      ? { back: { label: "deadkeys-back", onClick: onBack, testId: "deadkeys-back" } }
      : {}),
    forward: { label: "deadkeys-continue", onClick: onComplete, testId: "deadkeys-continue" },
  });
  return <div data-testid="stage-deadkeys" />;
}
