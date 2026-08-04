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
// Script-neutral base-letter gate (shaped-bug fix, diacritic-implementability):
// the base-letter check tests General_Category L* (`\p{L}`, any script) rather
// than the old `/^[a-z]$/` Latin-only regex. In practice this function is only
// ever reached with a non-Latin base when a FUTURE caller derives a non-Latin
// `hostKey` — today TouchGallery's own suggestion memo (the caller) still
// gates `hostKey` derivation to `/^[a-zA-Z]$/` (a SEPARATE, legitimate
// constraint: a physical longpress host key is a K_<LETTER> hardware key
// label, which is inherently Latin on a standard keyboard — not the "is this
// an accented letter" question this module answers), so a non-Latin base
// still yields `[]` in practice via the caller's empty-hostKey early return,
// not via this gate. Broadening here keeps this module's own semantics
// consistent with the general `isDecomposableAccented` predicate rather than
// re-deriving a narrower, redundant copy of it.
//
// TODO(a4-copy-gate): the "sibling accent" UX FRAMING (not this predicate) —
// i.e. any string like "offer the rest of u's diacritic family" surfaced by a
// caller — should be gated on the survey's A4 classification
// (`diacriticBehavior`, packages/contracts/src/axes.ts, spec.md §7.1 A4; the
// scriptClass "abugida" value, same file, A2, may be the more precise axis to
// check instead/also — confirm with km-domain/km-strategy) so an Indic
// abugida's virama/matra marks are never described with "accent"/"diacritic"
// language. NOTE (post-narrowing correction): `isDecomposableAccented` was
// narrowed to `\p{Mn}` only (see charUtils.ts) — a spacing matra (Mc, e.g.
// Devanagari U+093E) no longer satisfies the predicate at all, so it never
// reaches this module. A consonant+virama sequence still does (virama, e.g.
// U+094D, IS Mn, General_Category-universal, not abugida-specific), so the
// abugida case this TODO cares about is narrower than it used to be: only
// the Mn virama form, not the Mc matra form. This module has no survey/axis
// dependency today; the caller (TouchGallery's longpress suggestion card)
// additionally gates the abugida virama case on `axes.scriptClass !==
// "abugida"` before offering the sibling-accent copy — wiring an A4/A2
// dependency directly into this pure placement generator remains a scope
// decision for whichever caller owns the copy, not this module.

import {
  isDecomposableAccented,
  type ScriptClass,
} from "@keyboard-studio/contracts";
import { isUppercaseLetter } from "../../lib/caseOrder.ts";

// Abugida-safe gate (km-domain ruling): `isDecomposableAccented` is Mn-only
// (see charUtils.ts) so it no longer matches a Devanagari-style matra
// syllable (Mc), but it STILL matches consonant+virama (virama is Mn and
// General_Category-universal, not abugida-specific) — so the predicate alone
// is insufficient to distinguish the Latin/Cyrillic/Greek/Hebrew/Arabic
// "accent + base" pattern this gate exists for from an abugida's
// matra/virama placement mechanism, which is a DIFFERENT mechanism entirely.
// Gate on `scriptClass !== "abugida"` in addition to the predicate. Do NOT
// gate on "abjad" — an abjad's optional-vowel-mark mechanism is not this
// abugida-specific concern. `scriptClass === undefined` (axes not yet
// populated) FAILS OPEN — the caller's pre-existing behavior applies rather
// than blocking on an unresolved axis.
/**
 * Whether `char` is a candidate for the shared "decomposable accented
 * character" gate used by both the desktop deadkey auto-default
 * (MechanismGallery's reset effect) and the touch longpress suggestion
 * (TouchGallery's suggestion-kind memo). See the module-level comment above
 * for the abugida-safe reasoning.
 */
export function isGatedAccentCompositionCandidate(
  char: string,
  scriptClass: ScriptClass | undefined,
): boolean {
  return isDecomposableAccented(char) && scriptClass !== "abugida";
}

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
 * Returns `[]` when the base is not a single letter (any script — see the
 * module doc comment on the script-neutral gate) or when the inventory has no
 * sharing sibling.
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
  if (!/^\p{L}$/u.test(baseLower)) return [];

  const seen = new Set<string>();
  const lower: Array<{ char: string; mark: string }> = [];
  const upper: Array<{ char: string; mark: string }> = [];

  for (const x of inventory) {
    if (x === acceptedChar || seen.has(x)) continue;
    seen.add(x);
    if (!isDecomposableAccented(x)) continue;
    if (baseLetterOf(x) !== baseLower) continue;
    const mark = [...x.normalize("NFD")][1] ?? "";
    const bucket = isUppercaseLetter(x) ? upper : lower;
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
