// DecisionTrailView — the author-facing decision trail (specs/053 US1).
//
// The trail is one list, in append order, of every decision the author made,
// each expandable to what it did to the source. That is the whole surface; its
// value is in being complete and readable, not in being clever.
//
// SC-007 ("no perceptible delay") is STRUCTURAL here, not an optimisation: this
// component renders from the record alone and computes no impact on mount.
// Expanding one row resolves one impact. There is no code path that could resolve
// them all, which is also FR-027's "nothing derived for what was not asked".
//
// Three notices sit above the list, and each is a statement the record makes about
// itself rather than an error:
//   - empty      -> decisions will appear as they are made
//   - truncated  -> detail was dropped to fit the save limit
//   - partial    -> part of the record could not be read; this is what was readable
// None of them hides the list, because a partial trail is still worth reading.

import { useMemo, useState } from "react";
import type { DecisionEntry, DecisionImpact, DecisionRecord } from "@keyboard-studio/contracts";
import { Trans, useLingui } from "@lingui/react/macro";
import { DecisionEntryRow } from "./DecisionEntryRow.tsx";
import { ACCENT, BORDER, FONT, TEXT_DIM } from "../ui/theme.ts";

export interface DecisionTrailViewProps {
  record: DecisionRecord;
  /** Entries the last read could not parse; drives the partial-read notice. */
  droppedCount?: number;
  /** Resolve one entry's impact. Called only when a row is expanded. */
  resolveImpact: (entry: DecisionEntry) => DecisionImpact | null;
}

const containerStyle: React.CSSProperties = {
  padding: 24,
  fontFamily: FONT,
  color: "var(--app-text, #e6edf3)",
  height: "100%",
  overflowY: "auto",
  boxSizing: "border-box",
};

const noticeStyle: React.CSSProperties = {
  margin: "0 0 12px",
  padding: "8px 12px",
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  fontSize: 13,
  color: TEXT_DIM,
};

const listStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
};

const toggleStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: ACCENT,
  cursor: "pointer",
  padding: 0,
  fontSize: 12,
  textDecoration: "underline",
  marginBottom: 8,
};

export function DecisionTrailView({
  record,
  droppedCount = 0,
  resolveImpact,
}: DecisionTrailViewProps) {
  const { t } = useLingui();
  // FR-015: superseded entries stay in the DOM as history, collapsed by default so
  // the trail reads as "what I decided" first and "how I got there" on request.
  const [showSuperseded, setShowSuperseded] = useState(false);

  const supersededIds = useMemo(
    () =>
      new Set(record.entries.map((e) => e.supersedes).filter((id): id is string => id !== null)),
    [record.entries],
  );

  const hasSuperseded = record.entries.some((e) => supersededIds.has(e.entryId));

  return (
    <div style={containerStyle} data-testid="decision-trail">
      <h2 style={{ margin: "0 0 12px", fontSize: "1.1rem", color: ACCENT }}>
        <Trans id="trail.title">Decision trail</Trans>
      </h2>

      {record.truncated !== null && (
        <p style={noticeStyle} data-testid="decision-trail-truncated">
          <Trans id="trail.truncated.notice">
            Some detail was dropped from this record to stay within the save limit. Every
            decision is still listed.
          </Trans>
        </p>
      )}

      {droppedCount > 0 && (
        <p style={noticeStyle} data-testid="decision-trail-partial">
          <Trans id="trail.partial.notice">
            Part of this record could not be read. Showing what was readable.
          </Trans>
        </p>
      )}

      {record.entries.length === 0 ? (
        <div data-testid="decision-trail-empty">
          <h3 style={{ margin: "0 0 4px", fontSize: 14 }}>
            <Trans id="trail.empty.title">No decisions recorded yet</Trans>
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: TEXT_DIM }}>
            <Trans id="trail.empty.body">
              Decisions appear here as you make them, each with the change it made to your
              keyboard.
            </Trans>
          </p>
        </div>
      ) : (
        <>
          {hasSuperseded && (
            <button
              type="button"
              data-testid="decision-superseded-toggle"
              style={toggleStyle}
              aria-expanded={showSuperseded}
              onClick={() => setShowSuperseded((prev) => !prev)}
            >
              {showSuperseded
                ? t({ id: "trail.superseded.hide", message: "Hide replaced decisions" })
                : t({ id: "trail.superseded.show", message: "Show replaced decisions" })}
            </button>
          )}
          {/* Every entry renders, in append order (FR-012). Superseded ones are
              HIDDEN rather than filtered when the toggle is off — see
              DecisionEntryRow's `hidden` prop for why. */}
          <ul style={listStyle}>
            {record.entries.map((entry) => {
              const superseded = supersededIds.has(entry.entryId);
              return (
                <DecisionEntryRow
                  key={entry.entryId}
                  entry={entry}
                  superseded={superseded}
                  hidden={superseded && !showSuperseded}
                  resolveImpact={resolveImpact}
                />
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
