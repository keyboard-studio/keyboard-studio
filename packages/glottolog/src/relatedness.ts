// Genealogical relatedness (spec 036 US1, FR-011/012/013, D3/D9).
//
// Closeness = depth of the deepest shared subgroup, computed as the length of
// the longest common prefix of two root-first ancestries (D3). Ties break by
// shorter total path, then by glottocode. Pseudo-family members and cross-family
// languoids never register as related (FR-012). No default cap (D9).

import { ancestorCodes, familyMembers, getLanguoid } from "./catalog.js";
import type {
  Glottocode,
  RelatednessOptions,
  RelatednessResult,
} from "./types.js";

/** Length of the longest common prefix of two arrays. */
function lcpLength(a: readonly string[], b: readonly string[]): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/**
 * Canonical relatedness ordering: `sharedSubgroupDepth` desc, then `pathLength`
 * asc, then glottocode asc (D3). Shared by relatedLanguages + relatedIsoCodes.
 */
export function compareRelatedness(
  a: RelatednessResult,
  b: RelatednessResult
): number {
  return (
    b.sharedSubgroupDepth - a.sharedSubgroupDepth ||
    a.pathLength - b.pathLength ||
    a.languoid.glottocode.localeCompare(b.languoid.glottocode)
  );
}

/** True when `a` is strictly closer than `b` under the canonical ordering. */
export function isCloser(a: RelatednessResult, b: RelatednessResult): boolean {
  return compareRelatedness(a, b) < 0;
}

/**
 * Genealogically related languoids, closest-first (FR-011, FR-013).
 *
 * Excludes the target itself, pseudo-family members (FR-012), and cross-family
 * languoids (no shared subgroup). No default cap — the caller truncates via
 * `maxResults` (D9). Never throws: unknown input yields `[]`.
 */
export function relatedLanguages(
  glottocode: Glottocode,
  opts: RelatednessOptions = {}
): RelatednessResult[] {
  const target = getLanguoid(glottocode);
  if (!target) return [];
  // A pseudo-family target has no genealogical relatives by definition (FR-012).
  if (target.isPseudoFamily) return [];

  const ancT = ancestorCodes(glottocode);
  // A top-level family / isolate shares no subgroup with anything.
  if (ancT.length === 0) return [];

  const results: RelatednessResult[] = [];
  // Same-family pre-filter: cross-family languoids never share a subgroup, and
  // every same-family member shares at least the family root (LCP ≥ 1).
  for (const gc of familyMembers(target.familyId)) {
    if (gc === glottocode) continue;
    const cand = getLanguoid(gc);
    if (!cand) continue;
    if (cand.isPseudoFamily) continue; // FR-012
    if (opts.levels && !opts.levels.includes(cand.level)) continue;

    const ancC = ancestorCodes(gc);
    const sharedSubgroupDepth = lcpLength(ancT, ancC);
    if (sharedSubgroupDepth === 0) continue; // defensive cross-family guard
    if (
      opts.minSharedDepth !== undefined &&
      sharedSubgroupDepth < opts.minSharedDepth
    ) {
      continue;
    }

    // Edges between the two nodes via their nearest common ancestor.
    const pathLength =
      ancT.length + ancC.length - 2 * sharedSubgroupDepth + 2;
    results.push({ languoid: cand, sharedSubgroupDepth, pathLength });
  }

  results.sort(compareRelatedness);

  if (opts.maxResults !== undefined) {
    return results.slice(0, Math.max(0, opts.maxResults));
  }
  return results;
}
