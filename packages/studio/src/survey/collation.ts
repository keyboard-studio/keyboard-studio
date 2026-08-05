// Shared default-ICU collation comparator for ordering the alphabet-breakdown
// sections (specs/047-alphabet-inventory-categories, FR-007). `Intl.Collator`
// is the platform ICU binding; invoked with no locale it uses the root/default
// collation, which places accented letters adjacent to their base letter
// (SC-003) with no data file and no dependency. Per-language tailored ordering
// is explicitly deferred by the spec.
//
// Only the DISPLAY array is sorted with this — the stored `chars`/picks stay in
// first-appearance order, and the character picker's Unicode-value ordering is
// left untouched (FR-012).

const collator = new Intl.Collator(undefined, { usage: "sort" });

/** Default-ICU comparator: `[...chars].sort(collateCompare)`. */
export function collateCompare(a: string, b: string): number {
  return collator.compare(a, b);
}

/** Return a new array sorted by the default ICU collation (does not mutate). */
export function collate(chars: readonly string[]): string[] {
  return [...chars].sort(collateCompare);
}

/**
 * Raw Unicode code-point comparator. Used for BARE combining marks (spec 047):
 * a lone diacritic has no meaningful dictionary position, so it is shown in
 * code-point order rather than ICU collation order. Compares by the first code
 * point (combining marks are single code points).
 */
export function codePointCompare(a: string, b: string): number {
  return (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0);
}

/**
 * True when `char` is a "bare combining mark" — a grapheme string whose FIRST
 * code point is General_Category M (Mn/Mc/Me), tested via `\p{M}` (not a
 * hardcoded U+0300-036F range — Hebrew niqqud and Arabic marks live outside
 * that block). Used by {@link collateInventory} to route a lone diacritic to
 * code-point order instead of ICU order (see `codePointCompare`'s doc
 * comment) — the SAME partition PhaseB.tsx's breakdown/exemplar-detail
 * sections already apply by hand via `isCombiningMarkChar` + `.sort`, hoisted
 * here as a single reusable entry point for the walk/inventory call sites
 * (MechanismGallery, TouchGallery) that previously called bare `collate()`
 * without partitioning marks out first.
 */
function isBareCombiningMark(char: string): boolean {
  return /^\p{M}/u.test(char);
}

/**
 * Partition-then-collate an inventory/walk list (spec 047 refinement; the
 * indexing/walk-order shaped bug this fixes): bare combining marks collate to
 * ICU position 0 under `collate()`'s root comparator (root collation treats
 * an unattached combining mark as sorting before every base letter), which
 * inserts a phantom "first" walk entry and shifts every other character's
 * index by one. `collateInventory` avoids this by partitioning the input into
 * (A) letters/letter+mark stacks — sorted with `collate()` (default-ICU) —
 * and (B) bare combining marks — sorted with `codePointCompare` (raw
 * code-point order; a lone diacritic has no meaningful dictionary position) —
 * then returns A followed by B, so marks always trail rather than lead.
 *
 * Does not mutate `chars`; does not change SET membership, only order —
 * every existing invariant that depends on the walk/inventory array's
 * CONTENTS (coverage denominators, membership checks) is unaffected.
 */
export function collateInventory(chars: readonly string[]): string[] {
  const letters: string[] = [];
  const marks: string[] = [];
  for (const c of chars) {
    (isBareCombiningMark(c) ? marks : letters).push(c);
  }
  return [...collate(letters), ...marks.sort(codePointCompare)];
}
