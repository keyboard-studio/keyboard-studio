// Stub for editors/assignLoop/CssEditor.tsx (CSS editor step).

import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

export function CssEditor({
  onComplete,
  onBack,
}: {
  onComplete: (result: { css: string }) => void;
  onBack?: () => void;
}) {
  usePublishStepNav({
    ...(onBack !== undefined
      ? { back: { label: "css-back", onClick: onBack, testId: "css-back" } }
      : {}),
    forward: {
      label: "css-continue",
      onClick: () => onComplete({ css: "" }),
      testId: "css-continue",
    },
  });
  return <div data-testid="stage-css" />;
}
