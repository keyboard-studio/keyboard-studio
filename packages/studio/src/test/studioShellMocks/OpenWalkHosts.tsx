// Stubs for survey/openWalk/MissingLettersHost.tsx and UpgradesHost.tsx (spec 111),
// which registerEditorSteps.ts renders for the Open-only Missing letters and Upgrades
// steps. They complete on survey-advance, like the Languages stub.

import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

function makeStub(testId: string) {
  return function Stub({
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
    return <div data-testid={testId} />;
  };
}

export const MissingLettersHost = makeStub("stage-open-missing-letters");
export const UpgradesHost = makeStub("stage-open-upgrades");
