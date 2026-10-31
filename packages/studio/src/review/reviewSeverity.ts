// reviewSeverity — Met / Warning / Error classification for the /review
// health report.
//
// The catalog resolves six spec-084 statuses; the review report groups them
// into three severities for a foreign keyboard:
//
//   met     — the check passed.
//   warning — needs a human look (KM_WARN_* findings, needs-human/author,
//             or not-yet-checkable). Not blocking.
//   error   — a hard KM_LINT_* failure. Blocking.
//   hidden  — not shown in the report at all: scaffolder-bake rows (their
//             twin carries the post-hoc check) and not-applicable rows.

import type { ResolvedRow } from "../criteria/criteriaTypes.ts";

export type ReviewSeverity = "met" | "warning" | "error" | "hidden";

export function severityForReviewRow(row: ResolvedRow): ReviewSeverity {
  // Scaffolder-bake rows are guarantees about studio output, not post-hoc
  // checks — the twin row carries the actual check for a foreign keyboard.
  if (row.criterion.band === "scaffolder-bake") return "hidden";
  if (row.status === "not-applicable") return "hidden";
  if (row.status === "met") return "met";
  if (row.status === "not-met") {
    const code =
      row.criterion.band === "layer-c-enforce"
        ? (row.criterion.lintRuleId ?? "")
        : "";
    return code.startsWith("KM_WARN") ? "warning" : "error";
  }
  // needs-human, needs-author, not-yet-checkable: needs a look, not a failure.
  return "warning";
}
