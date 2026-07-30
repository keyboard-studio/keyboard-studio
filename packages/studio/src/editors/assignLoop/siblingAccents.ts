// siblingAccents — the longpress-accelerator's pure placement generator.
//
// After an author accepts a longpress suggestion for one accented character
// (e.g. u -> long-press -> ù), the sibling accents of that SAME BASE letter
// that the author's language ACTUALLY USES are usually wanted too (ù ú û ü on
// the base key, Ù Ú Û Ü on its shift layer). This module derives that
// placement set; TouchGallery decides when to offer it (propose-then-confirm,
// spec v1.3.1 §3c — never a silent auto-insert) and applies it on one Accept
// via the SAME appendMechanismToChar/buildTouchMechanismRef idiom every other
// touch placement uses.
//
// INVENTORY-DRIVEN (the author asked: "only add characters that the user put
// in their language"). The siblings offered are exactly the accented letters
// ALREADY IN the confirmed character inventory that share the accepted char's
// base letter — never a Unicode-derived family that would introduce accents
// the language does not use. A sibling's case decides its layer: lowercase on
// the base key's default layer, uppercase on its shift layer. Because the
// uppercase forms are drawn from the inventory too (not derived by casing),
// there is no locale casing to reason about here — an uppercase companion is
// offered only when the author's language actually contains it.
//
// Latin-only for now: the base-letter gate (`/^[a-z]$/` on the case-folded
// base) mirrors the gate TouchGallery's own `suggestion` memo already applies
// before offering a longpress suggestion in the first place. Cyrillic/Greek
// diacritic families are a plausible future extension but are NOT implemented
// here.

import { isDecomposableAccented } from "@keyboard-studio/contracts";

export type SiblingAccentLayer = "default" | "shift";

export interface SiblingAccentPlacement {
  char: string;
  hostKey: string;
  layer: SiblingAccentLayer;
}

/**
 * Preferred ordering of the common single combining marks (linguist-specified
 * order — do not re-sort). This governs the ORDER siblings are offered in, not
 * WHICH ones: a sibling whose canonical mark (`NFD[1]`) appears here leads, in
 * this order; any remaining siblings follow by mark code point.
 * Written as explicit `\u` escapes rather than raw combining characters —
 * a bare combining mark in source text renders attached to whatever
 * precedes it (including a comment dash) and is easy to mis-copy.
 */
const DIACRITIC_PRIORITY: readonly string[] = [
  "\u0300", // grave
  "\u0301", // acute
  "\u0302", // circumflex
  "\u0308", // diaeresis
  "\u0303", // tilde
  "\u030A", // ring above
  "\u0327", // cedilla
  "\u0328", // ogonek
  "\u030C", // caron
  "\u0304", // macron
  "\u0307", // dot above
];

/** The case-folded base letter of `char` (the starter of its canonical
 *  decomposition, lowercased), or "" if it has none. */
function baseLetterOf(char: string): string {
  return ([...char.normalize("NFD")][0] ?? "").toLowerCase();
}

/** Priority rank of a sibling's canonical combining mark: listed marks lead in
 *  `DIACRITIC_PRIORITY` order, the rest follow by code point. */
function markRank(mark: string): number {
  const idx = DIACRITIC_PRIORITY.indexOf(mark);
  return idx === -1
    ? DIACRITIC_PRIORITY.length + (mark.codePointAt(0) ?? 0)
    : idx;
}

/**
 * Sibling-accent placements for `acceptedChar`'s base letter, drawn ONLY from
 * `inventory` (the characters the author's language actually uses): every
 * accented letter in the inventory that shares `acceptedChar`'s base letter
 * (case-insensitively) other than `acceptedChar` itself. Lowercase siblings go
 * on `hostKey`'s default layer, uppercase siblings on its shift layer.
 *
 * Returns `[]` when the base is not a plain Latin letter (Cyrillic/Greek are a
 * future extension) or when the inventory has no sharing sibling.
 *
 * Ordering: lowercase placements first, then uppercase placements; within each
 * group, by the common-diacritic priority (a sibling's canonical mark), then by
 * code point. Pure; no I/O, no randomness.
 */
export function siblingAccentPlacements(
  acceptedChar: string,
  hostKey: string,
  inventory: readonly string[] | ReadonlySet<string>,
): SiblingAccentPlacement[] {
  const baseLower = baseLetterOf(acceptedChar);
  if (!/^[a-z]$/.test(baseLower)) return [];

  const seen = new Set<string>();
  const lower: Array<{ char: string; mark: string }> = [];
  const upper: Array<{ char: string; mark: string }> = [];

  for (const x of inventory) {
    if (x === acceptedChar || seen.has(x)) continue;
    seen.add(x);
    if (!isDecomposableAccented(x)) continue;
    if (baseLetterOf(x) !== baseLower) continue;
    const mark = [...x.normalize("NFD")][1] ?? "";
    const bucket = /^\p{Lu}$/u.test(x) ? upper : lower;
    bucket.push({ char: x, mark });
  }

  const byRank = (a: { mark: string }, b: { mark: string }): number =>
    markRank(a.mark) - markRank(b.mark);
  lower.sort(byRank);
  upper.sort(byRank);

  return [
    ...lower.map((s): SiblingAccentPlacement => ({
      char: s.char,
      hostKey,
      layer: "default",
    })),
    ...upper.map((s): SiblingAccentPlacement => ({
      char: s.char,
      hostKey,
      layer: "shift",
    })),
  ];
}
