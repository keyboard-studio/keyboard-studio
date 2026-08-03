// usePositionalCharNav — shared positional character-navigation logic for the
// two Phase C/E "one character at a time" assignment-loop galleries
// (MechanismGallery: physical/desktop; TouchGallery: touch). Both walk a
// fixed character list in strict positional (index-based) order — Back/Next
// always move by exactly one position, never searching for the next
// uncovered/unconfigured character, so an already-handled character is never
// silently skipped over. Extracted so the two galleries cannot drift on
// Back/Next/Skip/Previous semantics. The per-gallery gating that sits on top
// of this hook (e.g. canGoNext/canApply, which decide whether Next/Done is
// enabled) stays in each gallery — this hook only owns the navigation itself.

import { useCallback, useState } from "react";

// ---------------------------------------------------------------------------
// Identity helpers — shaped-bug fix (walk-order/indexing).
//
// `list.indexOf(currentChar)` / `list.includes(currentChar)` compare by RAW
// string equality. That silently strands the walk when the SAME character
// changes representation across a reflow — e.g. `collateInventory`'s
// NFC-dedup (survey/collation.ts) now displays "ӝ" (U+04DD, precomposed)
// where an earlier render may have held the canonically-equivalent decomposed
// form ("ж" + combining diaeresis) as `currentChar` — raw equality treats
// those as two different values even though they are one character. Comparing
// by NFC canonical form makes membership/position checks robust to that
// representation drift, matching the NFC-identity convention the rest of the
// inventory pipeline already uses (useInventoryDiff.ts, buildProducedSet).
// ---------------------------------------------------------------------------

/**
 * NFC-canonical-form equality — the identity two menu chips/walk entries
 * share. Exported for other identity-sensitive comparisons over the same
 * walk list (CharScrollStrip's `isSelected` chip highlight).
 */
export function sameCharIdentity(a: string, b: string): boolean {
  return a.normalize("NFC") === b.normalize("NFC");
}

/**
 * Position of `char` in `list` by NFC identity, or -1 if absent. Exported so
 * other identity-sensitive consumers of the SAME walk list (CharScrollStrip's
 * windowing) use the identical comparison rather than a raw `indexOf` that
 * would strand on a representation change (see the module doc comment).
 */
export function indexOfChar(list: readonly string[], char: string): number {
  return list.findIndex((c) => sameCharIdentity(c, char));
}

/**
 * Resolve the character `currentChar` should become after `nextList` reflows
 * (insertion/removal/reorder), so a removed character never strands the walk
 * on a stale value nor jumps arbitrarily far away:
 *   1. Still present (by NFC identity) → keep it (no navigation change).
 *   2. `currentChar` is null / `prevList` didn't have it → the first entry.
 *   3. Removed → the NEAREST surviving neighbor: walk outward from its OLD
 *      position in `prevList`, preferring the entry that slid into that same
 *      slot, then alternating outward on either side, so the walk resumes as
 *      close as possible to where the author was rather than jumping to
 *      "first uncovered"/`list[0]` (which can be arbitrarily far away in a
 *      long inventory).
 *
 * Pure — no store/React reads; both galleries' currentChar-sync effects call
 * this instead of hand-rolling their own "keep if present, else first" logic,
 * so they can't drift on the fallback behavior.
 */
export function nearestSurvivingChar(
  prevList: readonly string[],
  prevChar: string | null,
  nextList: readonly string[],
): string | null {
  if (nextList.length === 0) return null;
  if (prevChar === null) return nextList[0] ?? null;

  const stillPresentIdx = indexOfChar(nextList, prevChar);
  if (stillPresentIdx !== -1) return nextList[stillPresentIdx] as string;

  const oldIdx = indexOfChar(prevList, prevChar);
  if (oldIdx === -1) return nextList[0] ?? null;

  for (let offset = 0; offset < nextList.length; offset++) {
    const after = nextList[oldIdx + offset];
    if (after !== undefined) return after;
    const before = nextList[oldIdx - offset];
    if (before !== undefined) return before;
  }
  return nextList[0] ?? null;
}

export interface UsePositionalCharNavOptions {
  /** The fixed, ordered character list this gallery walks (lettersToAdd / inventory). */
  list: readonly string[];
  /** Current character, or null before the list has settled / when empty. */
  currentChar: string | null;
  /** Setter for currentChar — always called with a literal value, never an updater. */
  setCurrentChar: (char: string | null) => void;
  /**
   * Called instead of advancing when Next/Skip is invoked from the LAST
   * character in `list` — the phase-completion action. Optional because
   * MechanismGallery's onComplete prop is itself optional; a caller with a
   * differently-shaped completion callback (e.g. TouchGallery's
   * onComplete(assignments), which needs its own wrapping) passes that
   * wrapper here instead.
   */
  onComplete?: (() => void) | undefined;
  /**
   * Called instead of moving back when Back is invoked from the FIRST
   * character in `list` (or when currentChar isn't in the list) — exits to
   * the previous phase. Optional so a caller with a conditionally-absent
   * prop can omit it; Back then becomes a no-op in that case rather than
   * throwing.
   */
  onBack?: (() => void) | undefined;
  /**
   * Seeds the suggestionResolved set once, on first mount only (like a lazy
   * useState initializer — later changes to this value are NOT re-read).
   * Pass persisted state here (e.g. a store draft) so a resolved suggestion
   * survives unmount/remount; omit for component-lifetime-only tracking.
   */
  initialSuggestionResolved?: Iterable<string> | undefined;
}

export interface UsePositionalCharNavResult {
  /** Position of currentChar in `list`, or -1 if not found / currentChar is null. */
  currentIdx: number;
  /** True when there is a character after currentChar in `list`. */
  hasAnotherCharAfterCurrent: boolean;
  /**
   * Advance one position, or call onComplete from the last character. Skip
   * is pure forward navigation with no side effects of its own — the Skip
   * button in each gallery calls this directly rather than duplicating it,
   * so Skip and Next/Done can never drift.
   */
  handleNext: () => void;
  /** Move back one position, or call onBack from the first character. */
  handleBack: () => void;
  /**
   * Move back one position, ungated by covered/configured status on the
   * character being left; unlike handleBack, this never exits the phase (a
   * no-op on the first character).
   */
  handlePreviousChar: () => void;
  /**
   * Jump directly to `char` — forward OR backward, to any position in
   * `list` — ungated by covered/configured status on the character being
   * left (same "no side effects of navigation itself" contract as
   * handlePreviousChar/handleNext/handleBack). A no-op when `char` is not
   * present in `list`. Backs the character-scroll-strip chip clicks (the
   * horizontal character strip that replaced the old "Previous character"
   * button — see CharScrollStrip.tsx): a click on ANY chip, not just the one
   * immediately before the current position, must be able to navigate there.
   */
  handleSelectChar: (char: string) => void;
  /**
   * Characters whose suggestion row/card has been explicitly accepted or
   * denied — a resolved suggestion never reappears, even on Back navigation
   * to that character. Skipping does not resolve a suggestion.
   */
  suggestionResolved: Set<string>;
  /** Marks `char` resolved (accept or deny) — a no-op if already resolved. */
  markSuggestionResolved: (char: string) => void;
}

export function usePositionalCharNav({
  list,
  currentChar,
  setCurrentChar,
  onComplete,
  onBack,
  initialSuggestionResolved,
}: UsePositionalCharNavOptions): UsePositionalCharNavResult {
  const [suggestionResolved, setSuggestionResolved] = useState<Set<string>>(
    () => new Set(initialSuggestionResolved ?? []),
  );

  const markSuggestionResolved = useCallback((char: string) => {
    setSuggestionResolved((prev) => {
      if (prev.has(char)) return prev;
      const next = new Set(prev);
      next.add(char);
      return next;
    });
  }, []);

  // Deterministic linear positional navigation — idx = position of
  // currentChar in `list`, by NFC identity (see `indexOfChar` — a reflow that
  // changes currentChar's representation, e.g. collateInventory's NFC-dedup,
  // must not strand the walk on a raw-string mismatch). Forward/back always
  // move by one position; they never search for the next
  // uncovered/unconfigured character, so an already-handled character is
  // never skipped over.
  const currentIdx = currentChar !== null ? indexOfChar(list, currentChar) : -1;
  const hasAnotherCharAfterCurrent =
    currentIdx >= 0 && currentIdx < list.length - 1;

  const handleNext = useCallback(() => {
    // idx === -1 (currentChar not found in `list`) is defense-in-depth
    // against the caller's sync effect invariant (which keeps currentChar in
    // sync with `list`) — reusing the outer currentIdx (already derived from
    // currentChar/list, both already in this callback's deps) rather than
    // recomputing indexOf(). Without this guard, an empty `list` would make
    // idx === -1 === list.length - 1, spuriously firing the "last character
    // -> complete" branch below.
    if (currentChar === null || currentIdx === -1) return;
    if (currentIdx === list.length - 1) {
      // Last character — forward is the phase completion.
      onComplete?.();
      return;
    }
    setCurrentChar(list[currentIdx + 1] ?? null);
  }, [currentChar, currentIdx, list, onComplete, setCurrentChar]);

  // Back handler — moves to the previous position in `list`. On the FIRST
  // character, Back exits to the previous phase via onBack. Always available
  // whenever currentChar !== null and `list` is non-empty — positional, so
  // it survives remount (no history stack to lose).
  const handleBack = useCallback(() => {
    // See handleNext for the idx === -1 defense-in-depth rationale.
    if (currentChar === null || currentIdx === -1) return;
    if (currentIdx <= 0) {
      onBack?.();
      return;
    }
    setCurrentChar(list[currentIdx - 1] ?? null);
  }, [currentChar, currentIdx, list, onBack, setCurrentChar]);

  // Previous character — steps back one position in `list`, ungated by
  // covered/configured status on the character being left. Unlike
  // handleBack, this never exits the phase: it is a no-op on the first
  // character (currentIdx <= 0), where the caller-side disabled condition
  // already prevents the click, but the handler stays defensive on its own.
  const handlePreviousChar = useCallback(() => {
    if (currentChar === null || currentIdx <= 0) return;
    setCurrentChar(list[currentIdx - 1] ?? null);
  }, [currentChar, currentIdx, list, setCurrentChar]);

  // Select-by-value — jumps to ANY position in `list`, forward or backward,
  // ungated by covered/configured status. Membership by NFC identity (see
  // `indexOfChar`), not raw equality — the caller (CharScrollStrip) only ever
  // offers chips drawn from this same `list`, so the not-found branch is
  // defense-in-depth rather than a reachable UI path, but a reflow-driven
  // representation change (e.g. collateInventory's NFC-dedup) must not turn
  // a legitimate chip click into a silent no-op.
  const handleSelectChar = useCallback(
    (char: string) => {
      if (indexOfChar(list, char) === -1) return;
      setCurrentChar(char);
    },
    [list, setCurrentChar],
  );

  return {
    currentIdx,
    hasAnotherCharAfterCurrent,
    handleNext,
    handleBack,
    handlePreviousChar,
    handleSelectChar,
    suggestionResolved,
    markSuggestionResolved,
  };
}
