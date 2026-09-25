// GalleryEmptyState — shared "guard" screen for the assignment-loop galleries
// (MechanismGallery's no-base-keyboard / no-inventory guards; TouchGallery's
// no-inventory guard). Extracted from three near-identical blocks that each
// rendered: pageStyle wrapper -> optional Back button -> a centered, dimmed
// message paragraph.
//
// MechanismGallery's two guards wrap their content in a 780px-wide outer
// container (Back button spans the wider strip; the message column below it
// is separately capped to 560px); TouchGallery's single guard uses a 560px
// outer container directly. `wrapperMaxWidth` preserves that difference —
// the inner message column stays capped at 560px unconditionally, which is a
// no-op when the wrapper itself is already 560px, so no site's rendered
// width changes.
//
// Its Back button lives in the footer (spec 081): this screen publishes it and
// is the step's only publisher while it is shown — the host gallery publishes
// only from its own main render. The page is a dead end, so there is no forward.

import type { ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  galleryPageStyle as pageStyle,
  TEXT_DIM,
} from "../../../lib/galleryTheme.ts";
import { usePublishStepNav } from "../../../hooks/usePublishStepNav.ts";

export interface GalleryEmptyStateProps {
  /** Outer content wrapper max-width in px. MechanismGallery's guards use 780 (default); TouchGallery's uses 560. */
  wrapperMaxWidth?: number;
  /** Back button handler. Omit to render no Back button (MechanismGallery's conditional-back sites pass `onBack` only when defined). */
  onBack?: () => void;
  /** aria-label for the Back button. Omit to render the button with no aria-label (MechanismGallery's guards don't set one). */
  backAriaLabel?: string;
  /** The guard message, already wrapped in its own <Trans>. */
  message: ReactNode;
}

export function GalleryEmptyState({
  wrapperMaxWidth = 780,
  onBack,
  backAriaLabel,
  message,
}: GalleryEmptyStateProps) {
  const { t } = useLingui();
  usePublishStepNav(
    onBack === undefined
      ? {}
      : {
          back: {
            label: t({ id: "editor.assignLoop.backButton", message: "← Back" }),
            onClick: onBack,
            testId: "gallery-empty-back",
            ...(backAriaLabel !== undefined ? { ariaLabel: backAriaLabel } : {}),
          },
        },
  );
  return (
    <div style={{ ...pageStyle, padding: "24px 32px" }}>
      <div style={{ maxWidth: wrapperMaxWidth, margin: "0 auto" }}>
        <div
          style={{
            maxWidth: 560,
            margin: "60px auto",
            textAlign: "center",
            color: TEXT_DIM,
          }}
        >
          <p style={{ fontSize: 15 }}>{message}</p>
        </div>
      </div>
    </div>
  );
}
