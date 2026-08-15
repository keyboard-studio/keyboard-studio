// Lint chip — a single LintFinding rendered as a horizontal pill.
// Clicking the chip body navigates to the finding's source location.
// The "Show hint" button toggles an inline popover with plain-language
// remediation text (hint is not machine-actionable in v1).
//
// Severity color map aligns with the five levels in spec.md §10 — except
// "warning", which is deliberately excluded from the colour treatment. A
// warning-severity finding reads as a calm advisory (default foreground
// text, no yellow accent bar/code colour, a leading glyph + "Warning:"
// label) rather than looking like a bug. fatal/error/hint/info are
// untouched.

import { useState, useId } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { LintFinding } from "@keyboard-studio/contracts";
import { dispatchNavigateTo } from "./events";
import { SEVERITY_COLORS } from "./colors";
import { TEXT_MAIN } from "../ui/theme.ts";

/** Warning glyph shown before "Warning: <message>" for warning findings. */
const WARNING_GLYPH = "⚠";

export interface LintChipProps {
  finding: LintFinding;
}

/** Truncate `text` to `max` Unicode code points, appending ellipsis if cut. */
function truncate(text: string, max: number): string {
  const chars = [...text];
  return chars.length > max ? chars.slice(0, max).join("") + "…" : text;
}

export function LintChip({ finding }: LintChipProps) {
  const { t } = useLingui();
  const [hintOpen, setHintOpen] = useState(false);
  const hintId = useId();

  const isWarning = finding.severity === "warning";
  const severityColor = isWarning ? TEXT_MAIN : SEVERITY_COLORS[finding.severity];
  // The code badge's text sits on --app-surface-2 (the chip background,
  // below), which is LIGHTER than the --app-bg/--app-surface most other
  // --app-danger-text consumers pair it against — fine in light theme, but
  // navy's --sil-red-60 falls to 4.22:1 there (1.4.3, #1477). This token
  // ONLY overrides the fatal/error case for THIS pairing; the severity bar's
  // background and every other severity's text keep using severityColor.
  const isDangerSeverity = finding.severity === "fatal" || finding.severity === "error";
  const codeColor = isDangerSeverity ? "var(--app-danger-text-on-surface-2)" : severityColor;
  const isUpstream = finding.origin === "upstream";

  function handleChipClick() {
    if (finding.location !== undefined) {
      dispatchNavigateTo(finding.location);
    }
  }

  function handleHintToggle(e: React.MouseEvent<HTMLButtonElement>) {
    // Prevent the chip body click handler from also firing.
    e.stopPropagation();
    setHintOpen((prev) => !prev);
  }

  function handleChipKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleChipClick();
    }
  }

  const isNavigable = finding.location !== undefined;

  return (
    <div
      style={{ opacity: isUpstream ? 0.5 : undefined }}
    >
      {/* Chip row */}
      <div
        role={isNavigable ? "button" : undefined}
        tabIndex={isNavigable ? 0 : undefined}
        onClick={isNavigable ? handleChipClick : undefined}
        onKeyDown={isNavigable ? handleChipKeyDown : undefined}
        aria-label={
          isNavigable
            ? t({
                id: "lint.chip.navigateAriaLabel",
                message: `Go to ${{ code: finding.code }} at line ${{ line: finding.location!.line }}`,
              })
            : undefined
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--app-surface-2)",
          border: "1px solid var(--app-border)",
          borderRadius: 6,
          padding: "4px 8px",
          cursor: isNavigable ? "pointer" : "default",
          userSelect: "none",
        }}
      >
        {/* Severity indicator bar */}
        <span
          aria-hidden="true"
          style={{
            flexShrink: 0,
            width: 4,
            height: 16,
            borderRadius: 2,
            background: severityColor,
          }}
        />

        {/* Code badge */}
        <code
          style={{
            flexShrink: 0,
            fontSize: 11,
            fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
            color: codeColor,
            whiteSpace: "nowrap",
          }}
        >
          {finding.code}
        </code>

        {/* Message — warnings get a leading glyph + "Warning:" label (no
            colour treatment); the truncated message itself stays in its
            own span either way so its rendered text is exactly the
            truncated string. */}
        <span
          style={{
            flexGrow: 1,
            fontSize: 12,
            color: TEXT_MAIN,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={finding.message}
        >
          {isWarning && (
            <>
              <span aria-hidden="true">{WARNING_GLYPH}</span>{" "}
              <span>
                <Trans id="common.warningLabel">Warning:</Trans>
              </span>{" "}
            </>
          )}
          <span>{truncate(finding.message, 60)}</span>
        </span>

        {/* Show hint button — only when hint is present */}
        {finding.hint !== undefined && (
          <button
            type="button"
            onClick={handleHintToggle}
            aria-expanded={hintOpen}
            aria-controls={hintId}
            style={{
              flexShrink: 0,
              padding: "1px 6px",
              fontSize: 11,
              background: "transparent",
              border: "1px solid var(--app-border)",
              borderRadius: 4,
              color: "var(--app-text-subtle)",
              cursor: "pointer",
              fontFamily: "inherit",
              lineHeight: 1.4,
            }}
          >
            {hintOpen ? (
              <Trans id="lint.chip.hideHintButton">Hide hint</Trans>
            ) : (
              <Trans id="lint.chip.showHintButton">Show hint</Trans>
            )}
          </button>
        )}
      </div>

      {/* Hint popover — shown below the chip when open */}
      {hintOpen && finding.hint !== undefined && (
        <div
          id={hintId}
          style={{
            marginTop: 4,
            marginLeft: 12,
            padding: "6px 10px",
            background: "var(--app-surface)",
            border: "1px solid var(--app-border)",
            borderRadius: 6,
            fontSize: 12,
            color: "var(--app-text-subtle)",
            lineHeight: 1.5,
          }}
        >
          {finding.hint}
        </div>
      )}
    </div>
  );
}
