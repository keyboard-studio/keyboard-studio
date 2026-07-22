// LintSummary — renders a severity badge header + scrollable list of LintChips.
// Empty state shows a "No issues found" message in green.
// Ordering of findings is preserved from the props array (caller controls sort).

import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { LintFinding, LintSeverity } from "@keyboard-studio/contracts";
import { LintChip } from "./LintChip";
import { SEVERITY_COLORS, SEVERITY_ORDER } from "./colors";

export interface LintSummaryProps {
  findings: LintFinding[];
}

export function LintSummary({ findings }: LintSummaryProps) {
  const { t } = useLingui();

  /** Pluralise a severity label for the badge (e.g. "1 error" / "2 errors"). */
  function labelFor(severity: LintSeverity, count: number): string {
    switch (severity) {
      case "fatal":
        return t({
          id: "lint.summary.severityLabel.fatal",
          message: plural(count, { one: "# fatal", other: "# fatals" }),
        });
      case "error":
        return t({
          id: "lint.summary.severityLabel.error",
          message: plural(count, { one: "# error", other: "# errors" }),
        });
      case "warning":
        return t({
          id: "lint.summary.severityLabel.warning",
          message: plural(count, { one: "# warning", other: "# warnings" }),
        });
      case "hint":
        return t({
          id: "lint.summary.severityLabel.hint",
          message: plural(count, { one: "# hint", other: "# hints" }),
        });
      case "info":
        return t({
          id: "lint.summary.severityLabel.info",
          message: plural(count, { one: "# info", other: "# infos" }),
        });
    }
  }

  // Count per severity for the header badges.
  const counts = new Map<LintSeverity, number>();
  for (const f of findings) {
    counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1);
  }

  // Severities that have at least one finding, in display order.
  const activeSeverities = SEVERITY_ORDER.filter(
    (s) => (counts.get(s) ?? 0) > 0,
  );

  return (
    <div
      style={{
        border: "1px solid #283040",
        borderRadius: 8,
        background: "#161b22",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* Visually-hidden live region — announces count changes to screen readers
          without re-reading the full list on every debounce cycle. */}
      <span
        role="status"
        aria-live="polite"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
        }}
      >
        {findings.length > 0
          ? t({
              id: "lint.summary.liveRegion.issueCount",
              message: plural(findings.length, {
                one: "# lint issue",
                other: "# lint issues",
              }),
            })
          : t({ id: "lint.summary.noIssuesFound", message: "No issues found" })}
      </span>

      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          minHeight: 22,
        }}
      >
        {findings.length === 0 ? (
          /* Zero state — visual indicator only; AT announcement is via the live region above */
          <span
            style={{
              fontSize: 13,
              color: "#7ee787",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {/* Screen-reader-accessible checkmark — text rather than glyph */}
            <span aria-hidden="true" style={{ fontWeight: 700 }}>
              [OK]
            </span>
            <Trans id="lint.summary.noIssuesFound">No issues found</Trans>
          </span>
        ) : (
          activeSeverities.map((severity, idx) => {
            const count = counts.get(severity)!;
            return (
              <span key={severity} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    color: SEVERITY_COLORS[severity],
                  }}
                >
                  {labelFor(severity, count)}
                </span>
                {/* Separator dot between badges, not after the last one */}
                {idx < activeSeverities.length - 1 && (
                  <span aria-hidden="true" style={{ color: "#283040" }}>
                    ·
                  </span>
                )}
              </span>
            );
          })
        )}
      </div>

      {/* Scrollable findings list */}
      {findings.length > 0 && (
        <ul
          aria-label={t({ id: "lint.summary.findingsListAriaLabel", message: "Lint findings" })}
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {findings.map((finding, idx) => (
            <li key={`${finding.code}-${idx}`}>
              <LintChip finding={finding} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
