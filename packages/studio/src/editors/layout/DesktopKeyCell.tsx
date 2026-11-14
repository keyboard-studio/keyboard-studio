// DesktopKeyCell — one key of the desktop layout grid (spec 117 FR-010..FR-012, FR-040).
//
// A `role="gridcell"` button rendered from a `DesktopCellViewModel`: the output display, a
// provenance word, and a padlock when the cell is read-only. Everything visual is also in the
// accessible name (`useLayoutCopy().cellAriaLabel`), so the decorations are aria-hidden. Frame
// keys are drawn and focusable (arrow navigation passes through them) but carry no output and
// no provenance, and are never editable.
//
// Phase 3 is read-only: the cell only selects. Phase 4 hangs the edit entry point off the
// selected cell's detail panel, not off the cell.

import type { DesktopCellViewModel } from "./desktopGridViewModel.ts";
import { displayChar } from "../../lib/irToCarveNodes.ts";
import { BG_CARD, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT } from "../../lib/galleryTheme.ts";
import { FONT_MONO } from "../../ui/theme.ts";
import { useLayoutCopy } from "./useLayoutCopy.ts";

export interface DesktopKeyCellProps {
  cell: DesktopCellViewModel;
  /** 1-based row index, mirrors `aria-rowindex`. */
  rowIndex: number;
  /** 1-based column index within the row, counting every key (frame keys included), mirrors `aria-colindex`. */
  colIndex: number;
  /** Percentage of the grid's width the cell occupies. */
  widthPercent: number;
  isSelected: boolean;
  isTabbable: boolean;
  onSelect: (vkey: string) => void;
  /** Registers the cell's DOM node with the grid's focus-follow map. */
  registerRef: (vkey: string, el: HTMLButtonElement | null) => void;
}

/** What to draw as the cell's main glyph. */
function glyphOf(cell: DesktopCellViewModel): string | null {
  if (cell.deadkey !== undefined) return cell.deadkey.display;
  if (cell.display !== null && cell.display !== "") return displayChar(cell.display);
  return null;
}

export function DesktopKeyCell({
  cell,
  rowIndex,
  colIndex,
  widthPercent,
  isSelected,
  isTabbable,
  onSelect,
  registerRef,
}: DesktopKeyCellProps) {
  const copy = useLayoutCopy();
  const glyph = glyphOf(cell);
  const readOnly = !cell.editable;
  const stale = cell.state !== "ready" && !cell.frame;

  return (
    <button
      type="button"
      role="gridcell"
      ref={(el) => registerRef(cell.vkey, el)}
      data-testid={`layout-cell-${cell.vkey}`}
      data-kind={cell.kind}
      data-provenance={cell.provenance ?? "none"}
      data-provisional={cell.provisional ? "true" : "false"}
      data-editable={cell.editable ? "true" : "false"}
      aria-rowindex={rowIndex}
      aria-colindex={colIndex}
      aria-selected={isSelected}
      aria-readonly={readOnly ? true : undefined}
      aria-label={copy.cellAriaLabel(cell)}
      tabIndex={isTabbable ? 0 : -1}
      onClick={() => onSelect(cell.vkey)}
      style={{
        position: "relative",
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: `${widthPercent}%`,
        boxSizing: "border-box",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        padding: "4px 2px",
        height: 52,
        background: isSelected
          ? "var(--app-accent-subtle)"
          : cell.frame
            ? "transparent"
            : cell.provisional
              ? `repeating-linear-gradient(135deg, ${BG_CARD} 0 5px, var(--app-accent-subtle) 5px 7px)`
              : BG_CARD,
        // A provisional key is dotted (not solid, not the read-only dash) and its glyph italic, so
        // it is told apart without colour.
        border: `${cell.provisional ? "2px dotted" : `1px ${readOnly ? "dashed" : "solid"}`} ${isSelected || cell.provisional ? ACCENT : BORDER}`,
        borderRadius: 4,
        color: cell.frame || stale ? TEXT_DIM : TEXT_MAIN,
        opacity: stale ? 0.75 : 1,
        cursor: "pointer",
        fontFamily: FONT,
        overflow: "hidden",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontSize: 14,
          lineHeight: 1,
          fontFamily: FONT_MONO,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
          fontStyle: cell.kind === "deadkey" || cell.provisional ? "italic" : undefined,
        }}
      >
        {glyph ?? (cell.frame ? "" : "·")}
      </span>
      <span
        aria-hidden="true"
        data-testid={`layout-cell-${cell.vkey}-key`}
        style={{
          fontSize: 8,
          lineHeight: 1,
          fontFamily: FONT_MONO,
          color: TEXT_DIM,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
        }}
      >
        {cell.keyLabel}
      </span>
      {cell.provenance !== null && !stale && (
        <span
          aria-hidden="true"
          data-testid={`layout-cell-${cell.vkey}-provenance`}
          style={{
            position: "absolute",
            top: 2,
            left: 3,
            fontSize: 8,
            lineHeight: 1,
            fontWeight: 700,
            color: TEXT_DIM,
          }}
        >
          {copy.provenanceShort(cell.provenance)}
        </span>
      )}
      {readOnly && !cell.frame && (
        <svg
          aria-hidden="true"
          focusable="false"
          data-testid={`layout-cell-${cell.vkey}-readonly`}
          width="9"
          height="9"
          viewBox="0 0 10 10"
          style={{ position: "absolute", top: 2, right: 3, color: TEXT_DIM }}
        >
          <rect x="1.5" y="4.5" width="7" height="5" rx="1" fill="currentColor" />
          <path d="M3 4.5V3a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      )}
    </button>
  );
}
