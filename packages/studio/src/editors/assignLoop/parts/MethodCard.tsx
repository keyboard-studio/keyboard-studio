// MethodCard — shared method-card shell for MethodChooser
// (MechanismGallery.tsx) and TouchMethodChooser (TouchGallery.tsx).
//
// Every method card was the same shell with different content: a bordered
// card, a header row with a title-toggle button and (usually) an Apply
// control beside it, a one-line summary while the card is closed, and the
// method's config below the header while it is open. The seven cards
// (desktop swap/sequence/deadkey, touch long-press/flick/multitap/replace)
// hand-copied that shell, so a header fix landed in whichever copy someone
// happened to read.
//
// This component owns only the shell. The caller owns everything that
// differs per card:
//   - title / summary are already-rendered nodes (usually Lingui <Trans>),
//     because the lingui macros need their message ids as literals, never
//     as variables, for static extraction;
//   - applyRow is the caller's own CardApplyRow / TouchCardApplyRow (both
//     already delegate to GalleryCardApplyRow), or omitted for the sequence
//     card, which holds no fields of its own and whose builder owns Apply;
//   - children are the card's config, rendered only while selected, exactly
//     as the callers rendered it before (including the swap card's IIFE,
//     which is passed through as children and therefore still runs only
//     while that card is selected).
//
// Deliberately NOT ui/Card: that primitive renders the whole card as one
// button (or a plain div), but a method card's header must hold a title
// button AND an Apply button side by side — a <button> cannot contain
// another <button> — and the sequence card's header is a full-width button
// with no Apply row at all. The styles here are the galleries' own shared
// galleryTheme presets, not a new look.

import type { ReactNode } from "react";
import {
  galleryCardStyle as cardStyle,
  galleryCardHeaderRowStyle as cardHeaderRowStyle,
  galleryHeaderTitleBtnStyle as headerTitleBtnStyle,
  galleryHeaderBtnStyle as headerBtnStyle,
  ACCENT,
  TEXT_DIM,
  TEXT_MAIN,
} from "../../../lib/galleryTheme.ts";

export interface MethodCardProps {
  /** Whether this card is the currently selected method. */
  selected: boolean;
  /** Called when the title button is clicked. */
  onSelect: () => void;
  /** Card title, rendered inside the title button. */
  title: ReactNode;
  /** One-line summary, shown only while the card is closed. */
  summary?: ReactNode;
  /** Apply control, shown only while the card is open. Omit it and the
   * header is a single full-width button (the sequence card's shape). */
  applyRow?: ReactNode;
  /** Card config, rendered only while the card is open. */
  children?: ReactNode;
}

export function MethodCard({
  selected,
  onSelect,
  title,
  summary,
  applyRow,
  children,
}: MethodCardProps) {
  const titleButton = (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      style={applyRow === undefined ? headerBtnStyle : headerTitleBtnStyle}
    >
      <span
        style={{
          fontWeight: 600,
          color: selected ? ACCENT : TEXT_MAIN,
        }}
      >
        {title}
      </span>
      {!selected && summary !== undefined && (
        <span style={{ fontSize: 11, color: TEXT_DIM }}>{summary}</span>
      )}
    </button>
  );

  return (
    <div style={cardStyle(selected)}>
      {applyRow === undefined ? (
        titleButton
      ) : (
        <div style={cardHeaderRowStyle}>
          {titleButton}
          {selected && applyRow}
        </div>
      )}
      {selected && children}
    </div>
  );
}
