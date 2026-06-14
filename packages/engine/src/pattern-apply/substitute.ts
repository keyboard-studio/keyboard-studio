// Pattern slot substitution — replaces {{slotId}} placeholders in a kmnFragment.
// The placeholder syntax is defined in spec §5 (Pattern.kmnFragment contract).
// This module is pure: no I/O, no side effects.

/**
 * Result of a slot-substitution pass.
 */
export interface SubstituteResult {
  /** The fragment text with all resolvable {{slotId}} tokens replaced. */
  text: string;
  /**
   * Slot ids that appeared in the fragment but had no corresponding value in
   * `slotValues`. Each id is listed at most once regardless of how many times
   * the token appears. Empty array means all tokens were resolved.
   */
  unresolved: string[];
}

/**
 * Replace every `{{slotId}}` token in `fragment` with the corresponding value
 * from `slotValues`.
 *
 * Token matching is literal: the spec §5 placeholder syntax is `{{slotId}}`
 * with no internal whitespace — a token like `{{ slotId }}` is NOT a valid
 * placeholder and will be left as-is (matching the exact fixture style in
 * `packages/contracts/src/fixtures/patterns.ts`).
 *
 * Repeated occurrences of the same token are ALL replaced in one pass.
 * A token is only reported in `unresolved` once, regardless of how many
 * times it appears.
 *
 * @param fragment   - The kmnFragment string containing zero or more `{{slotId}}`
 *                     placeholders.
 * @param slotValues - Map of slotId to resolved value strings.
 * @returns `{ text, unresolved }` where `text` is the substituted fragment and
 *          `unresolved` lists any slot ids that were present in the fragment but
 *          absent from `slotValues`.
 */
export function substituteSlots(
  fragment: string,
  slotValues: Record<string, string>
): SubstituteResult {
  // Collect the distinct slot ids actually referenced in the fragment.
  // Pattern: {{ followed by one or more word chars (no internal whitespace),
  // followed by }}. This matches the exact fixture style `{{triggerKey}}` etc.
  const TOKEN_RE = /\{\{(\w+)\}\}/g;

  const seen = new Set<string>();
  const unresolved: string[] = [];

  // First pass: find all distinct token ids and classify them.
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(fragment)) !== null) {
    const id = m[1] as string;
    if (!seen.has(id)) {
      seen.add(id);
      if (!(id in slotValues)) {
        unresolved.push(id);
      }
    }
  }

  // Second pass: replace all resolved tokens. Unresolved tokens are left
  // verbatim so the caller can inspect the result if needed.
  let text = fragment;
  for (const id of seen) {
    const value = slotValues[id];
    if (value === undefined) continue; // unresolved — leave as-is
    // Replace ALL occurrences in one replaceAll call.
    text = text.replaceAll(`{{${id}}}`, value);
  }

  return { text, unresolved };
}
