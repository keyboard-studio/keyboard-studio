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
