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

/**
 * The canonical left-pane share of a full-bleed two-pane gallery screen
 * (MechanismGallery / TouchGallery via this shell) — the right pane (the
 * live preview) gets the remaining `100 - ASSIGN_LOOP_LEFT_PANE_PCT`. This
 * is the single source of truth for "how big does the live preview render"
 * on a full-bleed step (no persistent StudioShell right pane competing for
 * width): other full-bleed screens with their own inline live-preview
 * column (e.g. TouchSeedSourcePanel's reseed preview) should reuse this
 * constant rather than inventing their own split, so every live preview in
 * the studio occupies the same share of the screen.
 */
export const ASSIGN_LOOP_LEFT_PANE_PCT = 45;

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
  /**
   * RIGHT pane content (flexGrow 1, padded, scrollable). Caller owns any
   * loading/error conditional rendering before passing this in.
   *
   * **Optional as of spec 061 T033 (FR-024).** When omitted the right pane is
   * not rendered at all and the left pane grows to the full width, rather than
   * leaving 55% of the surface blank. Key mode uses this: it has no live OSK
   * preview to show, and the grid genuinely needs the room. Character mode
   * still passes `GalleryPreviewPane`, and `MechanismGallery` — the other
   * caller — is untouched (research D10).
   *
   * Note the distinction from passing `null`: an explicitly-passed `null` is
   * still a caller saying "render an empty right pane". Omitting the prop is
   * what collapses the split.
   */
  rightContent?: ReactNode;
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
  // `undefined` means "no right pane at all" (T033); an explicit `null` is a
  // caller asking for an empty one, and still gets the two-pane split.
  const hasRightPane = rightContent !== undefined;

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
        {/* LEFT pane — full width when there is no right pane (T033, FR-024). */}
        <div
          style={
            hasRightPane
              ? {
                  flexBasis: `${ASSIGN_LOOP_LEFT_PANE_PCT}%`,
                  flexShrink: 0,
                  borderRight: `1px solid ${BORDER}`,
                  overflowY: "auto",
                  boxSizing: "border-box",
                }
              : {
                  // No basis, no border, no shrink cap: the single pane simply
                  // takes the row. Keeping the same element (rather than
                  // branching the tree) means nothing inside it remounts when a
                  // caller toggles the right pane — which is what makes the
                  // character/key mode switch lossless (FR-025).
                  flexGrow: 1,
                  overflowY: "auto",
                  boxSizing: "border-box",
                }
          }
        >
          {leftContent}
        </div>

        {/* RIGHT pane */}
        {hasRightPane && (
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
        )}
      </div>
    </div>
  );
}
