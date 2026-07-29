/**
 * composable — Unicode-composability "available" rule shared by the desktop
 * and touch galleries.
 *
 * A target char that a keyboard does not directly produce is still
 * effectively available if it is COMPOSABLE: canonical-NFD-decomposing it
 * yields a sequence of code points that are EVERY ONE already a member of the
 * produced set (e.g. "Û" decomposes to "U" + U+0302 COMBINING CIRCUMFLEX
 * ACCENT; if the keyboard separately produces both, "Û" is composable even
 * though it never appears as a single produced glyph).
 *
 * Rules (per km-domain):
 *   - Canonical NFD only, never NFKD (compatibility decomposition would fold
 *     in unrelated formatting distinctions this rule must not use).
 *   - Order-independent — every decomposed code point must be present, in any
 *     order.
 *   - ONE LEVEL only — every NFD component must be DIRECTLY in the produced
 *     set. No recursion (i.e. a component that is itself only composable from
 *     yet-more-basic parts does not count).
 *   - NFD-stable chars (decomposition length < 2, or equal to the char) are
 *     unaffected — there is nothing to compose.
 *   - No composition-exclusion special-casing needed: NFD is unaffected by
 *     the composition-exclusion table (that table only governs NFC/re-composition).
 *   - Bounded by the target inventory, never the whole Unicode range.
 *
 * Iterates code points via spread/for..of (not `.length`/`charCodeAt`) so
 * astral characters decompose correctly.
 *
 * Pure, browser-safe, no I/O.
 */

/**
 * Returns a new set containing `produced` plus every char from
 * `targetInventory` that is not already produced but is composable from
 * chars that are.
 *
 * @param produced        - The set of glyphs directly produced by the keyboard.
 * @param targetInventory - The bounded set of chars to test for composability
 *                          (never the whole Unicode range).
 */
export function augmentWithComposable(
  produced: ReadonlySet<string>,
  targetInventory: readonly string[],
): Set<string> {
  const out = new Set(produced);
  for (const ch of targetInventory) {
    if (out.has(ch)) continue;
    const d = ch.normalize("NFD");
    if ([...d].length < 2) continue;
    if ([...d].every((c) => out.has(c))) out.add(ch);
  }
  return out;
}
