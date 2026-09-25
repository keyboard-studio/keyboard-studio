// Stub for editors/touchSeedSource/TouchSeedSourcePanel.tsx (spec 035), which
// registerEditorSteps.ts renders for the "touch_seed_source" step. Two confirm
// paths let a test pick either fork choice — the footer's seed-source-confirm
// (import-adapt) and an in-body reseed button; each mirrors the real
// component by setting surveySessionStore.touchSeedSource BEFORE calling
// onComplete. Nav publishes to the footer under the real handles (spec 081).

import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

export function TouchSeedSourcePanel({
  onComplete,
  onBack,
}: {
  onComplete: (result: unknown) => void;
  onBack?: () => void;
}) {
  const setTouchSeedSource = useSurveySessionStore((s) => s.setTouchSeedSource);
  usePublishStepNav({
    ...(onBack !== undefined
      ? { back: { label: "seed-source-back", onClick: onBack, testId: "seed-source-back" } }
      : {}),
    forward: {
      label: "seed-source-confirm",
      onClick: () => {
        setTouchSeedSource("import-adapt");
        onComplete(undefined);
      },
      testId: "seed-source-confirm",
    },
  });
  return (
    <div data-testid="stage-seed-source">
      {/* An in-page choice that also completes: the reseed path. */}
      <button
        type="button"
        data-testid="seed-source-reseed-complete"
        onClick={() => {
          setTouchSeedSource("reseed-from-desktop");
          onComplete(undefined);
        }}
      >
        seed-source-reseed-complete
      </button>
    </div>
  );
}
