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
  // currentChar in `list`. Forward/back always move by one position; they
  // never search for the next uncovered/unconfigured character, so an
  // already-handled character is never skipped over.
  const currentIdx = currentChar !== null ? list.indexOf(currentChar) : -1;
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
  // ungated by covered/configured status. `list.includes` (not indexOf-then-
  // compare) keeps the "not present -> no-op" check self-contained; the
  // caller (CharScrollStrip) only ever offers chips drawn from this same
  // `list`, so the not-found branch is defense-in-depth rather than a
  // reachable UI path.
  const handleSelectChar = useCallback(
    (char: string) => {
      if (!list.includes(char)) return;
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
