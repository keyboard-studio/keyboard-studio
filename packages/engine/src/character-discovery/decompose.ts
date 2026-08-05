// Grapheme decomposition for the three-store confirmed alphabet
// (specs/046-marks-question-series, FR-003). Generalises the single-mark
// U+0300–036F test in contracts charUtils.isDecomposableAccented to multi-mark
// stacks and the full \p{Mn}\p{Mc}\p{Me} range (General_Category M — see
// isCombiningMarkChar in characterMap.ts): a whole-grapheme pick in the
// character picker decomposes into exactly one base plus an ordered run of
// combining marks (closest to the base first, i.e. NFD order preserved).

import { isCombiningMarkChar, isPrivateUseCodePoint } from "./characterMap.js";

export interface GraphemeDecomposition {
  /** The single non-mark starter, NFC-normalised. */
  base: string;
  /** The combining marks in NFD order (closest to base first). Never empty. */
  marks: string[];
}

/**
 * Decompose a single grapheme into its base letter and ordered combining
 * marks. Returns `null` when there is no known linguistic decomposition to
 * offer the picker:
 *
 * - the input is empty or spans more than one base (a digraph is not a stack);
 * - the input contains a private-use character (no Unicode data exists — the
 *   picker must ask the designer for a declared role instead, FR-004);
 * - the input is a lone combining mark (it *is* a mark, not a stack);
 * - NFD yields no combining marks (a plain letter decomposes to itself —
 *   callers add it straight to `bases` with no stack).
 */
export function decomposeGrapheme(grapheme: string): GraphemeDecomposition | null {
  if (grapheme.length === 0) return null;
  for (const ch of grapheme) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && isPrivateUseCodePoint(cp)) return null;
  }

  const nfd = grapheme.normalize("NFD");
  const units = [...nfd];
  if (units.length === 0) return null;

  const [first, ...rest] = units;
  if (first === undefined || isCombiningMarkChar(first)) {
    // A lone mark (or a defective mark-initial sequence) is not a base+marks stack.
    return null;
  }
  if (rest.length === 0) return null; // plain letter — nothing to decompose
  if (!rest.every((ch) => isCombiningMarkChar(ch))) {
    // A second starter means multiple bases (digraph territory) — out of scope.
    return null;
  }

  return { base: first.normalize("NFC"), marks: rest };
}
