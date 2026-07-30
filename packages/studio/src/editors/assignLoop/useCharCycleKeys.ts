// useCharCycleKeys — shared ArrowLeft/ArrowRight character-cycling logic for
// the assign-loop galleries (MechanismGallery: physical/desktop; TouchGallery:
// touch). Attached at the PANE level (each gallery's outer leftContent div),
// not on CharScrollStrip itself — see that file's header comment for why:
// CharScrollStrip's own onKeyDown only ever fired while DOM focus sat on one
// of its chip <button>s (a bubbling handler needs focus somewhere inside the
// element it's attached to). That held for MechanismGallery, where roving
// focus keeps focus on a chip, but TouchGallery's method chooser resets a
// large subtree on every character change (host key / flick / layer state),
// which can pull focus out of the strip entirely — so a chip-scoped handler
// went dead the moment the author picked a method. Lifting the handler to the
// pane (a plain wrapping div covering the whole leftContent tree) means an
// ArrowLeft/ArrowRight fired from ANYWHERE in the pane — a method-chooser
// button, a key picker's trigger, wherever — still cycles the character,
// because keydown bubbles up to the pane regardless of which descendant had
// focus.
//
// Both galleries call this ONE hook (no forked copy) so the wrap-around
// semantics can never drift between physical and touch — same rationale as
// usePositionalCharNav.ts, which this hook complements (usePositionalCharNav
// owns Back/Next/Skip's *positional* one-step walk; this hook owns the
// scroll-strip's *jump-to-any-character* Left/Right cycle, delegating the
// actual selection to the SAME onSelectChar the chip's onClick uses — so
// there is exactly one selection call site per gallery, not two competing
// ones).

import { useCallback } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/**
 * Pure step helper: the character one position away from `currentChar` in
 * `chars`, wrapping at both ends (last <-> first). `delta` is `1` for
 * ArrowRight (next) or `-1` for ArrowLeft (previous). `currentChar === null`
 * (or a stale value not present in `chars` — `indexOf` returns -1 the same
 * way) yields the first character for `delta === 1`, the last for
 * `delta === -1`. Returns `null` only when `chars` is empty.
 *
 * Extracted so CharScrollStrip's original inline wrap-around math has
 * exactly one home now that the keydown handler itself has moved to this
 * hook — the chip's onClick / usePositionalCharNav's own navigation don't
 * need this (they don't wrap), so this stays scoped to the strip's
 * cycle-through-everything behavior specifically.
 */
export function stepChar(
  chars: readonly string[],
  currentChar: string | null,
  delta: 1 | -1,
): string | null {
  if (chars.length === 0) return null;
  const currentIdx = currentChar !== null ? chars.indexOf(currentChar) : -1;
  const nextIdx =
    delta === 1
      ? currentIdx === -1
        ? 0
        : (currentIdx + 1) % chars.length
      : currentIdx === -1
        ? chars.length - 1
        : (currentIdx - 1 + chars.length) % chars.length;
  return chars[nextIdx] ?? null;
}

// Elements where ArrowLeft/ArrowRight already carries its own meaning (text-
// cursor movement in an input/textarea/contenteditable field, or navigating
// an open custom dropdown's own options) — a keydown originating from inside
// one of these (or a descendant of one) must pass through completely
// untouched: no preventDefault, no character cycling. `closest` walks up
// from the event target, so this also covers a keydown that bubbles from a
// descendant of the input/listbox (e.g. an icon inside a combobox trigger).
// This is an ENUMERATED ALLOWLIST, not a general heuristic — it names the
// specific arrow-key-consuming controls that exist today in the two gallery
// panes (MechanismGallery, TouchGallery). Any new widget added to either pane
// that consumes ArrowLeft/ArrowRight itself (e.g. a role="radio" group,
// role="slider", role="tab" strip, or a custom listbox not already covered
// here) MUST add its selector to this list, or the pane-level cycle handler
// will swallow its arrow keys before the widget ever sees them.
const SKIP_SELECTOR =
  'input, textarea, select, [contenteditable], [contenteditable="true"], [role="listbox"], [role="combobox"], [aria-expanded="true"]';

function originatesFromEditableOrOpenChooser(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(SKIP_SELECTOR) !== null;
}

export interface UseCharCycleKeysOptions {
  /** The full character list to cycle through (same list CharScrollStrip renders chips for — `inventory` in both galleries). */
  chars: readonly string[];
  /** Currently selected character, or null before the list has settled. */
  currentChar: string | null;
  /** Jump directly to a character — the SAME handler the chip's onClick uses (handleSelectChar / handleSelectDisplayChar), so this hook never introduces a second selection path. */
  onSelectChar: (char: string) => void;
}

/**
 * Returns a keydown handler for the caller to attach via a plain JSX
 * `onKeyDown` prop on the gallery's pane-level wrapping div — bubbling alone
 * is enough to catch a keydown from any focused descendant, so no ref/
 * `addEventListener` plumbing is needed (React's synthetic event system
 * already delegates a native bubbling KeyboardEvent up to this prop).
 *
 * Handles ONLY ArrowLeft (previous) / ArrowRight (next); every other key is
 * ignored (returns without calling `preventDefault`). An empty `chars` list
 * is a no-op (also no `preventDefault` — mirrors the original
 * CharScrollStrip behavior of leaving the event alone when there's nothing
 * to cycle through).
 */
export function useCharCycleKeys({
  chars,
  currentChar,
  onSelectChar,
}: UseCharCycleKeysOptions): (e: ReactKeyboardEvent<HTMLElement>) => void {
  return useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      // Guard first, before the empty-list check: an editable/open-chooser
      // target must be left alone regardless of whether `chars` happens to
      // be empty this render.
      if (originatesFromEditableOrOpenChooser(e.target)) return;
      if (chars.length === 0) return;
      e.preventDefault();
      const next = stepChar(chars, currentChar, e.key === "ArrowRight" ? 1 : -1);
      if (next === null) return; // defensive only — chars.length > 0 above guarantees a value
      onSelectChar(next);
    },
    [chars, currentChar, onSelectChar],
  );
}
