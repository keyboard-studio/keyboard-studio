// CharScrollStrip — shared horizontal character-scroll strip for the two
// assignment-loop galleries (MechanismGallery: physical/desktop; TouchGallery:
// touch). Replaces the old "Previous character" button: instead of stepping
// back exactly one position, the author can click ANY character's chip to
// jump straight to it (forward or backward) via
// usePositionalCharNav's handleSelectChar.
//
// Each chip shows:
//   - the character's glyph (via displayChar — combining marks get a dotted
//     circle prefix so they're visible standalone), rendered in WHITE;
//   - a small count badge below it — the number of mechanisms whose OUTPUT is
//     that character in the caller's modality (see charMechanisms.ts's
//     getCharMechanisms — PRODUCES, not USES). Green when >=1, red when 0.
//
// Test-id scheme (documented — Part 1 asked for a stable, picked scheme):
// both the chip and its badge key off the FULL sequence of the character's
// Unicode codepoints, each in 4+-digit uppercase hex (the same per-codepoint
// format toUPlusNotation uses, minus the "U+" prefix), hyphen-joined — rather
// than the raw character. A raw combining mark or zero-width character
// embedded literally in a `data-testid` value is legal HTML but makes
// selectors nearly impossible to type/read in a spec file; hex is stable and
// ASCII-only. Keying off only the FIRST codepoint would collide for distinct
// multi-codepoint graphemes sharing a base (e.g. a+combining-acute vs
// a+combining-grave both start with U+0061) — the full sequence is what's
// actually collision-free per distinct grapheme.
//
// Purely presentational plus one piece of derived display data (the
// per-char produces count) — no assignment-shape knowledge beyond calling
// the shared selector; VFS/assignment plumbing stays in the calling gallery.

import { useEffect, useMemo, useRef } from "react";
import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { MechanismAssignment, Modality } from "@keyboard-studio/contracts";
import { toUPlusNotation } from "@keyboard-studio/contracts";
import { displayChar } from "../../../lib/irToCarveNodes.ts";
import { getCharMechanisms } from "./charMechanisms.ts";
import { BG_CARD, BORDER, ACCENT, FONT } from "../../../lib/galleryTheme.ts";

export interface CharScrollStripProps {
  /** All characters in this gallery's own walk order (lettersToAdd for MechanismGallery, inventory for TouchGallery). */
  chars: readonly string[];
  /** Currently selected character, or null before the list has settled. */
  currentChar: string | null;
  /** Jump directly to `char` — wired to usePositionalCharNav's handleSelectChar. */
  onSelectChar: (char: string) => void;
  /** Assignments the produces-count badge is computed from (see charMechanisms.ts). */
  assignments: ReadonlyArray<MechanismAssignment>;
  /** Which modality's producer count to badge — "physical" for MechanismGallery, "touch" for TouchGallery. */
  modality: Modality;
}

/** Hyphen-joined 4+-digit uppercase hex of EVERY codepoint in `char` — the chip/badge testid key (see file header). */
function charHex(char: string): string {
  return Array.from(char)
    .map((codePoint) => (codePoint.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0"))
    .join("-");
}

export function CharScrollStrip({
  chars,
  currentChar,
  onSelectChar,
  assignments,
  modality,
}: CharScrollStripProps) {
  const { t } = useLingui();
  const chipRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Auto-scroll the current chip into view (horizontally only — inline
  // "nearest" never triggers a vertical/page scroll) whenever the selected
  // character changes.
  useEffect(() => {
    if (currentChar === null) return;
    const el = chipRefs.current.get(currentChar);
    // jsdom (the test environment) does not implement scrollIntoView at all —
    // feature-detect rather than assuming its presence, so component tests
    // that mount this strip don't need to polyfill a browser-only API.
    if (typeof el?.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
    }
  }, [currentChar]);

  // Per-character produces count (Part 2 badge) — the shared selector, not a
  // re-derived count, so this can never disagree with each gallery's own
  // bottom "uses" list about what counts as a producer.
  const producesCountByChar = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of chars) {
      map.set(c, getCharMechanisms(c, assignments, modality).producesCount);
    }
    return map;
  }, [chars, assignments, modality]);

  if (chars.length === 0) return null;

  return (
    <div
      data-testid="char-scroll-strip"
      aria-label={t({ id: "editor.assignLoop.charScroll.stripAriaLabel", message: "Characters" })}
      style={{
        display: "flex",
        flexDirection: "row",
        flexShrink: 0,
        gap: 8,
        overflowX: "auto",
        overflowY: "hidden",
        // Explicit floor, not just flexShrink:0: this div is a direct flex
        // item of each caller's flex-column pane (MechanismGallery's and
        // TouchGallery's `leftContent`). Because its OWN overflow is
        // non-visible (overflowX:auto / overflowY:hidden), the CSS flexbox
        // automatic-minimum-size rule resets its content-based floor to 0
        // (https://www.w3.org/TR/css-flexbox-1/#min-size-auto) — so once the
        // pane's stacked content exceeds the pane's height and the column
        // has to shrink something, THIS item (having no other floor) is what
        // collapses, not its overflow:visible siblings (e.g. the method
        // chooser box below, which keeps its min-content height). That's the
        // "only a couple pixels showing" bug. minHeight is a real,
        // non-"auto" value, so it becomes the shrink floor directly and the
        // automatic-min-size-to-0 rule no longer applies; flexShrink:0
        // additionally opts this item out of the shrink algorithm entirely,
        // as a second, independent guard.
        //
        // 96px clears one row of chips: glyph (fontSize 20/lineHeight 1)
        // + 4px column gap + badge (16px line-height + 1px top/bottom
        // border = 18px) = 42px of button content, +16px button vertical
        // padding +2px button border = 60px per chip, +6px wrapper
        // paddingBottom = 66px, plus ~30px headroom for a classic
        // (non-overlay) horizontal scrollbar track on Windows/Linux/Chrome
        // (scrollbarWidth:"thin" below only affects Firefox) and for
        // cross-browser font-metrics rounding.
        minHeight: 96,
        paddingBottom: 6,
        scrollSnapType: "x proximity",
        scrollbarWidth: "thin",
      }}
    >
      {chars.map((c) => {
        const hex = charHex(c);
        const isSelected = c === currentChar;
        const count = producesCountByChar.get(c) ?? 0;
        const badgeGood = count >= 1;
        return (
          <button
            key={c}
            type="button"
            ref={(el) => {
              if (el) chipRefs.current.set(c, el);
              else chipRefs.current.delete(c);
            }}
            data-testid={`char-scroll-chip-${hex}`}
            aria-pressed={isSelected}
            aria-label={t({
              id: "editor.assignLoop.charScroll.chipAriaLabel",
              message: `Go to ${{ notation: toUPlusNotation(c) }} ${{ char: c }}`,
            })}
            onClick={() => onSelectChar(c)}
            style={{
              flexShrink: 0,
              scrollSnapAlign: "start",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "8px 10px",
              background: isSelected ? "#0d2840" : BG_CARD,
              border: `1px solid ${isSelected ? ACCENT : BORDER}`,
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: FONT,
            }}
          >
            <span
              style={{
                fontSize: 20,
                lineHeight: 1,
                fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
                color: "#ffffff",
              }}
            >
              {displayChar(c)}
            </span>
            <span
              data-testid={`char-scroll-badge-${hex}`}
              aria-label={t({
                id: "editor.assignLoop.charScroll.badgeAriaLabel",
                message: plural(count, {
                  one: "# way produces this character",
                  other: "# ways produce this character",
                }),
              })}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 16,
                padding: "0 5px",
                borderRadius: 8,
                fontSize: 10,
                fontWeight: 600,
                lineHeight: "16px",
                background: badgeGood ? "#0d2218" : "#2a0a0a",
                border: `1px solid ${badgeGood ? "#238636" : "#f85149"}`,
                color: badgeGood ? "#56d364" : "#f85149",
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
