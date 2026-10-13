// Shared helpers for the spec 084 Batch 1 criteria checks — internal to
// this directory. Every check here is a pure function of explicit inputs
// (parsed IR, VFS path lists, raw member texts): the engine-only parsers
// (parseKvks / parseKps*) run in the studio's criteria assembly, which
// hands their results over via contracts' CriteriaLintInput, so this
// package keeps its contracts-only dependency (spec §10).

import type { LintFinding } from "@keyboard-studio/contracts";

/**
 * Build one Layer C finding at line 1 of `file` (these checks judge
 * whole files, not lines). Callers pass the code as an object literal
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
}): LintFinding {
  return {
    code: input.code,
    severity: "warning",
    layer: "C",
    message: input.message,
    location: { file: input.file, line: 1 },
    hint: input.hint,
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
