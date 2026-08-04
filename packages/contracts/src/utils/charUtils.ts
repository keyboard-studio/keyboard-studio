// ---------------------------------------------------------------------------
// Shared Unicode codepoint utilities — a single canonical place for U+XXXX
// parsing so every consumer (engine, studio) uses the same logic.
// ---------------------------------------------------------------------------

/**
 * Drop keys whose value is `undefined` so the result satisfies
 * `exactOptionalPropertyTypes` (an explicit `key: undefined` is not
 * assignable to an optional field; an absent key is).
 *
 * Shared, top-level-only strip used by the package's several `makeX`
 * factories (see provenance.ts, placementMap.ts, linguistInventory.ts) that
 * each previously defined an identical private copy of this function.
 */
export function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

/** Shared "4+-digit uppercase hex of a single codepoint" primitive — the pad
 *  is a minimum, so 5-6 digit astral codepoints pass through unpadded. */
export function toHex4(codePoint: number): string {
  return codePoint.toString(16).toUpperCase().padStart(4, "0");
}

/** Converts the first code point of `char` to a `U+XXXX` string.
 *  Precondition: `char` is a non-empty string; only the first code point is used. */
export function toUPlusNotation(char: string): string {
  const cp = char.codePointAt(0)!;
  return "U+" + toHex4(cp);
}

/** General_Category test for a single code point: Lu/Ll/Lo/Lt/Lm (any letter). */
const IS_LETTER_CP = /^\p{L}$/u;

/**
 * General_Category test for a single code point: Mn (Nonspacing_Mark) ONLY —
 * deliberately narrower than the full combining-mark class (Mn/Mc/Me,
 * `\p{M}`). Used exclusively by `isDecomposableAccented` below; confirmed via
 * repo-wide grep to have no other consumer, so narrowing the constant in
 * place (rather than forking a local copy) does not affect any other caller.
 *
 * Why Mn and not `\p{M}`: an abugida's dependent vowel sign (matra) — e.g.
 * Devanagari U+093E (Mc, Spacing_Combining_Mark) in "का" (क + U+093E) — is
 * General_Category Mc, not Mn. Grammatically it composes with the preceding
 * consonant the same way an accent composes with a Latin base letter, but it
 * is NOT an "accented letter" in the sense this predicate exists to detect
 * (a deadkey/longpress candidate for adding a missing precomposed
 * character) — matra placement is an abugida-specific mechanism, gated
 * separately at the call sites (see MechanismGallery.tsx/TouchGallery.tsx).
 * Narrowing to Mn excludes the Mc matra case at the predicate level; the
 * script-class gate at the call sites additionally excludes the Mn
 * consonant+virama case, which the narrower regex alone does not catch
 * (virama, e.g. Devanagari U+094D, IS Mn — see the two comments below).
 *
 * Unaffected (still Mn, so still match after narrowing): Hebrew niqqud,
 * Arabic harakat, Latin combining diacritics (U+0300 range), multi-mark
 * stacks (e.g. Vietnamese "ệ").
 */
const IS_MARK_CP = /^\p{Mn}$/u;

/**
 * Returns true when `char` is a letter with one or more combining marks
 * (i.e. `NFD(char)` has 2+ code points, the FIRST is a letter — General_Category
 * Lu/Ll/Lo/Lt/Lm — and EVERY remaining code point is Mn, Nonspacing_Mark,
 * tested via `\p{Mn}`).
 *
 * Script-neutral (shaped-bug fix — the predicate used to be Latin-only: NFD
 * length exactly 2 with the second code point hardcoded to the Combining
 * Diacritical Marks block U+0300–U+036F). Broadenings, all domain-ruled:
 *   - `\p{Mn}` (not a fixed block range) — Hebrew niqqud and Arabic marks live
 *     outside U+0300–036F and would otherwise be silently excluded.
 *   - NFD length >= 2 (not === 2) — multi-mark stacks (e.g. Vietnamese "ệ" =
 *     e + circumflex + dot-below, 3 code points) are legitimate single
 *     "accented letter" units, not a decomposition failure.
 *
 * NARROWED (abugida-safe fix, km-domain ruling) from the full combining-mark
 * class (`\p{M}` = Mn/Mc/Me) down to Mn only. An abugida's dependent vowel
 * sign (matra) — e.g. Devanagari U+093E (Mc) in "का" — is General_Category
 * Mc, not Mn, so it no longer matches this predicate: a matra syllable is
 * not an "accented letter" in the sense this predicate exists to detect.
 * NOTE: consonant+virama (e.g. Devanagari क + U+094D) still matches — virama
 * IS Mn, General_Category-universal, not abugida-specific — so callers that
 * need to exclude the abugida virama case as well gate separately on
 * `axes.scriptClass !== "abugida"` (see MechanismGallery.tsx/TouchGallery.tsx).
 *
 * Hangul jamo need no special-case carve-out: a precomposed Hangul syllable's
 * NFD is a sequence of jamo, and jamo are General_Category Lo (letter), not M
 * — so the "every remaining code point is a mark" check already excludes them
 * for free.
 *
 * The name is kept (existing callers depend on it) even though the semantics
 * broadened beyond "accented" in the diacritic-mark sense — see callers in
 * MechanismGallery.tsx/TouchGallery.tsx/siblingAccents.ts, none of which
 * assume the old NFD-length-2/U+0300-036F boundary specifically.
 */
export function isDecomposableAccented(char: string): boolean {
  const cps = [...char.normalize("NFD")];
  if (cps.length < 2) return false;
  const [first, ...rest] = cps;
  if (first === undefined || !IS_LETTER_CP.test(first)) return false;
  return rest.every((cp) => IS_MARK_CP.test(cp));
}

/**
 * True when `cp` is a Unicode noncharacter: the last two codepoints of every
 * plane (…FFFE/…FFFF, via the `(cp & 0xfffe) === 0xfffe` bit test, which
 * covers every plane 0-16, not just the BMP) plus the reserved Arabic-
 * presentation-forms range U+FDD0–U+FDEF. These are permanently reserved by
 * the Unicode standard and never valid for open interchange. Single
 * canonical definition — shared by parseUPlusNotation() below and the
 * character-map guardrail (characterMap.ts), where it was previously
 * duplicated. NOTE: the Layer A codepoint-format lint check
 * (validator/checks/codepointFormat.ts) intentionally keeps a NARROWER,
 * non-equivalent check (BMP-only 0xFFFE/0xFFFF special-case, matching
 * kmcmplib) and must NOT be swapped onto this all-plane helper — see the
 * comment there.
 */
export function isNoncharacterCodePoint(cp: number): boolean {
  if (cp >= 0xfdd0 && cp <= 0xfdef) return true;
  return (cp & 0xfffe) === 0xfffe;
}

/**
 * Convert a U+XXXX codepoint string (or bare hex) to the actual Unicode
 * character.
 *
 * Accepted formats:
 *   - `"U+0041"` — canonical uppercase prefix + 4–6 hex digits
 *   - `"u+0041"` — lowercase prefix (normalised internally)
 *   - `"0041"`   — bare 4–6 hex digit string with no prefix
 *
 * Returns `null` for any of:
 *   - Inputs that don't match the accepted formats
 *   - Surrogate codepoints (U+D800–U+DFFF)
 *   - Codepoints above the Unicode maximum (U+10FFFF)
 *   - Noncharacter codepoints (the last two codepoints of every plane —
 *     …FFFE/…FFFF — plus the reserved BMP range U+FDD0–U+FDEF)
 *   - Any `String.fromCodePoint` throw (out-of-range numeric value)
 *
 * Private-use-area codepoints (e.g. U+E000) ARE accepted — PUA is a
 * legitimate escape hatch for authors, not a malformed input.
 *
 * @param s  The codepoint string to parse.
 * @returns  The Unicode character, or `null` if `s` is not well-formed.
 */
export function parseUPlusNotation(s: string): string | null {
  // Accept optional "U+" / "u+" prefix, then 4–6 hex digits.
  const match = /^(?:[Uu]\+)?([0-9A-Fa-f]{4,6})$/.exec(s);
  if (match === null) return null;

  const cp = parseInt(match[1]!, 16);

  // Reject surrogates (U+D800–U+DFFF) — not valid Unicode scalar values.
  if (cp >= 0xd800 && cp <= 0xdfff) return null;

  // Reject codepoints beyond the Unicode maximum.
  if (cp > 0x10ffff) return null;

  // Reject noncharacters (see isNoncharacterCodePoint above).
  if (isNoncharacterCodePoint(cp)) return null;

  try {
    return String.fromCodePoint(cp);
  } catch {
    return null;
  }
}
