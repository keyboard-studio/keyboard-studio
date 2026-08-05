// ---------------------------------------------------------------------------
// Derivation utility: PlacementCandidate → StrategyId
//
// Per spec §7.3 strategy cards, a placement candidate maps to a strategy:
//   S-02 ("deadkey") — mechanism 'deadkey' or 'store-index'
//   S-01 ("key substitution") — direct mechanism, no RALT modifier
//   S-08 ("RALT-layer extension") — direct mechanism with RALT modifier
//
// 'opaque' candidates are a forward-compatibility seam not yet wired to a
// strategy (see placementMap.ts §7.6) and fall back to 'S-01' — callers
// should treat that fallback result as advisory only.
// ---------------------------------------------------------------------------

import type { PlacementCandidate } from "./placementMap";
import type { StrategyId } from "./strategy";

/**
 * Derive the §7.3 strategy card for a placement candidate.
 *
 * Rule (spec §7.3):
 *   - `mechanism === 'deadkey'` or `'store-index'` → `'S-02'`
 *     (deadkey: character reached via a trigger key + base letter sequence)
 *   - `mechanism === 'direct'` with `'RALT'` in modifiers → `'S-08'`
 *     (RALT-layer extension: character lives on RALT+key, base key untouched)
 *   - `mechanism === 'direct'` without `'RALT'` → `'S-01'`
 *     (key substitution: character remaps a free key directly)
 *
 * Candidates with `mechanism === 'opaque'` are not assigned a strategy by
 * this utility and default to `'S-01'` as a safe fallback — callers should
 * treat that result as advisory only until §7.3 support for opaque
 * candidates is added.
 *
 * @see spec.md §7.3 (S-01, S-02, S-08 strategy cards)
 * @see placementMap.ts (PlacementCandidate.mechanism note)
 */
export function strategyForCandidate(candidate: PlacementCandidate): StrategyId {
  if (candidate.mechanism === "deadkey" || candidate.mechanism === "store-index") {
    return "S-02";
  }
  if (candidate.mechanism === "direct" && candidate.modifiers.includes("RALT")) {
    return "S-08";
  }
  return "S-01";
}
