// GalleryCardApplyRow — shared "Apply method" control for the open method
// card, top-right of the card's header, on the same line as its title.
// Rendered as a sibling of the header's title-toggle button inside a flex
// row (never nested inside it — a `<button>` cannot contain another
// `<button>`). Factored out of MechanismGallery's `CardApplyRow` and
// TouchGallery's `TouchCardApplyRow`, which were byte-identical except for
// the accessible name: only the caller knows which character/notation
// belongs in the aria-label, and the lingui `t` macro needs its message id
// as a literal (never a variable) for static extraction, so each gallery
// keeps computing its own aria-label with its own message id and hands the
// finished string down here.
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
    <button
      type="button"
      data-testid={testId}
      onClick={onApply}
      disabled={!canApply}
      aria-label={ariaLabel}
      style={{
        ...forwardBtnStyle,
        flexShrink: 0,
        marginRight: 14,
        padding: "6px 16px",
        background: canApply ? BLUE_ACTION : "#21262d",
        color: canApply ? "#e6edf3" : TEXT_DIM,
        cursor: canApply ? "pointer" : "not-allowed",
      }}
    >
      <Trans id="editor.assignLoop.applyMethodButton">Apply method</Trans>
    </button>
  );
}
