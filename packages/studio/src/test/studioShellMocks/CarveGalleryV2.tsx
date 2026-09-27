// Stub for editors/carve/CarveGalleryV2.tsx, the carve gallery carveAdapter.tsx renders.
// Nav buttons publish to the footer under the real components' handles, the
// way the real step does (spec 081); only in-page choices render in the body.

import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

export function CarveGalleryV2({ onComplete, onBack }: { onComplete: () => void; onBack?: () => void }) {
  usePublishStepNav({
    ...(onBack !== undefined ? { back: { label: "carve-back", onClick: onBack, testId: "carve-back" } } : {}),
    forward: { label: "carve-continue", onClick: onComplete, testId: "carve-continue" },
  });
  return <div data-testid="stage-carve" />;
}
