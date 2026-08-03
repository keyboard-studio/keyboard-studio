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
//   - a small count badge below it — the number of ways that character is
//     produced in the caller's modality (see charMechanisms.ts's
//     getCharMechanisms — PRODUCES, not USES): the mechanisms whose OUTPUT is
//     that character, plus one for a character the caller's SEED layout
//     already reaches (`inheritedChars`, TouchGallery's "already in touch
//     layout" set). Green when >=1, red when 0.
//
// The CURRENTLY SELECTED chip additionally grows (a larger glyph) and shows
// its `U+XXXX` notation between the glyph and the badge — this strip is now
// the single place the "which character, what codepoint, how many
// mechanisms" trio is surfaced, replacing the separate character-heading
// card each gallery used to render below it (see MechanismGallery.tsx and
// TouchGallery.tsx history). The visible U+ text on the selected chip is
// `aria-hidden` because the button's own `aria-label` already states the
// notation — without that, some screen readers would announce the
// character/codepoint twice when browsing the chip's content.
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
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { MechanismAssignment, Modality } from "@keyboard-studio/contracts";
import { toUPlusNotation, toHex4 } from "@keyboard-studio/contracts";
import { displayChar } from "../../../lib/irToCarveNodes.ts";
import { getCharMechanisms } from "./charMechanisms.ts";
import { indexOfChar, sameCharIdentity } from "../usePositionalCharNav.ts";
import {
  BG_CARD,
  BORDER,
  ACCENT,
  TEXT_DIM,
  FONT,
} from "../../../lib/galleryTheme.ts";
import { ERROR_RED } from "../../../ui/theme.ts";

const WHEEL_SCROLL_FACTOR = 0.6; // dampen wheel delta so the strip pans a bit slower than the raw device delta

// See the `visibleChars` useMemo below for the full rationale. 300 comfortably
// covers a full scrollable browse of any script's base alphabet/diacritic set
// while staying well clear of the thousands-of-chips freeze a full tonal-
// syllable inventory triggered.
export const MAX_VISIBLE_CHIPS = 300;

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
  /**
   * Characters the caller's SEED layout already produces with no author edit —
   * TouchGallery's `detectedChars` ("already in touch layout"). Each counts as
   * one producing way in the badge, so a character the gallery reports as
   * already on the keyboard never badges red 0. MechanismGallery has no seed
   * notion and omits this.
   */
  inheritedChars?: ReadonlySet<string>;
}

/** Hyphen-joined 4+-digit uppercase hex of EVERY codepoint in `char` — the chip/badge testid key (see file header).
 *  Shares the per-codepoint `toHex4` primitive with `toUPlusNotation`. */
function charHex(char: string): string {
  return Array.from(char)
    .map((codePoint) => toHex4(codePoint.codePointAt(0) ?? 0))
    .join("-");
}

export function CharScrollStrip({
  chars,
  currentChar,
  onSelectChar,
  assignments,
  modality,
  inheritedChars,
}: CharScrollStripProps) {
  const { t } = useLingui();
  const chipRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const stripRef = useRef<HTMLDivElement | null>(null);

  // Mouse-wheel / horizontal-trackpad panning, scoped to the strip: a plain
  // `useEffect` + `addEventListener("wheel", ..., { passive: false })` rather
  // than a JSX `onWheel` prop, because React registers its root-level wheel
  // listener as passive — `e.preventDefault()` inside a JSX onWheel handler is
  // silently ignored (and warns) there, so it can't reliably suppress the
  // page's own scroll when the strip itself consumes the gesture. Being on
  // this element (not window/document) is what makes panning hover-gated: it
  // only fires while the pointer is over the char/badge strip. This has no
  // dependency on `chars`/`currentChar`/`onSelectChar` — it only ever touches
  // the DOM element's own `scrollLeft`, never the selection — so it mounts
  // once and is never torn down/re-attached on selection changes.
  useEffect(() => {
    // stripRef.current is guaranteed non-null here: the div below is the
    // ONLY thing this component ever renders (aside from the <style> tag),
    // and the sole early return (`chars.length === 0` above) happens before
    // it — so the div is present on every render where this component
    // renders anything at all. Both callers additionally only mount this
    // component once their own char list has already settled to non-empty
    // (MechanismGallery gates on `lettersToAdd.length > 0`; TouchGallery
    // gates on `currentChar !== null`, which its own sync effect never sets
    // until `inventory.length > 0`), so this mount-only effect's first (and
    // only) run always finds the div already committed to the DOM.
    const stripEl = stripRef.current;
    if (!stripEl) return;

    function handleWheel(e: WheelEvent) {
      // Re-read the ref inside the handler: this closure escapes into
      // addEventListener, so TS widens any outer narrowing back to
      // `HTMLDivElement | null` here — a local guard re-narrows it (and the
      // ref is stable for the component's lifetime, so this is the same div).
      const el = stripRef.current;
      if (!el) return;

      // Max-magnitude of the two axes: a vertical mouse wheel reports on
      // deltaY, a horizontal trackpad swipe on deltaX — whichever moved
      // further drives the pan. This never touches selection, only the
      // strip's own scrollLeft.
      const delta =
        Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (delta === 0) return;

      // No horizontal overflow at all: nothing for this strip to consume,
      // so don't preventDefault — let the page's own scroll handle the
      // event.
      if (el.scrollWidth <= el.clientWidth) return;

      const maxScrollLeft = el.scrollWidth - el.clientWidth;
      // Already clamped at the edge in the wheeled direction: let the event
      // pass through (no preventDefault) so the page can still scroll past
      // this element instead of the gesture being silently swallowed here.
      if (delta < 0 && el.scrollLeft <= 0) return;
      if (delta > 0 && el.scrollLeft >= maxScrollLeft) return;

      // The strip can actually move in this direction — pan it and consume
      // the event so the page underneath doesn't also scroll vertically.
      el.scrollLeft += delta * WHEEL_SCROLL_FACTOR;
      e.preventDefault();
    }

    stripEl.addEventListener("wheel", handleWheel, { passive: false });
    return () => stripEl.removeEventListener("wheel", handleWheel);
  }, []);

  // ArrowLeft/ArrowRight cycling has moved to the PANE level — see
  // useCharCycleKeys.ts's file header for why (TouchGallery's method-chooser
  // subtree can pull DOM focus off a chip, which silently killed a
  // chip-scoped keydown handler). This component no longer listens for
  // keydown at all; it only reflects the caller's `currentChar` — see the
  // two effects below.

  // Auto-scroll the current chip into view (horizontally only — inline
  // "nearest" never triggers a vertical/page scroll), and, if keyboard focus
  // was already resting on one of THIS strip's own chips (an in-progress
  // roving-focus session — i.e. the author was already navigating the strip
  // via the keyboard), move focus onto the newly selected chip too, so
  // keyboard navigation stays inside the strip rather than left behind on
  // the now-stale previously-focused chip. Both run whenever the selected
  // character changes.
  //
  // The focus-follow is deliberately gated on "focus is already inside this
  // strip" rather than firing unconditionally on every `currentChar` change:
  // `currentChar` also changes from causes that have nothing to do with
  // keyboard chip-to-chip navigation — clicking "Next character"/"Skip",
  // accepting a suggestion, etc. — and none of those should yank focus away
  // from the control the author just activated onto a distant chip.
  useEffect(() => {
    if (currentChar === null) return;
    const el = chipRefs.current.get(currentChar);

    // jsdom (the test environment) does not implement scrollIntoView at all —
    // feature-detect rather than assuming its presence, so component tests
    // that mount this strip don't need to polyfill a browser-only API.
    if (typeof el?.scrollIntoView === "function") {
      el.scrollIntoView({
        behavior: "smooth",
        inline: "nearest",
        block: "nearest",
      });
    }

    const activeEl = document.activeElement;
    const focusAlreadyInStrip =
      activeEl instanceof HTMLElement &&
      stripRef.current !== null &&
      stripRef.current.contains(activeEl);
    if (focusAlreadyInStrip) {
      el?.focus();
    }
  }, [currentChar]);

  // Rendering safety net for very large `chars` lists (e.g. a tonal-syllable
  // romanization inventory of several thousand characters — Hakka's confirmed
  // inventory runs to ~3k): mounting one <button> chip (each with its own
  // ref callback, i18n-resolved aria-label, and nested glyph/badge spans) per
  // character froze the tab on entry to the gallery — the DOM/reconciliation
  // cost of thousands of chips, not any engine-side compute, which stays
  // cheap and bounded. This caps what's actually mounted at once to a WINDOW
  // around `currentChar`, so the selected/grown chip is always inside the
  // rendered slice — never a fixed head-of-list truncation that could hide
  // the very character the gallery is walking. Unlike CharacterMapPane's
  // MAX_CELLS_PER_GROUP cap (survey/CharacterMapPane.tsx), which has a
  // search/raw-codepoint escape hatch to reach a capped-out character, this
  // strip has none, so it must follow the selection instead of a static
  // prefix. Only how many chips THIS strip mounts is bounded — `chars` itself
  // (and therefore each gallery's own Back/Next/Skip walk over lettersToAdd)
  // is untouched. A `useMemo` (not a stateful window) is enough: while
  // `currentChar` doesn't change, its cached result doesn't move, so a manual
  // horizontal scroll inside the current window is never reset by an
  // unrelated re-render elsewhere in the gallery — it only re-centers when
  // navigation actually moves `currentChar` outside the previous window.
  // `indexOfChar` (NFC identity), not raw `chars.indexOf` — a reflow that
  // changes `currentChar`'s representation (e.g. collateInventory's NFC-dedup
  // in survey/collation.ts) must not strand the window on a stale raw-string
  // mismatch; see usePositionalCharNav.ts's module doc comment for the full
  // rationale (the same shaped bug this strip's windowing shares with the
  // Back/Next walk itself).
  const visibleChars = useMemo(() => {
    if (chars.length <= MAX_VISIBLE_CHIPS) return chars;
    const idx = currentChar !== null ? indexOfChar(chars, currentChar) : -1;
    const half = Math.floor(MAX_VISIBLE_CHIPS / 2);
    const start =
      idx === -1
        ? 0
        : Math.max(0, Math.min(idx - half, chars.length - MAX_VISIBLE_CHIPS));
    return chars.slice(start, start + MAX_VISIBLE_CHIPS);
  }, [chars, currentChar]);

  // Whether the selected character is inside the currently-rendered window —
  // see the roving-tabindex comment at the chip map below for why this
  // matters (the tab-reachability fallback when nothing in view is selected).
  // NFC identity (indexOfChar), not raw `===` — same rationale as above.
  const hasSelectedVisible = useMemo(
    () => currentChar !== null && indexOfChar(visibleChars, currentChar) !== -1,
    [visibleChars, currentChar],
  );

  // Per-character produces count (Part 2 badge) — the shared selector, not a
  // re-derived count, so this can never disagree with each gallery's own
  // bottom "uses" list about what counts as a producer. Scoped to
  // `visibleChars` (not `chars`) — no point badging chips this render never
  // mounts.
  const producesCountByChar = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of visibleChars) {
      map.set(
        c,
        getCharMechanisms(c, assignments, modality, inheritedChars)
          .producesCount,
      );
    }
    return map;
  }, [visibleChars, assignments, modality, inheritedChars]);

  if (chars.length === 0) return null;

  return (
    <>
      {/* Thicker horizontal scrollbar than the browser default. Firefox is
          handled by scrollbarWidth:"auto" on the element below; WebKit/Blink
          (Chrome/Edge/Safari) needs ::-webkit-scrollbar, which cannot be set
          via an inline style, so it rides this scoped rule keyed off the
          strip's stable class. */}
      <style>{`
        .ks-char-scroll-strip::-webkit-scrollbar { height: 12px; }
        .ks-char-scroll-strip::-webkit-scrollbar-track { background: transparent; }
        .ks-char-scroll-strip::-webkit-scrollbar-thumb {
          background: ${BORDER};
          border-radius: 6px;
        }
        .ks-char-scroll-strip:hover::-webkit-scrollbar-thumb { background: ${ACCENT}; }
      `}</style>
      <div
        ref={stripRef}
        className="ks-char-scroll-strip"
        data-testid="char-scroll-strip"
        aria-label={t({
          id: "editor.assignLoop.charScroll.stripAriaLabel",
          message: "Characters",
        })}
        style={{
          display: "flex",
          flexDirection: "row",
          // Chips size to their own content and sit centred in the band.
          // Without this the row's default align-items:stretch stretched
          // every chip to the full strip height, leaving the lower half of
          // each chip empty below its top-anchored glyph/badge.
          alignItems: "center",
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
          // The floor only needs to clear the tallest chip (the grown
          // SELECTED one) plus the thicker scrollbar below it, not leave a
          // half-empty band: grown chip ~89px (glyph 32 + 4 gap + U+ line 11
          // + 4 gap + badge 18 = 69 content, +18px padding +2px border) +6px
          // wrapper paddingBottom +12px scrollbar track ≈ 107px. 108 keeps a
          // stable floor with negligible dead space; taller natural content
          // (never the case today) would win over it anyway.
          minHeight: 108,
          paddingBottom: 6,
          scrollSnapType: "x proximity",
          scrollbarWidth: "auto",
        }}
      >
        {/* Roving tabindex: exactly one chip is a Tab stop at a time (the
            rest are -1, reachable only via the pane-level ArrowLeft/
            ArrowRight handler — see useCharCycleKeys.ts) so Tab moves past
            the whole strip in one hop instead of
            stopping at up to MAX_VISIBLE_CHIPS individual chips. Fallback:
            when `currentChar` is null/stale (not present in the visible
            set), no chip is `isSelected`, which on its own would make every
            chip tabIndex=-1 and strand the strip outside the Tab order
            entirely — `hasSelectedVisible` (computed above) guards that by
            making the FIRST visible chip the tab stop whenever nothing else
            is selected. */}
        {visibleChars.map((c, index) => {
          const hex = charHex(c);
          // NFC identity (not raw `===`) — same rationale as
          // visibleChars/hasSelectedVisible above.
          const isSelected = currentChar !== null && sameCharIdentity(c, currentChar);
          const isTabbable = isSelected || (!hasSelectedVisible && index === 0);
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
              tabIndex={isTabbable ? 0 : -1}
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
                padding: isSelected ? "10px 12px" : "8px 10px",
                background: isSelected ? "#0d2840" : BG_CARD,
                border: `1px solid ${isSelected ? ACCENT : BORDER}`,
                borderRadius: 8,
                cursor: "pointer",
                fontFamily: FONT,
              }}
            >
              <span
                style={{
                  fontSize: isSelected ? 32 : 20,
                  lineHeight: 1,
                  fontFamily:
                    "ui-monospace, 'Cascadia Code', Consolas, monospace",
                  color: "#ffffff",
                }}
              >
                {displayChar(c)}
              </span>
              {isSelected && (
                // Visible U+ notation on the grown/selected chip only — the
                // per-char "character heading" card each gallery used to
                // render below the strip is gone; this is its replacement.
                // aria-hidden: the button's own aria-label above already
                // states the notation, so this stays a sighted-only cue and
                // is never announced a second time.
                <span
                  aria-hidden="true"
                  style={{
                    fontSize: 11,
                    lineHeight: 1,
                    fontFamily:
                      "ui-monospace, 'Cascadia Code', Consolas, monospace",
                    color: TEXT_DIM,
                  }}
                >
                  {toUPlusNotation(c)}
                </span>
              )}
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
                  border: `1px solid ${badgeGood ? "#238636" : ERROR_RED}`,
                  color: badgeGood ? "#56d364" : ERROR_RED,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
      {visibleChars.length < chars.length && (
        <div style={{ fontSize: 11, color: TEXT_DIM, fontFamily: FONT, marginTop: -4 }}>
          <Trans id="editor.assignLoop.charScroll.truncatedNote">
            Showing {visibleChars.length} of {chars.length} characters — navigate to
            a character to bring it into view.
          </Trans>
        </div>
      )}
    </>
  );
}
