// Stub for editors/panels/BaseResolution.tsx — preview-before-commit contract.
// Two separate buttons mirror the two real user actions (a suggestion-card
// click fires onPreview; "Choose this keyboard" fires onConfirm) as two
// SEPARATE click events: the real BaseResolutionAdapter's onConfirm closes
// over the store's localBase from its own render, so a preview must flush (and
// the adapter re-render with the new closure) before confirm fires, exactly as
// two distinct user clicks would.

// Nav buttons publish to the footer under the real components' handles, the
// way the real step does (spec 081); only in-page choices render in the body.

import { fakeBase } from "./fakes.ts";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

export function BaseResolution({
  onPreview,
  onConfirm,
  previewedBase,
  onBack,
}: {
  onPreview: (base: unknown) => void;
  onConfirm: () => void;
  previewedBase: unknown;
  previewStatus: string;
  onBack?: () => void;
}) {
  usePublishStepNav({
    ...(onBack !== undefined ? { back: { label: "base-back", onClick: onBack, testId: "base-back" } } : {}),
    forward: { label: "base-confirm", onClick: onConfirm, testId: "base-confirm", disabled: previewedBase === null },
  });
  return (
    <div data-testid="stage-base">
      <button type="button" data-testid="base-preview" onClick={() => onPreview(fakeBase)}>
        base-preview
      </button>
    </div>
  );
}
