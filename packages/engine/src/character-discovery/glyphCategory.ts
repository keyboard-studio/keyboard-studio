// Pure Unicode General-Category classifier for the alphabet-inventory breakdown
// (specs/047-alphabet-inventory-categories, FR-004/FR-005). Sibling of
// decompose.ts: the engine already classifies characters exclusively via native
// Unicode property escapes (isCombiningMarkChar = /^\p{M}$/u), so this keeps all
// General-Category logic in one package with no UCD table.
//
// Returns exactly one of the six top-level Unicode categories OTHER than Marks
// (\p{M}). Marks and private-use characters are the CALLER's concern — the
// phaseBDraftStore routes marks to the Marks store and PUA to the designer's
// declared role BEFORE consulting this function — so over the intended
// (non-mark, non-PUA) domain the return value is a single, mutually-exclusive
// section id (FR-005, no double-count).

export type GlyphCategory =
  | "letter" // \p{L}
  | "number" // \p{N}
  | "punctuation" // \p{P}
  | "symbol" // \p{S}
  | "separator" // \p{Z}
  | "control"; // \p{C} (control/format/other, incl. unusual invisibles)

/**
 * Classify a character by its Unicode General Category. Tested in precedence
 * L -> N -> P -> S -> Z, with everything else (\p{C} and anything unmatched)
 * falling to `control`.
 *
 * Total by construction: `\p{L|N|P|S|Z|C}` is NOT total over all of Unicode (a
 * bare combining mark `\p{M}` matches none of the six), so the final `control`
 * return is a defensive catch-all that keeps this function total over every
 * string — it never returns `undefined`. Correct callers, which handle marks
 * and PUA ahead of this call, never reach that branch for a mark.
 */
export function glyphCategory(char: string): GlyphCategory {
  if (/\p{L}/u.test(char)) return "letter";
  if (/\p{N}/u.test(char)) return "number";
  if (/\p{P}/u.test(char)) return "punctuation";
  if (/\p{S}/u.test(char)) return "symbol";
  if (/\p{Z}/u.test(char)) return "separator";
  // \p{C} and any unmatched input (incl. a bare \p{M} that reaches this
  // function) fall to the catch-all "other" bucket — never undefined.
  return "control";
}
