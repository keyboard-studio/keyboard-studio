// Stub for editors/assignLoop/TouchGallery.tsx. Continue completes with
// whatever a test put in `touchEAssignments.current` beforehand (default: no
// assignments).
// Nav buttons publish to the footer under the real components' handles, the
// way the real step does (spec 081); only in-page choices render in the body.

import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

/** The assignments the stub's Continue button emits. Tests set it before clicking `touch-continue`. */
export const touchEAssignments = { current: [] as unknown[] };

export function TouchGallery({ onComplete, onBack }: { onComplete: (a: unknown[]) => void; onBack: () => void }) {
  usePublishStepNav({
    back: { label: "Back", onClick: onBack, testId: "touch-back" },
    forward: { label: "Continue", onClick: () => onComplete(touchEAssignments.current), testId: "touch-continue" },
  });
  return <div data-testid="stage-E" />;
}
