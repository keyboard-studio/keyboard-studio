// Check 7.29 — KM_LINT_RAW_CTRL (spec 114 FR-001).
//
// STUB: returns no findings. The real predicate replaces this file in the
// user-story phase; it is not yet listed in implementedChecks / gateCoverage.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { checkPassed, type CheckResult } from "./_shared.js";

/** 7.29 — no rule uses Ctrl without Alt. Stub: always passes. */
export function checkRawCtrl(_ir: KeyboardIR, _keyboardId: string): CheckResult {
  return checkPassed("KM_LINT_RAW_CTRL");
}
