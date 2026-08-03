// DecisionEntryRow — one decision in the trail (specs/053 FR-013/FR-014/FR-015).
//
// Collapsed by default and expandable to the attributed source change. Expansion
// is what triggers the impact resolution (FR-010) — the row is handed a resolver,
// not a resolved impact, precisely so that mounting a hundred rows computes
// nothing.
//
// The four impact states each get their own rendering, and the distinctions are
// not cosmetic:
//
//   captured    -> the hunks
//   none        -> "this changed nothing in the source", in words. NOT an empty
//                  diff region, which reads as a failure (spec Edge Cases).
//   unavailable -> the localized reason. The studio cannot isolate this change and
//                  says so, rather than implying the decision did nothing.
//   shed        -> `impact` is null: the detail existed and was dropped to fit the
//                  save budget. Distinct from "never captured" because the author
//                  can act on it (a shorter session keeps its detail).
//
// The `data-testid` values here are the contract (trail-ui.contract.md §2);
// renaming one breaks tests.

import { useState } from "react";
import type { DecisionEntry, DecisionImpact } from "@keyboard-studio/contracts";
import { useLingui } from "@lingui/react/macro";
import { headlineFor } from "./headline.ts";
import { DiffHunkList } from "../ui/DiffHunkList.tsx";
import { ACCENT, BORDER, FONT, TEXT_DIM } from "../ui/theme.ts";

export interface DecisionEntryRowProps {
  entry: DecisionEntry;
  /** True when a later entry replaces this one. */
  superseded: boolean;
  /**
   * Hide the row from view while keeping it in the document.
   *
   * FR-015 requires superseded entries to REMAIN part of the trail, not to
   * disappear when collapsed — history that unmounts is history the author cannot
   * be sure is still there. So the superseded toggle hides; it does not filter.
   */
  hidden?: boolean;
  /**
   * Resolve this entry's impact. Called ONLY on expand — see the module header.
   * Returns `null` when the entry's detail was shed.
   */
  resolveImpact: (entry: DecisionEntry) => DecisionImpact | null;
}

const rowStyle: React.CSSProperties = {
  borderBottom: `1px solid ${BORDER}`,
  padding: "8px 12px",
  fontSize: 13,
  fontFamily: FONT,
  listStyle: "none",
};

const expandButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: ACCENT,
  cursor: "pointer",
  padding: 0,
  fontSize: 12,
  textDecoration: "underline",
};

const noticeStyle: React.CSSProperties = { margin: 0, color: TEXT_DIM };

export function DecisionEntryRow({
  entry,
  superseded,
  hidden = false,
  resolveImpact,
}: DecisionEntryRowProps) {
  const { t } = useLingui();
  const [expanded, setExpanded] = useState(false);

  const spec = headlineFor(entry);

  // The headline. Locals rather than member expressions in the template so the
  // Lingui macro derives NAMED placeholders ({value}, {question}) instead of
  // positional ones — a translator has to be able to reorder them.
  let headline: string;
  if (spec.id === "chose") {
    const { value, question } = spec;
    headline = t({
      id: "trail.entry.headline.chose",
      message: `Chose ${value} for ${question}`,
    });
  } else if (spec.id === "acceptedSuggested") {
    const { value, question, source } = spec;
    headline = t({
      id: "trail.entry.headline.acceptedSuggested",
      message: `Accepted suggested ${value} for ${question}, from ${source}`,
    });
  } else if (spec.id === "fromBase") {
    const { value, question } = spec;
    headline = t({
      id: "trail.entry.headline.fromBase",
      message: `Carried ${value} for ${question} from the base keyboard`,
    });
  } else {
    const {
      editor,
      keysRemoved: keysRemovedCount,
      keysAdded: keysAddedCount,
      mechanismsAssigned: mechanismsAssignedCount,
      touchKeysAffected: touchKeysAffectedCount,
    } = spec;
    // Absence renders as words, never coerced to a number (specs/055
    // FR-005/FR-005a). This one string is a placeholder for T014/T022/T030,
    // which own the real message-id design for the editor-step headline; it
    // exists only so an unmeasured dimension has something true to say.
    const notMeasured = t({
      id: "trail.entry.headline.editorStep.notMeasured",
      message: "not measured",
    });
    const countText = (count: number | undefined) =>
      count === undefined ? notMeasured : String(count);
    // Same local NAMES as the already-extracted catalog message uses (the
    // Lingui macro derives each placeholder's name from the expression's own
    // source text), just now holding formatted text instead of a raw number.
    const keysRemoved = countText(keysRemovedCount);
    const keysAdded = countText(keysAddedCount);
    const mechanismsAssigned = countText(mechanismsAssignedCount);
    const touchKeysAffected = countText(touchKeysAffectedCount);
    headline = t({
      id: "trail.entry.headline.editorStep",
      message: `Edited ${editor}: ${keysRemoved} keys removed, ${keysAdded} added, ${mechanismsAssigned} mechanisms assigned, ${touchKeysAffected} touch keys affected`,
    });
  }

  // Resolved lazily, and only while expanded. Deliberately NOT memoised across
  // collapse/expand: the working copy may have moved on, and a re-derived
  // counterfactual should reflect the IR as it is now rather than as it was the
  // first time this row happened to be opened.
  const impact = expanded ? resolveImpact(entry) : null;

  return (
    <li
      style={rowStyle}
      hidden={hidden}
      data-testid="decision-entry"
      data-entry-id={entry.entryId}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span
          data-testid="decision-entry-headline"
          style={{ flex: 1, minWidth: 0, color: superseded ? TEXT_DIM : undefined }}
        >
          {headline}
        </span>
        {superseded && (
          <span
            data-testid="decision-entry-superseded"
            style={{ fontSize: 11, color: TEXT_DIM, whiteSpace: "nowrap" }}
          >
            {t({
              id: "trail.entry.superseded.label",
              message: "Replaced by a later decision",
            })}
          </span>
        )}
        <button
          type="button"
          data-testid="decision-entry-expand"
          style={expandButtonStyle}
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded
            ? t({ id: "trail.entry.impact.collapse", message: "Hide change" })
            : t({ id: "trail.entry.impact.expand", message: "Show change" })}
        </button>
      </div>

      {expanded && (
        <div data-testid="decision-entry-impact" style={{ marginTop: 4 }}>
          {impact === null ? (
            // `resolveImpact` returns null only for a shed entry — the detail was
            // captured once and then dropped, which is a different statement from
            // "there was nothing to capture".
            <p style={noticeStyle}>
              {t({
                id: "trail.entry.impact.shed",
                message:
                  "The detail for this decision was dropped to stay within the save limit.",
              })}
            </p>
          ) : impact.state === "captured" ? (
            // One entry per changed file (specs/055-legible-decision-trail
            // FR-016/FR-018); today's producers only ever attach one, so this
            // renders the same as before. T027 widens the file set.
            impact.files.map((file) => <DiffHunkList key={file.path} hunks={file.hunks} />)
          ) : impact.state === "none" ? (
            <p style={noticeStyle}>
              {t({
                id: "trail.entry.impact.none",
                message: "This decision changed nothing in the keyboard source.",
              })}
            </p>
          ) : impact.reason === "lock-gate-dependency" ? (
            <p style={noticeStyle}>
              {t({
                id: "trail.entry.impact.unavailable.lockGate",
                message:
                  "This decision sits behind a step that has since been locked, so its effect can no longer be shown on its own.",
              })}
            </p>
          ) : (
            <p style={noticeStyle}>
              {t({
                id: "trail.entry.impact.unavailable.noWritePath",
                message:
                  "This question has no re-derivable write path in this build, so its effect cannot be shown on its own.",
              })}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
