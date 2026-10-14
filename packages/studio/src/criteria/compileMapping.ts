// Compile-result mapping (spec 084 Batch 1) — criteria 7.6 and 7.21.
//
//   7.21 KM_LINT_COMPILE_ERRORS       — keyboard compiles with no errors
//   7.6  KM_LINT_COMPILE_HAS_WARNINGS — compiles with no errors AND no
//        warnings (the stricter source-review pass)
//
// These are not lint checks: no check module emits their codes. They
// are a named synthesis in the criteria assembly — the host's compile
// result (stage.compileResult, already produced by the artifact
// pipeline in both hosts) mapped by diagnostic severity:
//
//   any error/fatal diagnostic (or success === false) → 7.21 Not met
//   any warning (or worse)                            → 7.6  Not met
//   a clean compile                                    → both Met
//   no compile result at all                           → both Not yet
//     checkable, with that reason — a compile that did not run is not
//     a clean compile, and must never read as Met.
//
// The mapping applies identically in authored and foreign mode: both
// hosts hold a real compile result for the artifact they judge.

import type { CompileResult, Criterion } from "@keyboard-studio/contracts";

import type { ResolvedRow } from "./criteriaTypes.ts";

export const COMPILE_ERRORS_CODE = "KM_LINT_COMPILE_ERRORS";
export const COMPILE_WARNINGS_CODE = "KM_LINT_COMPILE_HAS_WARNINGS";

/** The codes this synthesis produces (named for the catalog drift guard). */
export const COMPILE_MAPPED_CODES: ReadonlySet<string> = new Set([
  COMPILE_ERRORS_CODE,
  COMPILE_WARNINGS_CODE,
]);

function isErrorSeverity(severity: string): boolean {
  return severity === "error" || severity === "fatal";
}

/**
 * Resolve a compile-mapped row, or return null when `lintRuleId` is not
 * one of the two compile codes (the caller falls through to the normal
 * layer-c path).
 */
export function resolveCompileRow(
  criterion: Criterion,
  lintRuleId: string,
  compileResult: CompileResult | null | undefined,
): ResolvedRow | null {
  if (!COMPILE_MAPPED_CODES.has(lintRuleId)) return null;

  if (compileResult === undefined || compileResult === null) {
    return {
      criterion,
      status: "not-yet-checkable",
      controls: null,
      evidence: () => ({
        kind: "context-missing",
        lines: [
          "Cannot be checked yet: no compile result is available for this keyboard.",
        ],
        lintRuleId,
      }),
    };
  }

  const diagnostics = compileResult.diagnostics;
  const errors = diagnostics.filter((d) => isErrorSeverity(d.severity));
  const hasErrors = errors.length > 0 || !compileResult.success;

  if (lintRuleId === COMPILE_ERRORS_CODE) {
    if (hasErrors) {
      const lines =
        errors.length > 0
          ? errors.map((d) => d.message)
          : ["The compile failed (the compiler reported no success)."];
      return {
        criterion,
        status: "not-met",
        controls: null,
        evidence: () => ({ kind: "compile", lines, lintRuleId }),
      };
    }
    return {
      criterion,
      status: "met",
      controls: null,
      evidence: () => ({
        kind: "compile",
        lines: ["The keyboard compiled with no errors."],
        lintRuleId,
      }),
    };
  }

  // 7.6 — no errors and no warnings.
  const warningsOrWorse = diagnostics.filter(
    (d) => d.severity === "warning" || isErrorSeverity(d.severity),
  );
  if (hasErrors || warningsOrWorse.length > 0) {
    const lines =
      warningsOrWorse.length > 0
        ? warningsOrWorse.map((d) => d.message)
        : ["The compile failed (the compiler reported no success)."];
    return {
      criterion,
      status: "not-met",
      controls: null,
      evidence: () => ({ kind: "compile", lines, lintRuleId }),
    };
  }
  return {
    criterion,
    status: "met",
    controls: null,
    evidence: () => ({
      kind: "compile",
      lines: ["The keyboard compiled with no errors and no warnings."],
      lintRuleId,
    }),
  };
}
