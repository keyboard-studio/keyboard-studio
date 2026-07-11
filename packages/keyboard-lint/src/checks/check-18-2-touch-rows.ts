// Check 18.2 — KM_WARN_TOUCH_ROW_COUNT
// Criteria: Touch layout uses 4-5 rows on phone and exactly 5 rows on tablet.
// Desktop has no row-count rule. One finding per offending platform+layer combo.

import type { LintFinding } from "@keyboard-studio/contracts";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";
import { makeLocation } from "./_shared.js";

const RULES: Partial<Record<string, { min: number; max: number }>> = {
  phone: { min: 4, max: 5 },
  tablet: { min: 5, max: 5 },
  // desktop: no rule
};

/**
 * Check that each touch platform uses the expected number of rows per layer.
 *
 * @param ir - Parsed touch layout.
 * @param touchLayoutPath - Virtual FS path used in `location.file`.
 */
export function checkTouchRows(
  ir: TouchLayoutIR,
  touchLayoutPath: string
): LintFinding[] {
  const findings: LintFinding[] = [];

  for (const platform of ir.platforms) {
    const rule = RULES[platform.id];
    if (!rule) continue;

    for (const layer of platform.layers) {
      const rowCount = layer.rows.length;
      if (rowCount < rule.min || rowCount > rule.max) {
        const expected =
          rule.min === rule.max
            ? `exactly ${rule.min}`
            : `${rule.min}-${rule.max}`;
        findings.push({
          code: "KM_WARN_TOUCH_ROW_COUNT",
          severity: "warning",
          layer: "C",
          message: `Platform "${platform.id}" layer "${layer.id}" has ${rowCount} row(s); expected ${expected}.`,
          location: makeLocation(touchLayoutPath),
          hint: `Adjust layer "${layer.id}" on ${platform.id} to ${expected} row(s) to meet the DISCUS platform guideline.`,
        });
      }
    }
  }

  return findings;
}
