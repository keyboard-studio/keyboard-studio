// Stub for editors/assignLoop/CssEditor.tsx (the css step).
// Nav buttons publish to the footer under the real component's handles, the
// way the real step does (spec 081); only a stage marker renders in the body.

import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

export function CssEditor({ onComplete, onBack }: { onComplete: (r: unknown) => void; onBack?: () => void }) {
  usePublishStepNav({
    ...(onBack !== undefined
      ? { back: { label: "Back", onClick: onBack, testId: "css-back" } }
      : {}),
    forward: { label: "Continue", onClick: () => onComplete({ css: "" }), testId: "css-continue" },
  });
  return <div data-testid="stage-css" />;
}
