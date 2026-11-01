// Shared helpers for the spec 084 Batch 1 criteria checks — internal to
// this directory. Every check here is a pure function of explicit inputs
// (parsed IR, VFS path lists, raw member texts): the engine-only parsers
// (parseKvks / parseKps*) run in the studio's criteria assembly, which
// hands their results over via contracts' CriteriaLintInput, so this
// package keeps its contracts-only dependency (spec §10).

import type { LintFinding } from "@keyboard-studio/contracts";

/**
 * Build one Layer C finding in `file`. `line` is 1-based; the default 0
 * means "whole file" (most of these checks judge files, not lines). Callers pass the code as an object literal
 * (`{ code: "KM_LINT_…", … }`) on purpose: the criteria catalog's drift
 * guard derives the implemented set by scanning check sources for
 * `code:` literals, and a code passed positionally would be invisible
 * to that scan — the set must never claim a check the scan cannot see.
 */
export function criteriaFinding(input: {
  code: LintFinding["code"];
  file: string;
  message: string;
  hint: string;
  line?: number;
}): LintFinding {
  return {
    code: input.code,
    severity: "warning",
    layer: "C",
    message: input.message,
    location: { file: input.file, line: input.line ?? 0 },
    hint: input.hint,
  };
}

/**
 * The result of one criteria check: the lint code it verifies, findings
 * (empty when the check passes), plus human-readable lines describing what
 * was verified, shown under "Show details" when the check is met.
 */
export interface CheckResult {
  /** The KM_LINT_* code this check verifies (for verifiedByCode mapping). */
  code: string;
  findings: LintFinding[];
  /** What the check verified, for the met-case details. Empty if nothing to show. */
  verified: string[];
}

/** A passing check with verified details. */
export function checkPassed(code: string, verified: string[] = []): CheckResult {
  return { code, findings: [], verified };
}

/** A failing check with findings (verified details omitted on failure). */
export function checkFailed(code: string, findings: LintFinding[]): CheckResult {
  return { code, findings, verified: [] };
}

/**
 * Merge multiple check results into the combined findings plus a
 * per-code verified-details map (for the aggregate check functions).
 */
export function mergeResults(...results: CheckResult[]): {
  findings: LintFinding[];
  verifiedByCode: Map<string, string[]>;
} {
  const verifiedByCode = new Map<string, string[]>();
  for (const r of results) {
    if (r.verified.length > 0) {
      verifiedByCode.set(r.code, r.verified);
    }
  }
  return {
    findings: results.flatMap((r) => r.findings),
    verifiedByCode,
  };
}

/** The conventional VFS path of the judged keyboard's .kmn source. */
export function kmnPath(keyboardId: string): string {
  return `source/${keyboardId}.kmn`;
}

/** Basename of a VFS or .kps member path (either separator), lowercased. */
export function baseNameLower(path: string): string {
  const parts = path.split(/[\\/]/);
  return (parts[parts.length - 1] ?? "").toLowerCase();
}
