// Stub for editors/touchSeedSource/TouchSeedSourcePanel.tsx (spec 035), which
// registerEditorSteps.ts renders for the "touch_seed_source" step. Two confirm
// buttons let a test pick either fork choice; each mirrors the real
// component by setting surveySessionStore.touchSeedSource BEFORE calling
// onComplete.

import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";

export function TouchSeedSourcePanel({
  onComplete,
  onBack,
}: {
  onComplete: (result: unknown) => void;
  onBack?: () => void;
}) {
  const setTouchSeedSource = useSurveySessionStore((s) => s.setTouchSeedSource);
  return (
    <div data-testid="stage-seed-source">
      <button
        type="button"
        data-testid="seed-source-complete"
        onClick={() => {
          setTouchSeedSource("import-adapt");
          onComplete(undefined);
        }}
      >
        seed-source-complete
      </button>
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
      {onBack !== undefined && (
        <button type="button" data-testid="seed-source-back" onClick={onBack}>
          seed-source-back
        </button>
      )}
    </div>
  );
}
