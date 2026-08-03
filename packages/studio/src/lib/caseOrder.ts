// caseOrder — shared lowercase-first walk-order helper for the assignment-loop
// galleries (MechanismGallery via useInventoryDiff.ts, TouchGallery directly).
//
// Both galleries' character walk should present every lowercase letter
// (`\p{Ll}`) before any uppercase letter (`\p{Lu}`), so that when a lowercase
// letter and its uppercase counterpart are both queued, the lowercase is
// always implemented first — the precondition the case-pair companion
// (casePairCompanion.ts) needs to have something to propose a shift-layer/
// parallel-combo/shift-layer placement for (that hook only ever proposes
// lower->upper, never the reverse). This is purely a walk-order concern: it
// is NOT a second casing-derivation path (the engine's `caseCounterpart` is
// untouched — this only asks "is this one \p{Lu}?", never derives a
// counterpart) and it never changes set membership, only order.
//
// Single source so the two galleries' walk lists cannot drift on the sort
// key (FR-002-style discipline, mirrored for this narrower "is this
// uppercase" predicate).

/** `true` only for a single `\p{Lu}` (uppercase letter) codepoint — the
 *  lowercase-first walk-order sort key. Deliberately narrower than "does this
 *  string contain an uppercase letter anywhere" so a multi-codepoint entry
 *  that isn't itself a bare uppercase letter (e.g. a still-decomposed
 *  combining sequence) is not misclassified. Not a casing derivation — it
 *  never produces a counterpart, only a boolean rank for sorting. */
export function isUppercaseLetter(char: string): boolean {
  return [...char].length === 1 && /^\p{Lu}$/u.test(char);
}

/**
 * Stable-sort `chars` so every uppercase-letter entry walks after every
 * non-uppercase entry (lowercase letters and anything else alike), preserving
 * relative order within each bucket — Array.prototype.sort is spec-stable
 * (ES2019+, the runtime floor this repo already requires — see CLAUDE.md).
 */
export function lowercaseFirst(chars: readonly string[]): string[] {
  return [...chars].sort(
    (a, b) => Number(isUppercaseLetter(a)) - Number(isUppercaseLetter(b)),
  );
}
