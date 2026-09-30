// DocumentationFindingsSummary — the Layer C documentation checks, collapsed
// into ONE compact row instead of full-weight blocks above the step content.
// The blocks pushed the current question down and never muted upstream
// findings; these findings are advisory-only by the Layer C ceiling (warning
// severity, never blocking), so a collapsed-by-default disclosure is the
// right weight. Mounted inside StudioShell's existing role="status" live
// region — count changes announce through it, no second live region.
// Plain useState disclosure, no timers (constitution D3 / spec 080 FR-019),
// no resolving or auto-fixing (that is a separate issue, presentation only).
//
// Copy stays neutral per the A2 tradeoff principle: the count label states a
// number, never advice, and the toggle is just Show/Hide notes. Findings with
// origin upstream — inherited from the base keyboard, untouched by the
// author — render muted under their own subheading, mirroring the chip rail
// convention for upstream findings.

import { useState, useId } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { LintFinding } from "@keyboard-studio/contracts";
import { TEXT_MAIN, TEXT_DIM } from "../ui/theme.ts";

export interface DocumentationFindingsSummaryProps {
  /** The doc-sourced, unmapped, warning-severity findings to summarise. */
  findings: LintFinding[];
}

/** One finding rendered the same compact way as the old warning blocks. */
function FindingRow({ finding }: { finding: LintFinding }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          lineHeight: 1.5,
          color: TEXT_MAIN,
        }}
      >
        {finding.message}
      </p>
      {finding.hint !== undefined && (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            lineHeight: 1.5,
            color: TEXT_DIM,
          }}
        >
          {finding.hint}
        </p>
      )}
    </div>
  );
}

export function DocumentationFindingsSummary({
  findings,
}: DocumentationFindingsSummaryProps) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const regionId = useId();

  if (findings.length === 0) return null;

  const authored = findings.filter((f) => f.origin !== "upstream");
  const upstream = findings.filter((f) => f.origin === "upstream");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((prev) => !prev)}
        data-testid="doc-findings-summary-toggle"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: 0,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          font: "inherit",
          fontSize: 13,
          lineHeight: 1.5,
          color: TEXT_MAIN,
          textAlign: "left",
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 11, color: TEXT_DIM }}>
          {open ? "▾" : "▸"}
        </span>
        <span aria-hidden="true">⚠</span>{" "}
        {t({
          id: "docFindingsSummary.countLabel",
          message: plural(findings.length, {
            one: "# documentation note",
            other: "# documentation notes",
          }),
        })}{" "}
        <span style={{ fontSize: 12, color: TEXT_DIM }}>
          {open ? (
            <Trans id="docFindingsSummary.hideNotes">Hide notes</Trans>
          ) : (
            <Trans id="docFindingsSummary.showNotes">Show notes</Trans>
          )}
        </span>
      </button>
      {open && (
        <div
          id={regionId}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginTop: 4,
          }}
        >
          {authored.map((f, i) => (
            <FindingRow key={`${f.code}-${i}`} finding={f} />
          ))}
          {upstream.length > 0 && (
            <div
              data-testid="doc-findings-summary-upstream-group"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                opacity: 0.5,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: TEXT_DIM,
                }}
              >
                <Trans id="docFindingsSummary.inheritedHeading">
                  Inherited from the base keyboard
                </Trans>
              </p>
              {upstream.map((f, i) => (
                <FindingRow key={`${f.code}-upstream-${i}`} finding={f} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
