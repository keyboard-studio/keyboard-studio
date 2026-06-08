// LintSummary — renders a severity badge header + scrollable list of LintChips.
// Empty state shows a "No issues found" message in green.
// Ordering of findings is preserved from the props array (caller controls sort).

import type { LintFinding, LintSeverity } from "@keyboard-studio/contracts";
import { LintChip } from "./LintChip";
import { SEVERITY_COLORS, SEVERITY_ORDER } from "./colors";

export interface LintSummaryProps {
  findings: LintFinding[];
}

/** Pluralise a severity label for the badge (e.g. "error" -> "errors"). */
function labelFor(severity: LintSeverity, count: number): string {
  if (count === 1) return severity;
  // "info" is already a noun; all others take a plain -s suffix.
  return severity === "info" ? "info" : `${severity}s`;
}

export function LintSummary({ findings }: LintSummaryProps) {
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
          ? `${findings.length} lint issue${findings.length === 1 ? "" : "s"}`
          : "No issues found"}
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
            No issues found
          </span>
        ) : (
          activeSeverities.map((severity, idx) => {
            const count = counts.get(severity) ?? 0;
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
                  {count} {labelFor(severity, count)}
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
          aria-label="Lint findings"
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
