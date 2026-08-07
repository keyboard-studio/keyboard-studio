// GalleryCardApplyRow — shared "Apply method" row for the open method card,
// bottom-right of the very card it commits. Factored out of MechanismGallery's
// `CardApplyRow` and TouchGallery's `TouchCardApplyRow`, which were byte-
// identical except for the accessible name: only the caller knows which
// character/notation belongs in the aria-label, and the lingui `t` macro
// needs its message id as a literal (never a variable) for static
// extraction, so each gallery keeps computing its own aria-label with its
// own message id and hands the finished string down here.
//
// Deliberately NOT rendered for method === "sequence" on the desktop side:
// that card holds no fields of its own (the builder opens in the right pane,
// in place of the live preview) and SequenceBuilderPanel owns its own Apply,
// so a button here would appear to commit something this card does not
// hold.
//
// Purely presentational — no assignment-shape knowledge; both callers pass
// down an already-computed aria-label and an onApply callback.

import { Trans } from "@lingui/react/macro";
import {
  galleryForwardBtnStyle as forwardBtnStyle,
  BLUE_ACTION,
  TEXT_DIM,
} from "../../../lib/galleryTheme.ts";

export interface GalleryCardApplyRowProps {
  /** Accessible name for the Apply button — computed by the caller via the
   * lingui `t` macro with its own static message id (desktop:
   * `editor.assignLoop.applyMethodAriaLabel`; touch:
   * `editor.assignLoop.touch.applyMethodAriaLabel`). */
  ariaLabel: string;
  canApply: boolean;
  onApply: () => void;
  /** Per-method testid so a test can assert WHICH card holds the Apply. */
  testId: string;
}

export function GalleryCardApplyRow({
  ariaLabel,
  canApply,
  onApply,
  testId,
}: GalleryCardApplyRowProps) {
  return (
    <div
      data-testid={testId}
      style={{
        // Mirrors galleryConfigStyle's horizontal padding so the button's
        // right edge lines up with the fields it commits.
        padding: "0 14px 12px",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <button
        type="button"
        onClick={onApply}
        disabled={!canApply}
        aria-label={ariaLabel}
        style={{
          ...forwardBtnStyle,
          background: canApply ? BLUE_ACTION : "#21262d",
          color: canApply ? "#e6edf3" : TEXT_DIM,
          cursor: canApply ? "pointer" : "not-allowed",
        }}
      >
        <Trans id="editor.assignLoop.applyMethodButton">Apply method</Trans>
      </button>
    </div>
  );
}
