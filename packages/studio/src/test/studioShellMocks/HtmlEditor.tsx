// Stub for editors/assignLoop/HtmlEditor.tsx (welcome.htm editor step).

import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

export function HtmlEditor({
  onComplete,
  onBack,
}: {
  onComplete: (result: { html: string }) => void;
  onBack?: () => void;
}) {
  usePublishStepNav({
    ...(onBack !== undefined
      ? { back: { label: "html-back", onClick: onBack, testId: "html-back" } }
      : {}),
    forward: {
      label: "html-continue",
      onClick: () => onComplete({ html: "" }),
      testId: "html-continue",
    },
  });
  return <div data-testid="stage-html" />;
}
