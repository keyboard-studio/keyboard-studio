// Lint chip — a single LintFinding rendered as a horizontal pill.
// Clicking the chip body navigates to the finding's source location.
// The "Show hint" button toggles an inline popover with plain-language
// remediation text (hint is not machine-actionable in v1).
//
// Severity color map aligns with the five levels in spec.md §10.

import { useState, useId } from "react";
import type { LintFinding } from "@keyboard-studio/contracts";
import { dispatchNavigateTo } from "./events";
import { SEVERITY_COLORS } from "./colors";

export interface LintChipProps {
  finding: LintFinding;
}

/** Truncate `text` to `max` Unicode code points, appending ellipsis if cut. */
function truncate(text: string, max: number): string {
  const chars = [...text];
  return chars.length > max ? chars.slice(0, max).join("") + "…" : text;
}

export function LintChip({ finding }: LintChipProps) {
  const [hintOpen, setHintOpen] = useState(false);
  const hintId = useId();

  const severityColor = SEVERITY_COLORS[finding.severity];
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
            ? `Go to ${finding.code} at line ${finding.location!.line}`
            : undefined
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "#1c2128",
          border: "1px solid #283040",
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
            color: severityColor,
            whiteSpace: "nowrap",
          }}
        >
          {finding.code}
        </code>

        {/* Message */}
        <span
          style={{
            flexGrow: 1,
            fontSize: 12,
            color: "#e6edf3",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={finding.message}
        >
          {truncate(finding.message, 60)}
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
              border: "1px solid #283040",
              borderRadius: 4,
              color: "#9aa7b8",
              cursor: "pointer",
              fontFamily: "inherit",
              lineHeight: 1.4,
            }}
          >
            {hintOpen ? "Hide hint" : "Show hint"}
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
            background: "#161b22",
            border: "1px solid #283040",
            borderRadius: 6,
            fontSize: 12,
            color: "#9aa7b8",
            lineHeight: 1.5,
          }}
        >
          {finding.hint}
        </div>
      )}
    </div>
  );
}
