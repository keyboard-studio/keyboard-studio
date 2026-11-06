// Advisory criteria (spec 114 FR-004): a criterion whose findings only advise.
// Every criteria-check finding carries warning severity, so "all findings are
// warnings" cannot tell an advisory from a failure; the set of advisory lint
// codes is explicit instead. An advisory row stays Not met (it has findings to
// show) but is flagged `advisory`: Review shows it as a warning and no gate
// (the Open submit gate, the Copy-path failing lists) stops on it.

import type { ResolvedRow } from "./criteriaTypes.ts";

export const ADVISORY_LINT_CODES: ReadonlySet<string> = new Set([
  "KM_LINT_SIDED_CTRL_ADVISORY",
]);

/** True when the row is an advisory with findings: shown as a warning, never blocking. */
export function isAdvisoryRow(row: ResolvedRow): boolean {
  return row.advisory === true;
}
