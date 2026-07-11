// Check 18.1 — KM_WARN_LONGPRESS_OVERSIZE
// Criteria: No touch long-press menu offers more than 8 options (warning), and none
// exceeds the hard cap of 10 (error). One finding per offending key.

import type { LintFinding } from "@keyboard-studio/contracts";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";
import { makeLocation, walkTouchKeys } from "./_shared.js";

const WARN_THRESHOLD = 8;
const ERROR_THRESHOLD = 10;

/**
 * Check that longpress menus (sk arrays) do not exceed the size limits.
 * Severity "error" for > 10 options; "warning" for > 8 options.
 *
 * @param ir - Parsed touch layout.
 * @param touchLayoutPath - Virtual FS path used in `location.file`.
 */
export function checkLongpress(
  ir: TouchLayoutIR,
  touchLayoutPath: string
): LintFinding[] {
  const findings: LintFinding[] = [];

  walkTouchKeys(ir, ({ key }) => {
    const count = key.sk?.length ?? 0;
    if (count > WARN_THRESHOLD) {
      const severity = count > ERROR_THRESHOLD ? "error" : "warning";
      findings.push({
        code: "KM_WARN_LONGPRESS_OVERSIZE",
        severity,
        layer: "C",
        message: `Key "${key.id}" has ${count} longpress option(s); the recommended maximum is ${WARN_THRESHOLD} (hard cap ${ERROR_THRESHOLD}).`,
        location: makeLocation(touchLayoutPath),
        hint: `Reduce the ${count} longpress options on "${key.id}" to ${WARN_THRESHOLD} or fewer to keep the menu usable on phone screens.`,
      });
    }
  });

  return findings;
}
