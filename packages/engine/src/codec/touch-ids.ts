/**
 * touch-ids — Keyman touch-layout key-id helpers.
 *
 * Shared between the scaffolder (scaffoldTouchLayout) and the pattern-apply
 * layer (applyTouchAssignments); extracted here so neither module duplicates
 * the logic and no cross-layer dependency is introduced between them.
 *
 * @see https://help.keyman.com/developer/language/guide/touch-layout-ids
 */

/**
 * Convert a Unicode character to its Keyman touch-layout key id.
 *
 * Keyman derives the output character directly from a `U_<UPPERHEX>` key id —
 * no `output` field is needed alongside it (and including one can confuse
 * kmc-kmn). The hex is uppercase, zero-padded to at least 4 digits (5 for
 * astral planes, e.g. U_1F600).
 *
 * The input is normalized to NFC before extracting the code point so that
 * NFD inputs (base + combining mark as separate code points) yield the same
 * id as their precomposed NFC equivalent — e.g. "á" → "U_00E1".
 *
 * Returns `"U_FFFD"` (REPLACEMENT CHARACTER) when the input string has no
 * valid code point (empty string edge case).
 *
 * @example
 *   charToUnicodeKeyId("a")  // "U_0061"
 *   charToUnicodeKeyId("|")  // "U_007C"
 *   charToUnicodeKeyId("\\") // "U_005C"
 *   charToUnicodeKeyId("$")  // "U_0024"
 */
export function charToUnicodeKeyId(char: string): string {
  const cp = char.normalize("NFC").codePointAt(0);
  if (cp === undefined) return "U_FFFD";
  const hex = cp.toString(16).toUpperCase().padStart(4, "0");
  return `U_${hex}`;
}
