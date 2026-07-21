// AssignLoopShell — surface-parameterized two-pane outer layout shared by
// MechanismGallery (desktop) and TouchGallery (touch). Purely presentational:
// it renders the header bar + fixed 45%/flex-grow two-pane row; all behavior
// (VFS transform, lint, loading/error gating) stays in the calling gallery,
// which supplies leftContent/rightContent as fully-composed nodes.
//
// The two galleries' header rows diverge slightly:
//   - MechanismGallery: <h1>title</h1> then a sibling <span> modality label.
//   - TouchGallery: <h1>title <span>modality label</span></h1> plus extra
//     sibling nodes (character counter, description) and a wrapping header
//     row (flexWrap: "wrap") to accommodate them.
// `modalityLabelPlacement` selects between the two; `headerExtras` carries
// the touch-only counter/description nodes. Neither gallery's outer
// flex/border/padding shell differs — that part is fully owned here.

import type { ReactNode } from "react";
import { BORDER, ACCENT, TEXT_DIM, FONT, galleryPageStyle as pageStyle } from "../../lib/galleryTheme.ts";

export interface AssignLoopShellProps {
  /** Gallery title text, e.g. "Mechanism Gallery" / "Touch Gallery". */
  headingText: string;
  /** Uppercase modality label, e.g. "Desktop" / "Touch". */
  modalityLabel: string;
  /**
   * Where the modality label renders relative to the <h1>:
   *   - "sibling" (default): a separate <span> after the heading
   *     (MechanismGallery's layout).
   *   - "inline": nested inside the <h1> itself, next to the heading text
   *     (TouchGallery's layout).
   */
  modalityLabelPlacement?: "sibling" | "inline";
  /**
   * Extra header-row nodes rendered after the modality label (TouchGallery's
   * character counter + description). When present the header row wraps
   * (flexWrap: "wrap") to accommodate them; absent, the header stays a
   * single non-wrapping row.
   */
  headerExtras?: ReactNode;
  /** LEFT pane content (flexBasis 45%, bordered, scrollable). */
  leftContent: ReactNode;
  /** RIGHT pane content (flexGrow 1, padded, scrollable). Caller owns any
   * loading/error conditional rendering before passing this in. */
  rightContent: ReactNode;
}

/**
 * Shared two-pane outer shell for the assign-loop galleries. Fixed 45% split
 * — not resizable. Renders only layout/chrome; all data/behavior comes from
 * props.
 */
export function AssignLoopShell({
  headingText,
  modalityLabel,
  modalityLabelPlacement = "sibling",
  headerExtras,
  leftContent,
  rightContent,
}: AssignLoopShellProps) {
  const modalityLabelSpan = (
    <span
      style={{
        fontSize: 12,
        color: TEXT_DIM,
        fontFamily: FONT,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        ...(modalityLabelPlacement === "inline" ? { fontWeight: 400 } : {}),
      }}
    >
      {modalityLabel}
    </span>
  );

  return (
    <div
      style={{
        ...pageStyle,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Header bar — title + modality label (+ optional extras). The primary
          forward action lives in the top toolbar row of the left pane (see
          leftContent), paired with the Back button, rather than here. */}
      <div
        style={{
          borderBottom: `1px solid ${BORDER}`,
          flexShrink: 0,
          display: "flex",
          flexDirection: "row",
          alignItems: "baseline",
          gap: 16,
          ...(headerExtras !== undefined ? { flexWrap: "wrap" as const } : {}),
          padding: "16px 24px 14px",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "1.05rem",
            fontWeight: 600,
            color: ACCENT,
            fontFamily: FONT,
            ...(modalityLabelPlacement === "inline"
              ? { display: "flex", alignItems: "center", gap: 8 }
              : {}),
          }}
        >
          {headingText}
          {modalityLabelPlacement === "inline" ? modalityLabelSpan : null}
        </h1>
        {modalityLabelPlacement === "sibling" ? modalityLabelSpan : null}
        {headerExtras}
      </div>

      {/* Two-pane row */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row",
          overflow: "hidden",
        }}
      >
        {/* LEFT pane */}
        <div
          style={{
            flexBasis: "45%",
            flexShrink: 0,
            borderRight: `1px solid ${BORDER}`,
            overflowY: "auto",
            boxSizing: "border-box",
          }}
        >
          {leftContent}
        </div>

        {/* RIGHT pane */}
        <div
          style={{
            flexGrow: 1,
            overflowY: "auto",
            padding: "24px 20px",
            boxSizing: "border-box",
          }}
        >
          {rightContent}
        </div>
      </div>
    </div>
  );
}
