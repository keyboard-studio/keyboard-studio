// Check 18.6 (touch surface) — KM_LINT_TOUCH_UNCOVERED
// Criteria: same row as the desktop check — 18.6-inventory-fully-covered. This is a
// SIBLING check code, not a second criterion: the criteria.json count (148) is
// test-enforced, and the 18.13 addition was reverted for exactly this reason
// (see specs/035-mobile-touch-derivation/contracts/simplification.md, "Extended:
// criterion 18.6 gains a touch-side check").
//
// SCOPE GUARD differs deliberately from the desktop sibling
// (check-18-6-inventory-coverage.ts):
//   - No `origin === "scaffolded"` guard — imported bases (Case B, spec 035) are
//     this check's primary audience.
//   - No raw-fragment skip — this check walks a TouchLayoutIR, not IR rules, so
//     opaque `.kmn` fragments are not relevant to it.
//
// TRAVERSAL: the reachable-layer + char-collection walk is the canonical
// `computeTouchCoverage` in @keyboard-studio/contracts — shared with the
// engine's `touchCoverage` (packages/engine/src/pattern-apply/touchCoverage.ts).
// Both packages depend on @keyboard-studio/contracts; this check cannot import
// @keyboard-studio/engine directly (dependency-cruiser's `lint-not-to-engine`
// rule, .dependency-cruiser.cjs, forbids it — Layer C must stay a standalone
// hygiene layer, spec §10).

import type { LintFinding, TouchLayoutIR } from "@keyboard-studio/contracts";
import { computeTouchCoverage, formatUncoveredTouchMessage, toUPlusNotation } from "@keyboard-studio/contracts";
import { makeLocation } from "./_shared.js";

/**
 * Check that every character in the confirmed inventory has a reachable touch
 * mechanism (text/output/U_ id, or an sk/flick/multitap entry) on some
 * navigable layer of the touch layout. One finding per uncovered char.
 *
 * @param layout - Parsed/derived touch layout (the same TouchLayoutIR shape
 *   `touchCoverage` in the engine consumes).
 * @param inventory - Confirmed inventory characters (already flattened —
 *   matches `computeTouchCoverage`'s `inventory: readonly string[]` signature).
 * @param touchLayoutPath - Virtual FS path used in `location.file`.
 */
export function checkTouchCoverage(
  layout: TouchLayoutIR,
  inventory: readonly string[],
  touchLayoutPath: string
): LintFinding[] {
  const { uncovered } = computeTouchCoverage(layout, inventory);
  const findings: LintFinding[] = [];

  for (const ch of uncovered) {
    const chNFC = ch.normalize("NFC");
    findings.push({
      code: "KM_LINT_TOUCH_UNCOVERED",
      severity: "warning",
      layer: "C",
      message: `${formatUncoveredTouchMessage(chNFC)}.`,
      location: makeLocation(touchLayoutPath),
      hint: `Add "${chNFC}" (${toUPlusNotation(chNFC)}) to the touch layout — e.g. as a longpress (sk) option, a flick direction, or a multitap entry on a reachable key in the touch gallery.`,
    });
  }

  return findings;
}
