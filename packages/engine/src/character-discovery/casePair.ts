/**
 * caseCounterpart — deterministic case-pair helper for the shift-layer
 * case-pair proposal (studio maps a lowercase key to θ, engine proposes Θ on
 * the shift layer).
 *
 * Distinct from suggestMissing.ts's isCovered()
 * -----------------------------------------------
 * `isCovered` (character-discovery/suggestMissing.ts) answers "is this
 * candidate character already produced by the base keyboard, treating case
 * as fungible?" — it is a coverage/dedup check consumed internally by the
 * missing-character survey, and it deliberately suppresses case-folding for
 * Latin-script Turkic locales (the dotted-I hazard) because a false "covered"
 * there would silently hide a needed character from the survey.
 *
 * `caseCounterpart` answers a different question: "given ONE character the
 * user has already assigned, what is its case counterpart, if any?" — it is
 * a proposal-generation helper for the studio's shift-layer UI, always
 * computes a candidate (there is no suppression list), and is bidirectional
 * (upper->lower as well as lower->upper). Do not merge the two: swapping
 * `isCovered`'s Turkic suppression into this function would incorrectly
 * refuse to propose "İ" for "i" under a "tr" tag, which is exactly the
 * proposal this function exists to make.
 */

/**
 * Returns the case counterpart of a single character, or null when no
 * confident single-character counterpart exists.
 *
 * Guards (all must pass, else null):
 *   1. `char` is exactly one code point; combining marks (`\p{M}`) are rejected.
 *   2. `char` matches `\p{Ll}` (candidate = uppercase) or `\p{Lu}` (candidate =
 *      lowercase); any other general category (caseless scripts — Arabic,
 *      Devanagari, etc.) returns null.
 *   3. The candidate is computed via `toLocaleUpperCase(bcp47)` /
 *      `toLocaleLowerCase(bcp47)` when `bcp47` is supplied (plain
 *      `toUpperCase()` / `toLowerCase()` otherwise), and must itself be
 *      exactly one code point, different from `char`, and match the expected
 *      general category (`\p{Lu}` for toUpper, `\p{Ll}` for toLower) — this
 *      rejects multi-character case expansions (ß -> SS, ﬃ -> FFI) and
 *      self-mapping letters (e.g. U+0138 LATIN SMALL LETTER KRA).
 *
 * @param char   Exactly one character (code point) to find the counterpart of.
 * @param bcp47  Optional BCP47 tag used for locale-sensitive case mapping
 *               (e.g. "tr" so "i" maps to "İ" rather than "I").
 */
export function caseCounterpart(
  char: string,
  bcp47?: string,
): { counterpart: string; direction: "toUpper" | "toLower" } | null {
  if ([...char].length !== 1) return null;
  if (/^\p{M}$/u.test(char)) return null;

  let direction: "toUpper" | "toLower";
  let candidate: string;

  if (/^\p{Ll}$/u.test(char)) {
    direction = "toUpper";
    candidate = bcp47 !== undefined ? char.toLocaleUpperCase(bcp47) : char.toUpperCase();
  } else if (/^\p{Lu}$/u.test(char)) {
    direction = "toLower";
    candidate = bcp47 !== undefined ? char.toLocaleLowerCase(bcp47) : char.toLowerCase();
  } else {
    return null;
  }

  if ([...candidate].length !== 1) return null;
  if (candidate === char) return null;

  const expectedCategory = direction === "toUpper" ? /^\p{Lu}$/u : /^\p{Ll}$/u;
  if (!expectedCategory.test(candidate)) return null;

  return { counterpart: candidate, direction };
}
