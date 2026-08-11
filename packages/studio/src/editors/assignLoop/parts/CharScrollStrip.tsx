// CharScrollStrip — shared horizontal character-scroll strip for the two
// assignment-loop galleries (MechanismGallery: physical/desktop; TouchGallery:
// touch). Replaces the old "Previous character" button: instead of stepping
// back exactly one position, the author can click ANY character's chip to
// jump straight to it (forward or backward) via
// usePositionalCharNav's handleSelectChar.
//
// Each chip shows:
//   - the character's glyph (via displayChar — combining marks get a dotted
//     circle prefix so they're visible standalone), rendered in the theme's
//     main text color (TEXT_MAIN) so it stays legible against BG_CARD in
//     both the light and navy themes (epic #533 — the old hardcoded white
//     only worked because the pre-token app had exactly one, always-dark
//     theme);
//   - a small count badge below it — the number of INDEPENDENT ways that
//     character can be produced in the caller's modality: a deletion-safety
//     signal (per product decision, a char reachable BOTH by its own key AND
//     by composition shows 2, not 1). Computed by charMechanisms.ts's
//     getProducerBadge — the 3-signal model (base-direct + session-direct
//     count + one-level composition; see that function's own doc comment for
//     the full rationale and the disjointness guarantee). Green when the
//     total is >=1, red when 0. A composable char (signal (c) fired) also
//     gets a small non-color compose marker (`⊕`, see the badge render
//     below) so "reachable by composition" is visible in grayscale too, not
//     just from the count.
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
import { getProducerBadge } from "./charMechanisms.ts";
import { indexOfChar, sameCharIdentity } from "../usePositionalCharNav.ts";
import {
  BG_CARD,
  BORDER,
  ACCENT,
  TEXT_DIM,
  TEXT_MAIN,
  FONT,
} from "../../../lib/galleryTheme.ts";
import { ERROR_RED, ERROR_BG } from "../../../ui/theme.ts";
import {
  GREEN_CHIP_BG,
  GREEN_CHIP_BORDER,
  GREEN_CHIP_TEXT,
} from "./RemovableChipRow.tsx";

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
   * Signal (a) of the 3-signal badge model (charMechanisms.ts's
   * getProducerBadge) — the caller's PRE-AUGMENT base/seed-only produced set
   * (NEVER a set that has been through `augmentWithComposable`). For
   * MechanismGallery: `buildProducedSet(baseIr, { excludeBackspaceCorrections:
   * true })`. For TouchGallery: `baseTouchCoveredSet`. Optional (defaults to
   * empty) — a caller with no base/seed notion (or a test exercising
   * something other than the badge) simply omits it.
   */
  baseDirectSet?: ReadonlySet<string>;
  /**
   * Signal (c)'s input — the caller's PRE-AUGMENT, SESSION-AWARE direct
   * produced set (this session's assignments folded into the base/seed, but
   * never itself run through `augmentWithComposable`). Used to test whether
   * `char`'s own NFD components are all directly reachable. For
   * MechanismGallery: `baseProducedSet` (`buildSessionProducedSet`). For
   * TouchGallery: `directTouchProducedSet`. Optional (defaults to empty) —
   * see `baseDirectSet` above.
   */
  preAugmentSessionAwareSet?: ReadonlySet<string>;
  /**
   * Per-surface "mark for later review" set (surveySessionStore's
   * `markedForLaterDesktop` for MechanismGallery, `markedForLaterTouch` for
   * TouchGallery — see accountedForGate.ts's module doc for why the two stay
   * separate sets). Purely a rendering signal here: a marked chip gets a
   * small BLUE flag on its badge (visual) plus an appended accessible-name
   * clause (docs/accessibility.md — the flag is never the only signal).
   * Optional (defaults to empty) — a caller with no mark notion (e.g. a test
   * exercising something other than marks) simply omits it.
   */
  markedSet?: ReadonlySet<string>;
}

/** Stable empty-set fallback for the two optional pre-augment set props above — avoids allocating a new Set every render when a caller omits them. */
const EMPTY_CHAR_SET: ReadonlySet<string> = new Set();

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
  baseDirectSet = EMPTY_CHAR_SET,
  preAugmentSessionAwareSet = EMPTY_CHAR_SET,
  markedSet = EMPTY_CHAR_SET,
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

  // Per-character producer badge (Part 2) — the shared 3-signal selector, not
  // a re-derived count, so this can never disagree with the gallery's own
  // pre-augment sets about what counts as a producer. Scoped to
  // `visibleChars` (not `chars`) — no point badging chips this render never
  // mounts.
  const producerBadgeByChar = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getProducerBadge>>();
    for (const c of visibleChars) {
      map.set(
        c,
        getProducerBadge(c, assignments, modality, baseDirectSet, preAugmentSessionAwareSet),
      );
    }
    return map;
  }, [visibleChars, assignments, modality, baseDirectSet, preAugmentSessionAwareSet]);

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
          const badge = producerBadgeByChar.get(c) ?? {
            count: 0,
            hasDirect: false,
            isComposable: false,
            components: [],
          };
          const count = badge.count;
          const badgeGood = count >= 1;
          // Accessible name for the compose clause — codepoint-derived (per
          // docs/accessibility.md #10), never the raw NFD component glyphs on
          // their own: reuses the same toUPlusNotation helper this file
          // already uses for every other codepoint-facing aria-label. Reuses
          // `badge.components` (the exact decomposition `composableComponentsFor`
          // already computed inside getProducerBadge) rather than re-running
          // `c.normalize("NFD")` a second time here.
          const composeComponentNames = badge.isComposable
            ? badge.components.map((component) => toUPlusNotation(component)).join(", ")
            : "";
          // The badge's accessible name — the existing count clause, with a
          // composition clause appended (never a second aria-live region;
          // this rides the badge's own existing aria-label, D3-neutral — see
          // this file's header comment).
          const countAriaLabel = t({
            id: "editor.assignLoop.charScroll.badgeAriaLabel",
            message: plural(count, {
              one: "# way produces this character",
              other: "# ways produce this character",
            }),
          });
          const badgeAriaLabel = badge.isComposable
            ? `${countAriaLabel} ${t({
                id: "editor.assignLoop.charScroll.badgeComposeClause",
                message: `reachable by composing ${{ components: composeComponentNames }}`,
              })}`
            : countAriaLabel;
          // Blue flag indicator (mechanism-gallery-progression follow-up) —
          // `markedSet` is per-surface (markedForLaterDesktop/Touch), so a
          // char marked on the OTHER surface never flags here. The flag is
          // NEVER the only signal (docs/accessibility.md): the chip's own
          // aria-label below gets an appended clause, not a replaced one, so
          // a screen-reader user hears "marked for later review" alongside
          // the existing codepoint-derived name rather than instead of it.
          const isMarked = markedSet.has(c);
          const chipBaseAriaLabel = t({
            id: "editor.assignLoop.charScroll.chipAriaLabel",
            message: `Go to ${{ notation: toUPlusNotation(c) }} ${{ char: c }}`,
          });
          const chipAriaLabel = isMarked
            ? `${chipBaseAriaLabel} ${t({
                id: "editor.assignLoop.charScroll.chipMarkedClause",
                message: "marked for later review",
              })}`
            : chipBaseAriaLabel;
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
              aria-label={chipAriaLabel}
              onClick={() => onSelectChar(c)}
              style={{
                flexShrink: 0,
                scrollSnapAlign: "start",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: isSelected ? "10px 12px" : "8px 10px",
                background: isSelected ? "var(--app-accent-subtle)" : BG_CARD,
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
                  color: TEXT_MAIN,
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
              <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                <span
                  data-testid={`char-scroll-badge-${hex}`}
                  aria-label={badgeAriaLabel}
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
                    background: badgeGood ? GREEN_CHIP_BG : ERROR_BG,
                    // Composable chars get a DASHED border (never color
                    // alone) in addition to the `⊕` marker below — a shape
                    // distinction visible in grayscale. This span's own
                    // textContent stays the bare count digit(s) — the
                    // compose marker is a SIBLING span, not nested here, so
                    // a caller reading this badge's textContent for the
                    // count keeps getting exactly the number.
                    border: `1px ${badge.isComposable ? "dashed" : "solid"} ${
                      badgeGood ? GREEN_CHIP_BORDER : ERROR_RED
                    }`,
                    color: badgeGood ? GREEN_CHIP_TEXT : ERROR_RED,
                  }}
                >
                  {count}
                </span>
                {badge.isComposable && (
                  // Decorative — the badge span's own aria-label above
                  // already states the composition clause, so this is
                  // aria-hidden to avoid a double announcement (same pattern
                  // as the selected-chip U+ notation span above).
                  <span
                    data-testid={`char-scroll-badge-compose-${hex}`}
                    aria-hidden="true"
                    style={{ fontSize: 9, lineHeight: 1, color: TEXT_DIM }}
                  >
                    ⊕
                  </span>
                )}
                {isMarked && (
                  // Decorative — the outer button's aria-label above already
                  // carries the appended "marked for later review" clause,
                  // so this glyph is aria-hidden to avoid a double
                  // announcement (same pattern as the compose marker above).
                  // BLUE (ACCENT, #6ea8fe — the same hue the mark-for-later
                  // button uses for its own UNMARKED state), never amber:
                  // amber here would collide with the badge's own
                  // uncovered/RED-vs-covered/GREEN palette read as a THIRD
                  // status color, where the flag is a distinct axis
                  // ("deferred by the author"), not a coverage state. ~7.8:1
                  // contrast against the galleries' dark page background
                  // (#0d1117) and the chip backgrounds (BG_CARD/#161b22,
                  // selected #0d2840) — comfortably AA (in fact AAA-normal-
                  // text) for this decorative-but-visible glyph.
                  <span
                    data-testid={`char-scroll-badge-marked-${hex}`}
                    aria-hidden="true"
                    style={{ fontSize: 10, lineHeight: 1, color: ACCENT }}
                  >
                    ⚑
                  </span>
                )}
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
