// RemovableChipRow — shared "heading + role=group wrap of removable pill
// buttons" row for the assignment-loop galleries. Extracted from three
// near-identical blocks: MechanismGallery's "Added" chip row (coveredChars),
// MechanismGallery's "Sequences" chip row (sequenceRecordedChars), and
// TouchGallery's "Configured" chip row (per-mechanism chips from charTouch).
//
// The three sites differ in: what each chip represents (a bare char vs. a
// per-mechanism entry), the palette (green "Added"/"Configured" vs. blue
// "Sequences"), sizing (TouchGallery's chips use a smaller font + tighter-
// packed padding + nowrap), and — critically — the aria-label/title wording
// per chip. Building the `items` list (including each item's exact
// aria-label/title) stays the caller's concern; this component only renders
// the shared heading + group + chip chrome.

import type { CSSProperties, ReactNode } from "react";
import { TEXT_DIM } from "../../../lib/galleryTheme.ts";

export interface RemovableChipItem {
  /** React list key — must be unique within the row. */
  key: string;
  /** Visible chip label (already run through displayChar()/touchMechanismLabel() by the caller). */
  label: ReactNode;
  ariaLabel: string;
  title: string;
  onClick: () => void;
}

export interface RemovableChipRowProps {
  /** Row heading, e.g. <Trans id="editor.assignLoop.addedHeading">Added</Trans>. */
  heading: ReactNode;
  /** aria-label for the role="group" wrapper. */
  groupAriaLabel: string;
  items: ReadonlyArray<RemovableChipItem>;
  /** Chip palette — background/border/text color (border and "x" glyph share chipColor). */
  chipBackground: string;
  chipBorder: string;
  chipColor: string;
  /** Chip padding. Defaults to the MechanismGallery sites' "4px 8px"; TouchGallery's Configured row uses "4px 10px". */
  chipPadding?: string;
  /** Chip font size. Defaults to the MechanismGallery sites' 13; TouchGallery's Configured row uses 12. */
  chipFontSize?: number;
  /** TouchGallery's Configured row wraps longer mechanism labels with whiteSpace: "nowrap"; the other two sites don't set it. */
  chipWhiteSpaceNowrap?: boolean;
}

export function RemovableChipRow({
  heading,
  groupAriaLabel,
  items,
  chipBackground,
  chipBorder,
  chipColor,
  chipPadding = "4px 8px",
  chipFontSize = 13,
  chipWhiteSpaceNowrap = false,
}: RemovableChipRowProps) {
  const chipStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: chipPadding,
    background: chipBackground,
    border: `1px solid ${chipBorder}`,
    borderRadius: 16,
    color: chipColor,
    fontSize: chipFontSize,
    fontFamily: "monospace",
    cursor: "pointer",
    lineHeight: 1.3,
    ...(chipWhiteSpaceNowrap ? { whiteSpace: "nowrap" } : {}),
  };

  return (
    <div>
      <p
        style={{
          margin: "0 0 6px",
          fontSize: 11,
          color: TEXT_DIM,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {heading}
      </p>
      <div role="group" aria-label={groupAriaLabel} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            aria-label={item.ariaLabel}
            title={item.title}
            style={chipStyle}
          >
            {item.label}
            <span aria-hidden="true" style={{ fontSize: 11, color: chipColor, opacity: 0.7 }}>
              &times;
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
