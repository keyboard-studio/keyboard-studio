// criteriaSeverity — Met / Warning / Error classification for criteria rows.
//
// The catalog resolves six spec-084 statuses; UIs group them into three
// severities:
//
//   met     — the check passed.
//   warning — needs a human look (KM_WARN_* findings, needs-human/author,
//             or not-yet-checkable). Not blocking.
//   error   — a hard KM_LINT_* failure. Blocking.
//   hidden  — not shown at all: not-applicable rows, and (in foreign mode
//             only) scaffolder-bake rows whose twin carries the post-hoc check.

import type { ResolvedRow } from "./criteriaTypes.ts";

export type CriteriaSeverity = "met" | "warning" | "error" | "hidden";

export function severityForRow(
  row: ResolvedRow,
  mode: "authored" | "foreign",
): CriteriaSeverity {
  if (row.status === "not-applicable") return "hidden";
  // In foreign mode, scaffolder-bake rows are guarantees about studio output,
  // not post-hoc checks — the twin row carries the actual check.
  // In authored mode they resolve met and are shown.
  if (mode === "foreign" && row.criterion.band === "scaffolder-bake") {
    return "hidden";
  }
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
