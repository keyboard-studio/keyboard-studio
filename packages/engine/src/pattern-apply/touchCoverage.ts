/**
 * touchCoverage — thin engine-facing wrapper over the canonical
 * `computeTouchCoverage` traversal in @keyboard-studio/contracts (spec 035
 * FR-008/SC-003, review-gate item 1). The traversal itself — including
 * `U_<HEX>[_<HEX>]*` id decoding, reachable-layer BFS, and per-key char
 * collection (text/output/sk/flick/multitap, star-label exclusion) — lives in
 * contracts so the touch gallery (via this wrapper) and the
 * `KM_LINT_TOUCH_UNCOVERED` lint check (`@keymanapp/keyboard-lint`, which
 * cannot import this package) share one implementation.
 *
 * Preserves the pre-extraction public signature (`touchCoverage(layout,
 * inventory): TouchCoverageResult`) so existing engine consumers are unaffected.
 *
 * @see specs/035-mobile-touch-derivation/contracts/simplification.md
 */

import type { TouchLayoutIR, TouchCoverageResult } from "@keyboard-studio/contracts";
import { computeTouchCoverage } from "@keyboard-studio/contracts";

export type { TouchCoverageResult } from "@keyboard-studio/contracts";

/**
 * Compute inventory characters with no reachable touch-layout producer.
 *
 * Pure: no mutation of `layout`/`inventory`, no I/O.
 */
export function touchCoverage(
  layout: TouchLayoutIR,
  inventory: readonly string[],
): TouchCoverageResult {
  return computeTouchCoverage(layout, inventory);
}
