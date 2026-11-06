// Stub for survey/languageList/LanguageListHost.tsx (spec 111), which
// registerEditorSteps.ts renders for the Open-only "open_languages" step.
// Completes on survey-advance, like the attribution stub; nav publishes to the
// footer under the real handles (spec 081).

import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

export function LanguageListHost({
  onComplete,
  onBack,
}: {
  onComplete: (result: unknown) => void;
  onBack?: () => void;
}) {
  usePublishStepNav({
    ...(onBack !== undefined
      ? { back: { label: "survey-back", onClick: onBack, testId: "survey-back" } }
      : {}),
    forward: { label: "survey-advance", onClick: () => onComplete(undefined), testId: "survey-advance" },
  });
  return <div data-testid="stage-open-languages" />;
}
