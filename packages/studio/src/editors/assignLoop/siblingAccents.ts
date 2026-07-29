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
 * Fixed priority order of single combining marks defining the "common"
 * diacritic family (linguist-specified order — do not re-sort). Each is
 * tried against the base letter in this order; the first six that compose to
 * a single precomposed code point form the sibling set (RULE 2 below).
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

const MAX_LOWERCASE_SIBLINGS = 6;

/**
 * The common single-mark diacritic family of `base` (a bare Latin letter),
 * in `DIACRITIC_PRIORITY` order, capped at {@link MAX_LOWERCASE_SIBLINGS}.
 * A candidate is kept only when `(base + mark).normalize("NFC")` composes to
 * a SINGLE code point different from `base` — this is what naturally excludes
 * "stroke" and other non-NFD-composable marks (RULE 2/5), and excludes any
 * form that would need 2+ combining marks (composing a candidate from a
 * single mark structurally cannot need a second one).
 */
function lowercaseSiblingsOf(base: string): string[] {
  const out: string[] = [];
  for (const mark of DIACRITIC_PRIORITY) {
    if (out.length >= MAX_LOWERCASE_SIBLINGS) break;
    const composed = (base + mark).normalize("NFC");
    if ([...composed].length === 1 && composed !== base) {
      out.push(composed);
    }
  }
  return out;
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
