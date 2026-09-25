// Stub for editors/panels/BaseResolution.tsx — preview-before-commit contract.
// Two separate buttons mirror the two real user actions (a suggestion-card
// click fires onPreview; "Choose this keyboard" fires onConfirm) as two
// SEPARATE click events: the real BaseResolutionAdapter's onConfirm closes
// over the store's localBase from its own render, so a preview must flush (and
// the adapter re-render with the new closure) before confirm fires, exactly as
// two distinct user clicks would.

import { fakeBase } from "./fakes.ts";

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
  return (
    <div data-testid="stage-base">
      <button type="button" data-testid="base-preview" onClick={() => onPreview(fakeBase)}>
        base-preview
      </button>
      <button type="button" data-testid="base-confirm" disabled={previewedBase === null} onClick={onConfirm}>
        base-confirm
      </button>
      {onBack !== undefined && (
        <button type="button" data-testid="base-back" onClick={onBack}>
          base-back
        </button>
      )}
    </div>
  );
}
