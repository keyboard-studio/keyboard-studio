/**
 * touch-ids — Keyman touch-layout key-id helpers.
 *
 * Shared between the scaffolder (scaffoldTouchLayout) and the pattern-apply
 * layer (applyTouchAssignments); extracted here so neither module duplicates
 * the logic and no cross-layer dependency is introduced between them.
 *
 * @see https://help.keyman.com/developer/current-version/reference/file-types/keyman-touch-layout
 */

import { decodeUnicodeKeyId, toHex4 } from "@keyboard-studio/contracts";

/**
 * Uppercase, zero-padded-to-4-digits hex of the FIRST Unicode code point in
 * `char` after NFC normalization (5 digits for astral planes, e.g. 1F600) -
 * the shared "hex of a character" primitive behind charToUnicodeKeyId's `U_`
 * prefix below AND pattern-apply/keyIdMinting.ts's `T_<UPPERHEX>` minting
 * (spec 063 key-id-policy.md section 2), so the two id forms cannot drift
 * apart from each other.
 *
 * The input is normalized to NFC before extracting the code point so that
 * NFD inputs (base + combining mark as separate code points) yield the same
 * hex as their precomposed NFC equivalent (e.g. "a" + combining acute yields
 * the same hex as precomposed "á").
 *
 * Returns `"FFFD"` (REPLACEMENT CHARACTER) when the input string has no valid
 * code point (empty string edge case).
 */
export function unicodeCharHex(char: string): string {
  const cp = char.normalize("NFC").codePointAt(0);
  if (cp === undefined) return "FFFD";
  return toHex4(cp);
}

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
  return `U_${unicodeCharHex(char)}`;
}

/**
 * Decode a Keyman touch-layout `U_<HEX>[_<HEX>]*` key id back to the
 * character(s) it produces — the inverse of {@link charToUnicodeKeyId} for
 * the single-codepoint case (the encoder itself stays single-codepoint-only).
 * Delegates to the canonical decode in @keyboard-studio/contracts so this
 * package's callers (e.g. `keyMatchesRemovalSet` in
 * pattern-apply/touch-mechanism-shared.ts) get Keyman 15+ multi-codepoint id
 * support (e.g. `U_0061_0303`, a base+combining sequence) for free.
 *
 * Returns `undefined` when `id` does not match the `U_<HEX>[_<HEX>]*` form —
 * e.g. a `K_`-form virtual key id, or the reserved `T_removed_<n>` placeholder
 * id used by `applyDesktopModifications` — since such ids do not, by
 * construction, decode to a character.
 *
 * @example
 *   unicodeKeyIdToChar("U_0061")       // "a"
 *   unicodeKeyIdToChar("U_0061_0303")  // "a" + combining tilde (NFD "ã")
 *   unicodeKeyIdToChar("K_A")          // undefined
 */
export function unicodeKeyIdToChar(id: string): string | undefined {
  return decodeUnicodeKeyId(id);
}
