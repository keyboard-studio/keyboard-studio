// Synthetic LintFindings injected when a validation pass throws unexpectedly.
// These are distinct from KM_WARN_ORACLE_UNAVAILABLE (packages/engine/src/validator/oracle.ts),
// which represents a known degraded mode (WASM unavailable). These represent
// unexpected crashes in the validator or lint engine that should never happen
// in normal operation — they signal a bug, not a graceful fallback.

import type { LintFinding } from "@keyboard-studio/contracts";

/** Injected by useValidator when the TS validator pass (runAllChecks) throws. */
export const VALIDATOR_ERROR_FINDING: LintFinding = {
  code: "KM_WARN_VALIDATOR_ERROR",
  severity: "warning",
  layer: "A",
  message: "Validator check threw an unexpected error — findings may be incomplete.",
  hint: "Reload the studio to retry; if it persists, file a bug.",
};

/** Injected by useTouchLint when the Layer C hygiene engine (engine.lint) rejects. */
export const LINT_ERROR_FINDING: LintFinding = {
  code: "KM_WARN_LINT_ERROR",
  severity: "warning",
  layer: "C",
  message: "Hygiene lint engine threw an unexpected error — Layer C findings may be incomplete.",
  hint: "Reload the studio to retry; if it persists, file a bug.",
};
