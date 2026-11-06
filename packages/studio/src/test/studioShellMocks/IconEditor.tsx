// Stub for editors/assignLoop/IconEditor.tsx (the icon step).
// Nav buttons publish to the footer under the real component's handles, the
// way the real step does (spec 081); only a stage marker renders in the body.

import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

export function IconEditor({
  onComplete,
  onBack,
}: {
  onComplete: (r: unknown) => void;
  onBack?: () => void;
}) {
  usePublishStepNav({
    ...(onBack !== undefined
      ? { back: { label: "Back", onClick: onBack, testId: "icon-back" } }
      : {}),
    forward: {
      label: "Continue",
      onClick: () => onComplete({ iconIcoBase64: "", iconPngDataUrl: "" }),
      testId: "icon-continue",
    },
  });
  return <div data-testid="stage-icon" />;
}
