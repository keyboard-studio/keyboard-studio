// reviewSeverity — Met / Warning / Error classification for the criteria
// report surfaces.
//
// The catalog resolves six spec-084 statuses; the report surfaces group
// them into three severities:
//
//   met     — the check passed.
//   warning — needs a human look (KM_WARN_* findings, needs-human/author,
//             or not-yet-checkable). Not blocking.
//   error   — a hard KM_LINT_* failure. Blocking.
//   hidden  — not shown in the report at all (foreign mode only:
//             scaffolder-bake rows, whose twin carries the post-hoc check,
//             and not-applicable rows).
//
// The two modes differ in what may be hidden, so there is one mapping per
// mode — never a shared mapping with a mode branch inside the filter:
//   foreign (severityForReviewRow, /review + Compare): scaffolder-bake
//     rows are guarantees about studio output, not post-hoc checks, so
//     they hide behind their twin; not-applicable rows hide too.
//   authored (severityForAuthoredRow, the Criteria page): the same rows
//     are real verdicts about the author's own keyboard — a bake row is
//     a Met guarantee by construction and a not-applicable row names its
//     reason — so bake rows classify as met and not-applicable rows
//     classify as nothing (undefined): shown under "All", hidden under a
//     severity filter, never silently dropped from the page.

import { isAdvisoryRow } from "../criteria/advisoryChecks.ts";
import type { ResolvedRow } from "../criteria/criteriaTypes.ts";

export type ReviewSeverity = "met" | "warning" | "error" | "hidden";

/** A severity a row may carry on the Criteria page, or undefined when the
 * row is unclassified (not-applicable: shown under "All" only). */
export type AuthoredSeverity = "met" | "warning" | "error";

export function severityForReviewRow(row: ResolvedRow): ReviewSeverity {
  // Scaffolder-bake rows are guarantees about studio output, not post-hoc
  // checks — the twin row carries the actual check for a foreign keyboard.
  if (row.criterion.band === "scaffolder-bake") return "hidden";
  if (row.status === "not-applicable") return "hidden";
  if (row.status === "met") return "met";
  if (row.status === "not-met") {
    if (isAdvisoryRow(row)) return "warning";
    const code =
      row.criterion.band === "layer-c-enforce"
        ? (row.criterion.lintRuleId ?? "")
        : "";
    return code.startsWith("KM_WARN") ? "warning" : "error";
  }
  // needs-human, needs-author, not-yet-checkable: needs a look, not a failure.
  return "warning";
}

export function severityForAuthoredRow(
  row: ResolvedRow,
): AuthoredSeverity | undefined {
  // Not applicable is a verdict with a named reason, not a severity: it
  // has no bucket, so the page shows it under "All" and hides it under a
  // severity filter rather than counting it as met, warning, or error.
  if (row.status === "not-applicable") return undefined;
  // Scaffolder-bake rows are Met by construction here — the guarantee is
  // the verdict, so they classify as met instead of hiding behind a twin.
  if (row.status === "met") return "met";
  if (row.status === "not-met") {
    // Advisory findings only advise — never blocking, in either mode
    // (spec 114: "shown as a warning, never blocking").
    if (isAdvisoryRow(row)) return "warning";
    const code =
      row.criterion.band === "layer-c-enforce"
        ? (row.criterion.lintRuleId ?? "")
        : "";
    return code.startsWith("KM_WARN") ? "warning" : "error";
  }
  // needs-human, needs-author, not-yet-checkable: needs a look, not a failure.
  return "warning";
}
