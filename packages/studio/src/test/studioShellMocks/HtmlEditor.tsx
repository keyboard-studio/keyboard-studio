// Stub for editors/assignLoop/HtmlEditor.tsx (the html step).
// Nav buttons publish to the footer under the real component's handles, the
// way the real step does (spec 081); only a stage marker renders in the body.

import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

export function HtmlEditor({ onComplete, onBack }: { onComplete: (r: unknown) => void; onBack?: () => void }) {
  usePublishStepNav({
    ...(onBack !== undefined
      ? { back: { label: "Back", onClick: onBack, testId: "html-back" } }
      : {}),
    forward: { label: "Continue", onClick: () => onComplete({ html: "" }), testId: "html-continue" },
  });
  return <div data-testid="stage-html" />;
}
