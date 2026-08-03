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
import type {
  DecisionEntry,
  DecisionImpact,
  DecisionRecord,
  EditorActionType,
} from "@keyboard-studio/contracts";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { DecisionEntryRow } from "./DecisionEntryRow.tsx";
import { buildStageGroups, type StageGroup } from "./stageGroups.ts";
import type { HeadlineDimension } from "./headline.ts";
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

const stageGroupStyle: React.CSSProperties = {
  borderBottom: `1px solid ${BORDER}`,
  padding: "8px 12px",
  listStyle: "none",
};

const stageHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 8,
  flexWrap: "wrap",
};

const stageEntriesStyle: React.CSSProperties = {
  listStyle: "none",
  margin: "8px 0 0",
  padding: 0,
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
  // Per-stage collapse (FR-022/FR-023). Empty by default: every stage starts
  // expanded so the flat trail's rows stay directly reachable without an extra
  // click, and the one-line account (rendered regardless of this state) is
  // never the ONLY way to see a stage's entries.
  const [collapsedSteps, setCollapsedSteps] = useState<ReadonlySet<string>>(new Set());
  const toggleStage = (stepId: string) =>
    setCollapsedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });

  const supersededIds = useMemo(
    () =>
      new Set(record.entries.map((e) => e.supersedes).filter((id): id is string => id !== null)),
    [record.entries],
  );

  const hasSuperseded = record.entries.some((e) => supersededIds.has(e.entryId));

  // FR-022: grouped in the order stageGroups.ts already walked — never re-sorted
  // here. FR-021: this is a pure derivation over the record; it resolves no
  // entry's impact (that only ever happens inside DecisionEntryRow, on its own
  // expand click).
  const stageGroups = useMemo(() => buildStageGroups(record), [record]);
  // FR-025: a stage nothing was ever recorded for is OMITTED, never rendered as
  // though it made changes. A stage whose entries are all superseded still has
  // entries.length > 0 (FR-026 keeps that history reachable), so it is NOT
  // dropped here — only a stage truly untouched is.
  const nonEmptyStageGroups = stageGroups.filter((group) => group.entries.length > 0);

  // The editor stage a roll-up's `actionType` names (FR-008/FR-010) — the same
  // catalogue ids DecisionEntryRow uses for entry headlines, so the trail and
  // its stage summaries never disagree on what a stage is called (SC-007).
  const stageActionLabel = (actionType: EditorActionType): string => {
    switch (actionType) {
      case "gallery_edit":
        return t({
          id: "trail.entry.headline.stage.galleryEdit",
          message: "Edited the character gallery",
        });
      case "mechanism_edit":
        return t({
          id: "trail.entry.headline.stage.mechanismEdit",
          message: "Assigned key mechanisms",
        });
      case "touch_edit":
        return t({
          id: "trail.entry.headline.stage.touchEdit",
          message: "Edited the touch layout",
        });
      default: {
        const _exhaustive: never = actionType;
        return _exhaustive;
      }
    }
  };

  // One dimension's ICU-pluralized text (FR-011/FR-012) — mirrors
  // DecisionEntryRow's dimensionLabel so a stage's composed roll-up reads the
  // same way its entries do (SC-007). `count` is destructured to a plain local
  // so the Lingui macro derives the named placeholder `count`.
  const dimensionLabel = (dimension: HeadlineDimension): string => {
    const { count } = dimension;
    switch (dimension.kind) {
      case "keysRemoved":
        return t({
          id: "trail.entry.headline.dimension.keysRemoved",
          message: plural(count, { one: "# key removed", other: "# keys removed" }),
        });
      case "keysAdded":
        return t({
          id: "trail.entry.headline.dimension.keysAdded",
          message: plural(count, { one: "# key added", other: "# keys added" }),
        });
      case "mechanismsAssigned":
        return t({
          id: "trail.entry.headline.dimension.mechanismsAssigned",
          message: plural(count, {
            one: "# mechanism assigned",
            other: "# mechanisms assigned",
          }),
        });
      case "touchKeysAffected":
        return t({
          id: "trail.entry.headline.dimension.touchKeysAffected",
          message: plural(count, {
            one: "# touch key affected",
            other: "# touch keys affected",
          }),
        });
      default: {
        const _exhaustive: never = dimension.kind;
        return _exhaustive;
      }
    }
  };

  // A non-editor stage's author-facing name, keyed on the manifest stepId
  // rather than any actionType (base-contribution and survey-summary roll-ups
  // carry no actionType). FR-008 forbids rendering the raw stepId; FR-014
  // requires a readable degrade — never blank, never the identifier — for a
  // stepId this switch does not name (an unknown-to-the-manifest id, per
  // stageGroups.ts's FR-024 handling).
  const stepStageLabel = (stepId: string): string => {
    switch (stepId) {
      case "identity":
        return t({ id: "trail.stage.name.identity", message: "Keyboard identity" });
      case "choose_base":
        return t({ id: "trail.stage.name.chooseBase", message: "Choosing a base keyboard" });
      case "track":
        return t({ id: "trail.stage.name.track", message: "Authoring track" });
      case "project_name":
        return t({ id: "trail.stage.name.projectName", message: "Project name" });
      case "characters":
        return t({ id: "trail.stage.name.characters", message: "Character inventory" });
      case "marks":
        return t({ id: "trail.stage.name.marks", message: "Accents and marks" });
      case "convenience":
        return t({ id: "trail.stage.name.convenience", message: "Convenience letters" });
      case "touch_seed_source":
        return t({ id: "trail.stage.name.touchSeedSource", message: "Touch seed source" });
      case "help":
        return t({ id: "trail.stage.name.help", message: "Help and tips" });
      case "package":
        return t({ id: "trail.stage.name.package", message: "Packaging" });
      default:
        return t({ id: "trail.stage.name.unknown", message: "a stage this build does not name" });
    }
  };

  // A stage group's one-line account (FR-023), computed WITHOUT resolving any
  // entry's impact (FR-021) — every branch reads only `group.rollUp`, the pure
  // value stageGroups.ts already derived from the record.
  const stageRollUpText = (group: StageGroup): string => {
    const rollUp = group.rollUp;
    switch (rollUp.kind) {
      case "not-recorded": {
        // Reachable only for the "every entry superseded" edge (stageGroups.ts):
        // a stage with entries.length === 0 never reaches this component at all
        // (filtered above), so this branch never claims a change for a stage
        // nothing was recorded for.
        const stage = stepStageLabel(group.stepId);
        return t({ id: "trail.stage.rollUp.notRecorded", message: `${stage} (no decisions recorded)` });
      }
      case "editor-summary": {
        const stage = stageActionLabel(rollUp.actionType);
        // `detail` is a GENERIC placeholder (mirrors
        // trail.entry.headline.baseContribution.withDetail's pattern): this id
        // means "stage name, then a pre-formatted parenthetical", one meaning
        // shared by all three "composed" roll-up kinds below. The dimension
        // list itself is already localized/pluralized by `dimensionLabel`
        // before it ever reaches this placeholder.
        const detail = rollUp.dimensions.map(dimensionLabel).join(", ");
        return t({ id: "trail.stage.rollUp.composed", message: `${stage} (${detail})` });
      }
      case "editor-no-change": {
        const stage = stageActionLabel(rollUp.actionType);
        return t({ id: "trail.stage.rollUp.noChange", message: `${stage} (changed nothing)` });
      }
      case "editor-unmeasured": {
        const stage = stageActionLabel(rollUp.actionType);
        return t({ id: "trail.stage.rollUp.unmeasured", message: `${stage} (not measured)` });
      }
      case "base-contribution": {
        const stage = stepStageLabel(group.stepId);
        // FR-005a: absence is not zero — an unmeasured starting count reads the
        // same "not measured" statement an unmeasured editor stage does, never
        // a fabricated count.
        if (rollUp.startingKeyCount === undefined) {
          return t({ id: "trail.stage.rollUp.unmeasured", message: `${stage} (not measured)` });
        }
        const count = rollUp.startingKeyCount;
        const detail = t({
          id: "trail.stage.rollUp.baseContribution.startingKeyCount",
          message: plural(count, { one: "started with # key", other: "started with # keys" }),
        });
        return t({
          id: "trail.stage.rollUp.composed",
          message: `${stage} (${detail})`,
        });
      }
      case "survey-summary": {
        const stage = stepStageLabel(group.stepId);
        const count = rollUp.answerCount;
        const detail = t({
          id: "trail.stage.rollUp.surveySummary.answerCount",
          message: plural(count, { one: "# answer recorded", other: "# answers recorded" }),
        });
        return t({
          id: "trail.stage.rollUp.composed",
          message: `${stage} (${detail})`,
        });
      }
      default: {
        const _exhaustive: never = rollUp;
        return _exhaustive;
      }
    }
  };

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
          {/* FR-022: one group per stage, in the order the author walked them —
              stageGroups.ts's order is preserved, never re-sorted here. Every
              entry visible in the pre-grouping flat trail remains reachable
              inside its group (FR-024); superseded ones are still HIDDEN rather
              than filtered when the toggle is off — see DecisionEntryRow's
              `hidden` prop for why. */}
          <ul style={listStyle}>
            {nonEmptyStageGroups.map((group) => {
              const expanded = !collapsedSteps.has(group.stepId);
              return (
                <li
                  key={group.stepId}
                  style={stageGroupStyle}
                  data-testid="decision-stage-group"
                  data-step-id={group.stepId}
                >
                  <div style={stageHeaderStyle}>
                    <span style={{ flex: 1, minWidth: 0 }} data-testid="decision-stage-summary">
                      {stageRollUpText(group)}
                    </span>
                    <button
                      type="button"
                      data-testid="decision-stage-toggle"
                      style={toggleStyle}
                      aria-expanded={expanded}
                      onClick={() => toggleStage(group.stepId)}
                    >
                      {expanded
                        ? t({ id: "trail.stage.toggle.hide", message: "Hide decisions" })
                        : t({ id: "trail.stage.toggle.show", message: "Show decisions" })}
                    </button>
                  </div>
                  {expanded && (
                    <ul style={stageEntriesStyle}>
                      {group.entries.map((entry) => {
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
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
