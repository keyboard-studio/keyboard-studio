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
 * The one place the NFD-decompose-and-check composability rule lives.
 * Canonical-NFD-decomposes `ch` and, when every resulting code point is
 * already a member of `produced`, returns those components in NFD order.
 * Returns `undefined` when `ch` is NFD-stable (decomposition length < 2 —
 * nothing to compose) or when at least one component is missing from
 * `produced`.
 *
 * Shared by {@link augmentWithComposable} (the produced/covered-set
 * augmenter) and the engine's `collectCompositionMethod` (the "Existing
 * methods" composition-row synthesizer) — both need the exact same
 * decompose-and-check rule, so it lives here once rather than being
 * re-derived at each call site.
 *
 * @param produced - The set of glyphs directly produced/reachable (never
 *                   itself augmented — see this module's "ONE LEVEL only"
 *                   rule above).
 * @param ch       - The candidate character to test for composability.
 */
export function composableComponentsFor(
  produced: ReadonlySet<string>,
  ch: string,
): { components: string[] } | undefined {
  const components = [...ch.normalize("NFD")];
  if (components.length < 2) return undefined;
  if (!components.every((c) => produced.has(c))) return undefined;
  return { components };
}

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
    if (composableComponentsFor(out, ch) !== undefined) out.add(ch);
  }
  return out;
}
