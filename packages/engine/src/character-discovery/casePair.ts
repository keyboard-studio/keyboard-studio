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
 *
 * Known limitation: Unicode-bicameral but orthographically-unicameral scripts
 * ---------------------------------------------------------------------------
 * The guards below are Unicode general-category tests (`\p{Ll}`/`\p{Lu}`),
 * not orthographic-convention tests. For most scripts that coincides with
 * "is this actually a Shift-key pairing an author would want" — but not
 * always. Georgian Mkhedruli is the sharp case: Unicode 11.0 gave Mkhedruli a
 * formal Mtavruli uppercase (ა U+10D0 -> Ⴀ U+1C90, ბ U+10D1 -> Ბ U+1C91), so
 * this function happily returns a counterpart for it, but standard Georgian
 * orthography does not case-alternate — Mtavruli is a headers/inscriptions
 * register, not the everyday companion of Mkhedruli. Cherokee (ꭰ U+AB70 <->
 * Ꭰ U+13A0) is nominally bicameral the same way. There is deliberately no
 * suppression list here for this class (see the "no suppression list"
 * paragraph above) — this primitive stays a pure Unicode fact, and the
 * orthographic-convention judgment call is made by the one caller that turns
 * a counterpart into an authored proposal: the studio's `propose()` in
 * `packages/studio/src/editors/assignLoop/casePairCompanion.ts` suppresses
 * Georgian specifically (corpus evidence: `basic_kbdgeo` maps every
 * `[SHIFT K_x]` to the identical codepoint as its base rule, and the facet
 * classifier independently labels it caseless). Cherokee and any other
 * Unicode-bicameral-but-arguably-unicameral script are NOT suppressed there
 * and remain a known, accepted v1 gap mitigated by propose-then-confirm.
 */

/**
 * Case-map `char` using the locale-sensitive `toLocale{Upper,Lower}Case`
 * when `bcp47` is supplied, falling back to the plain locale-insensitive
 * mapping when `bcp47` is malformed. Per ECMA-402, `toLocaleUpperCase` /
 * `toLocaleLowerCase` throw a `RangeError` for a tag that isn't a
 * structurally valid BCP47 string (e.g. "not a tag!!") — a caller-supplied
 * identity `bcp47` should degrade the proposal, not crash the studio.
 */
function localeCase(
  char: string,
  bcp47: string | undefined,
  direction: "toUpper" | "toLower",
): string {
  if (bcp47 === undefined) {
    return direction === "toUpper" ? char.toUpperCase() : char.toLowerCase();
  }
  try {
    return direction === "toUpper"
      ? char.toLocaleUpperCase(bcp47)
      : char.toLocaleLowerCase(bcp47);
  } catch (err) {
    if (err instanceof RangeError) {
      return direction === "toUpper" ? char.toUpperCase() : char.toLowerCase();
    }
    throw err;
  }
}

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
 *      `toUpperCase()` / `toLowerCase()` otherwise, and also as a fallback
 *      when `bcp47` is malformed — see {@link localeCase}), and must itself
 *      be exactly one code point, different from `char`, and match the
 *      expected general category (`\p{Lu}` for toUpper, `\p{Ll}` for toLower)
 *      — this rejects multi-character case expansions (ß -> SS, ﬃ -> FFI)
 *      and self-mapping letters (e.g. U+0138 LATIN SMALL LETTER KRA).
 *
 * @param char   Exactly one character (code point) to find the counterpart of.
 * @param bcp47  Optional BCP47 tag used for locale-sensitive case mapping
 *               (e.g. "tr" so "i" maps to "İ" rather than "I"). A malformed
 *               tag falls back to the locale-insensitive mapping rather than
 *               throwing — see {@link localeCase}.
 */
export function caseCounterpart(
  char: string,
  bcp47?: string,
): { counterpart: string; direction: "toUpper" | "toLower" } | null {
  if ([...char].length !== 1) return null;
  if (/^\p{M}$/u.test(char)) return null;

  let direction: "toUpper" | "toLower";

  if (/^\p{Ll}$/u.test(char)) {
    direction = "toUpper";
  } else if (/^\p{Lu}$/u.test(char)) {
    direction = "toLower";
  } else {
    return null;
  }

  const candidate = localeCase(char, bcp47, direction);

  if ([...candidate].length !== 1) return null;
  if (candidate === char) return null;

  const expectedCategory = direction === "toUpper" ? /^\p{Lu}$/u : /^\p{Ll}$/u;
  if (!expectedCategory.test(candidate)) return null;

  return { counterpart: candidate, direction };
}
