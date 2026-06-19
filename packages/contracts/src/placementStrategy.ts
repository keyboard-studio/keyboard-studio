// ---------------------------------------------------------------------------
// Derivation utility: PlacementCandidate → StrategyId
//
// Per spec §7.3 strategy cards, a placement candidate maps to a strategy:
//   S-01 ("key substitution") — direct mechanism, no RALT modifier
//   S-08 ("RALT-layer extension") — direct mechanism with RALT modifier
//
// v1 scope: only 'direct' mechanism candidates are produced by the kbgen
// seeder. 'deadkey', 'store-index', and 'opaque' candidates are forward-
// compatibility seams not yet wired to a strategy (see placementMap.ts §7.6).
// ---------------------------------------------------------------------------

import type { PlacementCandidate } from "./placementMap";
import type { StrategyId } from "./strategy";

/**
 * Derive the §7.3 strategy card for a placement candidate.
 *
 * Rule (spec §7.3, v1 seeder scope):
 *   - `mechanism === 'direct'` with `'RALT'` in modifiers → `'S-08'`
 *     (RALT-layer extension: character lives on RALT+key, base key untouched)
 *   - `mechanism === 'direct'` without `'RALT'` → `'S-01'`
 *     (key substitution: character remaps a free key directly)
 *
 * v1 covers S-01 and S-08 only. Candidates with `mechanism !== 'direct'`
 * are not yet assigned a strategy by this utility and default to `'S-01'`
 * as a safe fallback — callers should treat that result as advisory only
 * until §7.3 support for deadkey/store-index/opaque is added.
 *
 * @see spec.md §7.3 (S-01, S-08 strategy cards)
 * @see placementMap.ts (PlacementCandidate.mechanism v1 note)
 */
export function strategyForCandidate(candidate: PlacementCandidate): StrategyId {
  if (candidate.mechanism === "direct" && candidate.modifiers.includes("RALT")) {
    return "S-08";
  }
  return "S-01";
}
