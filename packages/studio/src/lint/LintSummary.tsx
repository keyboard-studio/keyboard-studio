// LintSummary — renders a severity badge header + scrollable list of LintChips.
// Empty state shows a "No issues found" message in green.
// Ordering of findings is preserved from the props array (caller controls sort).

import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { LintFinding, LintSeverity } from "@keyboard-studio/contracts";
import { LintChip } from "./LintChip";
import { ldmlCodeTitle } from "./ldmlFindings.ts";
import { SEVERITY_COLORS, SEVERITY_ORDER } from "./colors";
import { TEXT_MAIN } from "../ui/theme.ts";

export interface LintSummaryProps {
  findings: LintFinding[];
  /**
   * One row per code: its translated title, count and severity, expanding to the individual
   * chips, each with its line (spec 108 FR-018). Every LDML surface uses this mode.
   */
  groupByCode?: boolean;
}

interface CodeGroup {
  code: string;
  severity: LintSeverity;
  findings: LintFinding[];
}

/** Groups in order of first appearance; a group's severity is its most severe finding. */
function groupFindings(findings: LintFinding[]): CodeGroup[] {
  const groups = new Map<string, CodeGroup>();
  for (const f of findings) {
    const g = groups.get(f.code);
    if (g === undefined) {
      groups.set(f.code, { code: f.code, severity: f.severity, findings: [f] });
    } else {
      g.findings.push(f);
      if (SEVERITY_ORDER.indexOf(f.severity) < SEVERITY_ORDER.indexOf(g.severity)) g.severity = f.severity;
    }
  }
  return [...groups.values()];
}

export function LintSummary({ findings, groupByCode = false }: LintSummaryProps) {
  const { t, i18n } = useLingui();

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

  // spec 079 FR-020 (research R8): upstream findings — inherited from the base
  // and untouched by the author — still render in the list (muted, LintChip)
  // but are excluded from the headline counts and the live-region text, so
  // twelve muted chips never announce as "12 warnings" against the author.
  const authored = findings.filter((f) => f.origin !== "upstream");
  const upstreamCount = findings.length - authored.length;

  // Count per severity for the header badges.
  const counts = new Map<LintSeverity, number>();
  for (const f of authored) {
    counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1);
  }

  // Severities that have at least one finding, in display order.
  const activeSeverities = SEVERITY_ORDER.filter(
    (s) => (counts.get(s) ?? 0) > 0,
  );

  return (
    <div
      style={{
        border: "1px solid var(--app-border)",
        borderRadius: 8,
        background: "var(--app-surface)",
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
        {authored.length > 0
          ? t({
              id: "lint.summary.liveRegion.issueCount",
              message: plural(authored.length, {
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
        {authored.length === 0 ? (
          /* Zero state — visual indicator only; AT announcement is via the live region above */
          <span
            style={{
              fontSize: 13,
              color: "var(--app-success-text)",
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
                    // "warning" is deliberately excluded from the colour
                    // treatment — it renders in the panel's default
                    // foreground so the badge reads as a calm count, not
                    // an alarm. fatal/error/hint/info keep their colours.
                    color: severity === "warning" ? TEXT_MAIN : SEVERITY_COLORS[severity],
                  }}
                >
                  {labelFor(severity, count)}
                </span>
                {/* Separator dot between badges, not after the last one */}
                {idx < activeSeverities.length - 1 && (
                  <span aria-hidden="true" style={{ color: "var(--app-border)" }}>
                    ·
                  </span>
                )}
              </span>
            );
          })
        )}
        {upstreamCount > 0 && (
          <span
            data-testid="lint-summary-upstream-count"
            style={{ fontSize: 12, color: "var(--app-text-subtle)" }}
          >
            {t({
              id: "lint.summary.startingInheritedCount",
              message: `${{ count: upstreamCount }} inherited from the starting keyboard`,
            })}
          </span>
        )}
      </div>

      {/* Scrollable findings list */}
      {findings.length > 0 && groupByCode && (
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
          {groupFindings(findings).map((group) => (
            <li key={group.code} data-testid="lint-summary-group">
              <details>
                <summary style={{ cursor: "pointer", fontSize: 13 }}>
                  <span>{ldmlCodeTitle(group.code, i18n)}</span>{" "}
                  <span
                    style={{
                      fontWeight: 600,
                      color: group.severity === "warning" ? TEXT_MAIN : SEVERITY_COLORS[group.severity],
                    }}
                  >
                    {labelFor(group.severity, group.findings.length)}
                  </span>
                </summary>
                <ul style={{ margin: "4px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                  {group.findings.map((finding, idx) => (
                    <li key={`${finding.code}-${idx}`}>
                      {finding.location !== undefined && (
                        <span style={{ fontSize: 12, color: "var(--app-text-subtle)" }}>
                          {t({
                            id: "lint.summary.group.line",
                            message: `Line ${{ line: finding.location.line }}`,
                          })}
                        </span>
                      )}
                      <LintChip finding={finding} />
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
      {findings.length > 0 && !groupByCode && (
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
