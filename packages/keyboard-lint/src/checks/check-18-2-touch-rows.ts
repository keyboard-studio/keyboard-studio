// Check 18.2 — KM_WARN_TOUCH_ROW_COUNT
// Criteria: Touch layout uses 4-5 rows on phone and exactly 5 rows on tablet.
// Desktop has no row-count rule. One finding per offending platform+layer combo.

import type { LintFinding } from "@keyboard-studio/contracts";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";
import { makeLocation } from "./_shared.js";
import {
  checkFailed,
  checkPassed,
  type CheckResult,
} from "./criteria/_shared.js";

const RULES: Partial<Record<string, { min: number; max: number }>> = {
  phone: { min: 4, max: 5 },
  tablet: { min: 5, max: 5 },
  // desktop: no rule
};

/**
 * Check that each touch platform uses the expected number of rows per layer.
 *
 * When met, the verified details name the measured row count per
 * platform — a numeric check shows its measured value.
 *
 * @param ir - Parsed touch layout.
 * @param touchLayoutPath - Virtual FS path used in `location.file`.
 */
export function checkTouchRows(
  ir: TouchLayoutIR,
  touchLayoutPath: string
): CheckResult {
  const code = "KM_WARN_TOUCH_ROW_COUNT";
  const findings: LintFinding[] = [];
  const measured: string[] = [];

  for (const platform of ir.platforms) {
    const rule = RULES[platform.id];
    if (!rule) continue;

    const counts = [
      ...new Set(platform.layers.map((l) => l.rows.length)),
    ].sort((a, b) => a - b);
    if (counts.length > 0) {
      const label =
        platform.id.charAt(0).toUpperCase() + platform.id.slice(1);
      measured.push(`${label}: ${counts.join("/")} rows`);
    }

    for (const layer of platform.layers) {
      const rowCount = layer.rows.length;
      if (rowCount < rule.min || rowCount > rule.max) {
        const expected =
          rule.min === rule.max
            ? `exactly ${rule.min}`
            : `${rule.min}-${rule.max}`;
        findings.push({
          // Literal for the source scanner (criteriaCatalog.test.ts).
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

  if (findings.length > 0) return checkFailed(code, findings);
  return checkPassed(code, measured);
}
