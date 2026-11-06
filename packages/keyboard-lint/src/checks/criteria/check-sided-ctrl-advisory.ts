// Check 7.30 — KM_LINT_SIDED_CTRL_ADVISORY (spec 114 FR-004).
//
// STUB: returns no findings. The real advisory replaces this file in the
// user-story phase; it is not yet listed in implementedChecks / gateCoverage.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { checkPassed, type CheckResult } from "./_shared.js";

/** 7.30 — advisory on sided Ctrl rules. Stub: always passes. */
export function checkSidedCtrlAdvisory(
  _ir: KeyboardIR,
  _keyboardId: string,
): CheckResult {
  return checkPassed("KM_LINT_SIDED_CTRL_ADVISORY");
}
