// siblingAccents — the longpress-accelerator's pure placement generator.
//
// After an author accepts a longpress suggestion for one accented character
// (e.g. u -> long-press -> ù), the sibling accents of that SAME BASE
// letter are usually wanted too (ù ú û ü on the base key,
// Ù Ú Û Ü on its shift layer). This module derives that
// placement set; TouchGallery decides when to offer it (propose-then-confirm,
// spec v1.3.1 §3c — never a silent auto-insert) and applies it on
// one Accept via the SAME appendMechanismToChar/buildTouchMechanismRef idiom
// every other touch placement uses.
//
// Latin-only for now: the base-letter gate below (`/^[a-zA-Z]$/`) mirrors the
// gate TouchGallery's own `suggestion` memo already applies before offering a
// longpress suggestion in the first place. Cyrillic/Greek diacritic families
// are a plausible future extension but are NOT implemented here —
// extending the gate without extending the priority table below would
// silently offer wrong "siblings" for a non-Latin base.
//
// `caseCounterpart` is injected (rather than imported directly) so this
// module is unit-testable without pulling in the engine's locale machinery;
// TouchGallery's call site passes the real `@keyboard-studio/engine` export.

export type SiblingAccentLayer = "default" | "shift";

export interface SiblingAccentPlacement {
  char: string;
  hostKey: string;
  layer: SiblingAccentLayer;
}

/** Same shape as `@keyboard-studio/engine`'s `caseCounterpart` — injected so
 *  this module has no engine dependency (unit-testable in isolation). */
export type CaseCounterpartFn = (
  char: string,
  bcp47?: string,
) => { counterpart: string; direction: "toUpper" | "toLower" } | null;

/**
 * Preferred ordering of the common single combining marks (linguist-specified
 * order — do not re-sort). This governs the ORDER siblings are offered in, not
 * WHICH ones: siblings whose mark appears here lead, in this order; any further
 * single-mark siblings of the base follow, by mark code point (RULE 2).
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

// The combining-diacritical-marks block (Mn). Every single mark in this range
// is tried against the base; the ones that canonically compose to a single
// precomposed code point form the sibling family. This is the whole span the
// generator sweeps — there is deliberately NO numeric cap on the family size
// (the author asked for the full accent family, not a curated top-N), only the
// structural single-mark / single-code-point filter below.
const COMBINING_MARKS_START = 0x0300;
const COMBINING_MARKS_END = 0x036f;

/**
 * The complete single-mark diacritic family of `base` (a bare Latin letter):
 * every combining mark in the combining-diacritics block that, appended to
 * `base`, canonically composes (`normalize("NFC")`) to a SINGLE code point
 * distinct from `base`. That single-code-point test is what excludes "stroke"
 * and other non-NFD-composable marks (RULE 2/5) and excludes any multi-mark
 * stack (composing from a single mark structurally cannot need a second one).
 *
 * Ordering (RULE 2): marks listed in `DIACRITIC_PRIORITY` lead, in that order;
 * remaining siblings follow by mark code point. No cap on the count.
 */
function lowercaseSiblingsOf(base: string): string[] {
  // Keyed by the composed CHARACTER (not the mark) so a base+mark that
  // normalizes through a canonically-equivalent mark — e.g. U+0340 COMBINING
  // GRAVE TONE MARK folds to U+0300 — cannot yield a duplicate sibling. The
  // stored value is the sibling's own CANONICAL combining mark (`NFD[1]`),
  // which is what the priority ordering keys on.
  const byChar = new Map<string, string>();
  for (let cp = COMBINING_MARKS_START; cp <= COMBINING_MARKS_END; cp++) {
    const composed = (base + String.fromCodePoint(cp)).normalize("NFC");
    if ([...composed].length !== 1 || composed === base) continue;
    // Keep ONLY true single-mark siblings: NFD must be exactly
    // [base, one combining mark]. This excludes multi-diacritic stacks that a
    // single source mark can still reach (e.g. U+0344 -> u+diaeresis+acute =
    // ǘ, whose NFD is length 3) — RULE 2's "single-mark family, no stacks".
    const decomposed = [...composed.normalize("NFD")];
    if (decomposed.length !== 2 || decomposed[0] !== base) continue;
    if (!byChar.has(composed)) byChar.set(composed, decomposed[1] as string);
  }
  const priorityRank = (mark: string): number => {
    const idx = DIACRITIC_PRIORITY.indexOf(mark);
    // Non-priority marks sort after every priority mark, then by code point.
    return idx === -1
      ? DIACRITIC_PRIORITY.length + (mark.codePointAt(0) ?? 0)
      : idx;
  };
  return [...byChar.entries()]
    .sort((a, b) => priorityRank(a[1]) - priorityRank(b[1]))
    .map(([composed]) => composed);
}

/**
 * Sibling accent placements for `acceptedChar`'s base letter: the common
 * diacritic family of the base (RULE 2), lowercase forms on `hostKey`'s
 * default layer, and their uppercase counterparts (via `caseCounterpartFn`,
 * RULE 3) on `hostKey`'s shift layer (RULE 4). Returns `[]` when the base is
 * not a plain Latin letter (RULE 5 — Cyrillic/Greek are a future extension,
 * not implemented here) or when the family has no siblings.
 *
 * Excludes `acceptedChar`'s own LOWERCASE placement — the caller
 * (`handleUseSuggestion`) already placed it — but NOT its uppercase
 * counterpart, which this accelerator is the only thing that would ever
 * propose (the manual `handleApply` path's case-pair companion is a
 * different, independent proposal — see TouchGallery's module doc).
 *
 * Pure; no I/O, no randomness. Order: all lowercase placements in priority
 * order, then all uppercase placements in the same priority order (matching
 * the shape of the accelerator's one-click "add the lowercase family, then
 * its uppercase counterparts" proposal) rather than interleaved per-letter.
 */
export function siblingAccentPlacements(
  acceptedChar: string,
  hostKey: string,
  caseCounterpartFn: CaseCounterpartFn,
  bcp47?: string,
): SiblingAccentPlacement[] {
  const nfd = acceptedChar.normalize("NFD");
  const base = [...nfd][0] ?? "";
  if (!/^[a-zA-Z]$/.test(base)) return [];

  const candidates = lowercaseSiblingsOf(base);
  if (candidates.length === 0) return [];

  const acceptedNfc = acceptedChar.normalize("NFC");
  const placements: SiblingAccentPlacement[] = [];
  const seenLower = new Set<string>();
  const seenUpper = new Set<string>();

  for (const lower of candidates) {
    if (lower !== acceptedNfc && !seenLower.has(lower)) {
      seenLower.add(lower);
      placements.push({ char: lower, hostKey, layer: "default" });
    }
  }
  for (const lower of candidates) {
    const pair = caseCounterpartFn(lower, bcp47);
    if (
      pair !== null &&
      pair.direction === "toUpper" &&
      !seenUpper.has(pair.counterpart)
    ) {
      seenUpper.add(pair.counterpart);
      placements.push({ char: pair.counterpart, hostKey, layer: "shift" });
    }
  }

  return placements;
}
