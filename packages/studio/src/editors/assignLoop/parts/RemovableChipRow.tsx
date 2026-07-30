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

import { useState, type CSSProperties, type ReactNode } from "react";
import { TEXT_DIM } from "../../../lib/galleryTheme.ts";
import { ERROR_RED } from "../../../ui/theme.ts";

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
  /**
   * When true, hovering a chip swaps its palette to the shared "danger" red
   * (background #2a0a0a / border+text ERROR_RED) — the studio-wide "click
   * deletes" affordance for neon-green deletable chips. Implemented as a
   * per-chip onMouseEnter/onMouseLeave style swap (see {@link HoverDangerChip}
   * below) rather than a CSS `:hover` class: these chips already carry an
   * inline `background`/`border`/`color` (the row's own palette props), and
   * an inline style always wins over a class selector at equal or lower
   * specificity, so a plain `.ks-deletable-chip:hover` rule would never fire
   * without `!important` fighting the inline styles it's laid over. The
   * hover-state swap is the reliable path and needs no `!important`.
   * Defaults to false — the blue "Sequences" row (MechanismGallery.tsx) is
   * not a deletable-in-the-carve-sense chip and stays blue on hover.
   */
  hoverDanger?: boolean;
}

/** Shared "danger" hover palette — the studio-wide red used across every
 *  deletable neon-green chip on hover (see {@link RemovableChipRowProps.hoverDanger}). */
const DANGER_BG = "#2a0a0a";

/**
 * Shared hover-red chip button. Takes a fully-formed `baseStyle` (including
 * this chip's own background/border/color) and swaps those three properties
 * to the shared danger palette while the pointer is over the chip — via
 * component state, not a CSS class, since the caller's own inline style
 * would otherwise always win over a `:hover` class rule (see
 * {@link RemovableChipRowProps.hoverDanger}'s doc comment for why).
 *
 * Exported so the standalone "Applied methods" pills row in
 * MechanismGallery.tsx (which bypasses RemovableChipRow entirely — it mixes
 * per-chip mechanism-removal logic RemovableChipRow's flat `items` shape
 * doesn't model) can share the exact same hover behavior instead of a second,
 * divergent copy.
 */
export function HoverDangerChip({
  onClick,
  disabled = false,
  ariaLabel,
  title,
  children,
  baseStyle,
  hoverDanger = true,
  dataTestId,
}: {
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  title?: string;
  children: ReactNode;
  /** Full chip style, including this chip's own `background`/`border`/`color`. */
  baseStyle: CSSProperties;
  /** Whether hovering swaps the palette to red. Defaults to true (the common "deletable chip" case). */
  hoverDanger?: boolean;
  dataTestId?: string;
}) {
  const [hovering, setHovering] = useState(false);
  const danger = hoverDanger && hovering && !disabled;
  const style: CSSProperties = {
    ...baseStyle,
    transition: "background-color .12s, border-color .12s, color .12s",
    ...(danger
      ? { background: DANGER_BG, border: `1px solid ${ERROR_RED}`, color: ERROR_RED }
      : {}),
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      aria-label={ariaLabel}
      {...(title !== undefined ? { title } : {})}
      {...(dataTestId !== undefined ? { "data-testid": dataTestId } : {})}
      style={style}
    >
      {children}
    </button>
  );
}

/**
 * Palette for a non-deletable "Existing methods" chip (MechanismGallery
 * desktop + TouchGallery touch) — see {@link NonDeletableMethodChip}'s doc
 * comment for the two variants' meaning. Colors match the deletable green
 * chip's own palette (`#0d2218`/`#238636`/`#56d364`) so a green row reads as
 * one consistent color regardless of whether it happens to carry the "×"
 * delete affordance.
 */
const NON_DELETABLE_CHIP_PALETTE = {
  green: { background: "#0d2218", border: "#238636", color: "#56d364" },
  blue: { background: "#1c2a3a", border: "#58a6ff", color: "#58a6ff" },
} as const;

export type NonDeletableChipVariant = keyof typeof NON_DELETABLE_CHIP_PALETTE;

/**
 * Shared static (non-interactive) "Existing methods" chip — the color-model
 * split introduced alongside {@link HoverDangerChip}'s deletable green chip:
 * color tracks PRODUCED vs. USED, deletability is a separate signal carried
 * by whether a row renders as this chip at all (never deletable) or as
 * {@link HoverDangerChip} (deletable).
 *
 *   - `variant: "blue"`  — this row only USES the character as input (a
 *     desktop deadkey base / any()-consumed input-store occurrence,
 *     `ContributorDescriptor.producedRole === "used"`). The character is
 *     never removed by deleting this row because this row never produced it.
 *   - `variant: "green"` — this row PRODUCES the character (composition,
 *     unattributed SHOW-ALL floor, a blocked/opaque producer, or a produced
 *     rule the capability check marked not-removable) but there is no single
 *     rule/slot to surgically delete. Rendered in the SAME green as a
 *     deletable row, just without the "×" glyph, the hover-red swap, or a
 *     click handler — "green without ×" is the visual cue for "produced
 *     here, nothing single to delete."
 *
 * No `onClick` prop exists on this component at all (unlike
 * {@link HoverDangerChip}, which always takes one) — that absence is what
 * keeps a static row from ever accidentally growing a delete affordance.
 */
export function NonDeletableMethodChip({
  variant,
  reason,
  children,
}: {
  variant: NonDeletableChipVariant;
  /** Tooltip explaining why this row can't be deleted (or, for `blue`, why it's shown at all). */
  reason?: string;
  children: ReactNode;
}) {
  const palette = NON_DELETABLE_CHIP_PALETTE[variant];
  return (
    <span
      {...(reason !== undefined ? { title: reason } : {})}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px",
        background: palette.background,
        border: `1px solid ${palette.border}`,
        borderRadius: 12,
        color: palette.color,
        fontSize: 11,
        fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
        cursor: "default",
      }}
    >
      {children}
    </span>
  );
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
  hoverDanger = false,
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
          <HoverDangerChip
            key={item.key}
            onClick={item.onClick}
            ariaLabel={item.ariaLabel}
            title={item.title}
            baseStyle={chipStyle}
            hoverDanger={hoverDanger}
          >
            {item.label}
            <span aria-hidden="true" style={{ fontSize: 11, color: "inherit", opacity: 0.7 }}>
              &times;
            </span>
          </HoverDangerChip>
        ))}
      </div>
    </div>
  );
}
