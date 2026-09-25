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

import { useMemo, useRef, useState } from "react";
import {
  supersededEntryIds,
  type DecisionEntry,
  type DecisionImpact,
  type DecisionRecord,
  type EditorActionType,
} from "@keyboard-studio/contracts";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { DecisionEntryRow } from "./DecisionEntryRow.tsx";
import type { ResolveContext } from "../lib/resolveLocation.ts";
import { buildStageGroups, type StageGroup } from "./stageGroups.ts";
import { formatClauseList, stageActionLabel } from "./stageText.ts";
import type { HeadlineDimension } from "./headline.ts";
import { ACCENT, BORDER, FONT, TEXT_DIM } from "../ui/theme.ts";
import { useScrollRestoration } from "../hooks/useScrollRestoration.ts";
import type { StepStatus } from "../steps/answerTypes.ts";
import { notAskedPassedMessage } from "../survey/notAskedStatusMessage.ts";
import { manifest } from "../steps/manifest.ts";

export interface DecisionTrailViewProps {
  record: DecisionRecord;
  /** Entries the last read could not parse; drives the partial-read notice. */
  droppedCount?: number;
  /** Resolve one entry's impact. Called only when a row is expanded. */
  resolveImpact: (entry: DecisionEntry) => DecisionImpact | null;
  /**
   * Async resolver, forwarded verbatim to each row (spec 059). Optional: absent, the
   * rows use `resolveImpact` alone, which is how the fixture-driven renders and every
   * existing test drive this view.
   *
   * Passed DOWN as a function, never called here — this view resolves nothing, which
   * is what keeps FR-011/SC-006 true when a hundred rows mount.
   */
  resolveImpactAsync?: (entry: DecisionEntry) => Promise<DecisionImpact | null>;
  /**
   * Live reachability context for the rows' jump affordances (spec 057
   * FR-035). Composed by StudioShell for the same layer reason as `record`
   * and `resolveImpact`: `decisions/` may not import `stores/`, and the
   * context needs a traversal snapshot and whether a project exists.
   *
   * Optional, and load-bearing when absent: without it a row offers the jump
   * optimistically and `jumpToLocation` still resolves live at click time,
   * so the jump is never wrong — the author just learns an entry is
   * unreachable on activation rather than before it. Passing it is what
   * turns FR-035's "state the reason in place of a link" on.
   */
  resolveCtx?: ResolveContext;
  /**
   * The per-stage collapse set restored from last session (view state — spec
   * 057 US5, FR-050, data-model.md ViewState.trailCollapsedSteps). Read ONCE
   * as the initial value — the `useResizablePanes` idiom (`initPct` +
   * `onChange`), not a controlled prop. decisions/ may not import stores/
   * (the decisions-layer depcruise boundary), so StudioShell owns
   * `viewStateStore.trailCollapsedSteps` and hands this component only the
   * restored value and a change notifier, the same arrangement it already
   * uses for `record` / `resolveImpact` above.
   */
  initialCollapsedSteps?: ReadonlySet<string>;
  /**
   * Called with the stepId whenever a stage is toggled, so the caller can
   * persist it. Signature matches `viewStateStore.toggleTrailStage` exactly,
   * so StudioShell can wire this prop directly to that action rather than
   * re-deriving the toggle.
   */
  onToggleStage?: (stepId: string) => void;
  /** Whether "show replaced decisions" was on last session. Read once. */
  initialShowSuperseded?: boolean;
  /** Called whenever the replaced-decisions toggle changes. */
  onShowSupersededChange?: (show: boolean) => void;
  /**
   * Each survey step's current `StepStatus` (spec 079 `surveyAnswerStore`,
   * FR-068). Optional and additive: a `not-asked` step recorded no decision
   * entry at all (T055), so `stageGroups.ts` already omits it from
   * `nonEmptyStageGroups` with nothing to fix there — this prop lets a
   * caller that DOES want that stage surfaced (e.g. alongside a step that
   * still has other, answered entries) render its status as "passed —
   * {reason}" rather than rendering nothing or, worse, inventing an answer
   * for it. Absent: no behaviour change from before this prop existed.
   */
  stepStatuses?: Readonly<Record<string, StepStatus>>;
}

const containerStyle: React.CSSProperties = {
  padding: 24,
  fontFamily: FONT,
  color: "var(--app-text)",
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
  resolveImpactAsync,
  resolveCtx,
  initialCollapsedSteps,
  onToggleStage,
  initialShowSuperseded,
  onShowSupersededChange,
  stepStatuses,
}: DecisionTrailViewProps) {
  const { t, i18n } = useLingui();
  // FR-015: superseded entries stay in the DOM as history, collapsed by default so
  // the trail reads as "what I decided" first and "how I got there" on request.
  // `initialShowSuperseded` (spec 057 US5, FR-050) restores what the author had
  // left it at last session; absent (e.g. a fixture-driven test) falls back to
  // the same `false` default this component has always had.
  const [showSuperseded, setShowSupersededState] = useState(initialShowSuperseded ?? false);
  const setShowSuperseded = (next: boolean) => {
    setShowSupersededState(next);
    onShowSupersededChange?.(next);
  };
  // Per-stage collapse (FR-022/FR-023). Empty by default: every stage starts
  // expanded so the flat trail's rows stay directly reachable without an extra
  // click, and the one-line account (rendered regardless of this state) is
  // never the ONLY way to see a stage's entries. `initialCollapsedSteps`
  // (spec 057 US5, FR-050) restores last session's set on a fresh mount.
  const [collapsedSteps, setCollapsedSteps] = useState<ReadonlySet<string>>(
    initialCollapsedSteps ?? new Set(),
  );
  const toggleStage = (stepId: string) => {
    setCollapsedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
    onToggleStage?.(stepId);
  };

  // Scroll position (spec 057 US5, FR-050): one scrollable pane, one stable id.
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollRestoration(scrollRef, "decision-trail");

  // The same derivation stageGroups.ts and the engine's prSummary read through
  // (contracts' `supersededEntryIds`), so a row dimmed as "replaced" here and a
  // stage roll-up that declines to count it are always the same set of entries.
  const supersededIds = useMemo(() => supersededEntryIds(record.entries), [record.entries]);

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

  // spec 079 FR-068 (T065): a `not-asked` step usually records NO decision
  // entry at all (T055 — Convenience letters completes without one), so it
  // never earns a `StageGroup` and `nonEmptyStageGroups` above would omit it
  // entirely — the trail would say nothing about it rather than "passed —
  // {reason}". Steps that DO still have other recorded entries are handled by
  // `notAskedNoticeFor` below (appended to their existing group); a step with
  // NONE gets its own entries-free row here instead of silently vanishing.
  const groupStepIds = useMemo(() => new Set(nonEmptyStageGroups.map((g) => g.stepId)), [nonEmptyStageGroups]);
  const notAskedOnlySteps = useMemo(() => {
    if (stepStatuses === undefined) return [];
    return Object.entries(stepStatuses)
      .filter((entry): entry is [string, Extract<StepStatus, { kind: "not-asked" }>] => {
        const [stepId, status] = entry;
        return status.kind === "not-asked" && !groupStepIds.has(stepId);
      })
      .map(([stepId, status]) => ({ stepId, status }));
  }, [stepStatuses, groupStepIds]);

  // One list. FR-022's ordering (stageGroups.ts's own walked/first-appearance
  // order, including FR-024's "an unknown stepId sorts ahead of every
  // manifest stage") governs the ORDINARY stage groups and is NOT
  // re-derived or re-sorted here. `not-asked`-only rows have no entries at
  // all, so they carry no walked position of their own — they are appended
  // AFTER every stage group, in manifest order among themselves, rather than
  // spliced into a sequence whose ordering rule is deliberately not this
  // component's to reinvent.
  type DisplayItem =
    | { kind: "group"; group: StageGroup }
    | { kind: "notAsked"; stepId: string; status: Extract<StepStatus, { kind: "not-asked" }> };
  const manifestOrder = useMemo(() => new Map(manifest.map((s, i) => [s.id, i])), []);
  const displayItems = useMemo<DisplayItem[]>(() => {
    const sortedNotAsked = [...notAskedOnlySteps].sort(
      (a, b) => (manifestOrder.get(a.stepId) ?? 0) - (manifestOrder.get(b.stepId) ?? 0),
    );
    return [
      ...nonEmptyStageGroups.map((group): DisplayItem => ({ kind: "group", group })),
      ...sortedNotAsked.map(({ stepId, status }): DisplayItem => ({ kind: "notAsked", stepId, status })),
    ];
  }, [nonEmptyStageGroups, notAskedOnlySteps, manifestOrder]);

  // The editor stage a roll-up's `actionType` names (FR-008/FR-010) — the SAME
  // function DecisionEntryRow uses for entry headlines (stageText.ts), not a
  // parallel mapping over the same union, so the trail and its stage summaries
  // cannot disagree on what a stage is called (SC-007).
  const stageLabel = (actionType: EditorActionType): string => stageActionLabel(actionType, i18n);

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
      case "punctuation":
        return t({ id: "trail.stage.name.punctuation", message: "Punctuation" });
      case "invisibles":
        return t({ id: "trail.stage.name.invisibles", message: "Invisible characters" });
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

  // A stage group's name ALONE — the same per-kind mapping `stageRollUpText`
  // below uses for its own `stage` local (`stageLabel` for the three
  // editor-roll-up kinds, `stepStageLabel` for the rest), kept as its own
  // function so the stage-toggle's accessible name can name the stage without
  // repeating the (possibly long) roll-up detail. Naming via the roll-up kind
  // rather than always via `stepStageLabel(group.stepId)` matters: an editor
  // stage's `stepId` (e.g. "carve", "mechanisms", "touch") is NOT one of
  // `stepStageLabel`'s named cases — that switch only covers the non-editor
  // stages — so a naive stepId-only lookup would call every editor stage "a
  // stage this build does not name", which is worse than undistinguishable.
  const groupStageName = (group: StageGroup): string => {
    const rollUp = group.rollUp;
    switch (rollUp.kind) {
      case "not-recorded":
      case "base-contribution":
      case "survey-summary":
        return stepStageLabel(group.stepId);
      case "editor-summary":
      case "editor-no-change":
      case "editor-unmeasured":
        return stageLabel(rollUp.actionType);
      default: {
        const _exhaustive: never = rollUp;
        return _exhaustive;
      }
    }
  };

  // The stage-toggle button's accessible name (P1 fix, trail-ui a11y review):
  // the visible label alone — "Show decisions" / "Hide decisions" — repeats
  // identically on every stage, so a screen-reader user tabbing through a
  // multi-stage trail cannot tell which stage a given button controls.
  // Naming the stage via `groupStageName` makes every button's name
  // distinguishable by construction among stages that have a name (both
  // `EditorActionType` and the non-editor stepId are closed catalogs), and
  // keeps the visible text ("Show/Hide decisions") as a leading substring of
  // the accessible name (WCAG 2.5.3 Label in Name).
  // FR-068: a `not-asked` step reads as PASSED, never as an answer — the ONE
  // place this trail turns a `StepStatus` into text, via the shared
  // `notAskedStatusMessage.ts` mapping so the wording can never diverge from
  // the journey strip's own use of it (decisions/progressDots.ts).
  const notAskedNoticeFor = (group: StageGroup): string | null => {
    const status = stepStatuses?.[group.stepId];
    return status?.kind === "not-asked" ? notAskedPassedMessage(status.reason, i18n) : null;
  };

  const stageToggleAriaLabel = (group: StageGroup, expanded: boolean): string => {
    const stage = groupStageName(group);
    return expanded
      ? t({
          id: "trail.stage.toggle.hide.named",
          message: `Hide decisions for ${stage}`,
        })
      : t({
          id: "trail.stage.toggle.show.named",
          message: `Show decisions for ${stage}`,
        });
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
        const stage = stageLabel(rollUp.actionType);
        // `detail` is a GENERIC placeholder (mirrors
        // trail.entry.headline.baseContribution.withDetail's pattern): this id
        // means "stage name, then a pre-formatted parenthetical", one meaning
        // shared by all three "composed" roll-up kinds below. The dimension
        // list itself is already localized/pluralized by `dimensionLabel`
        // before it ever reaches this placeholder — including the separator
        // between them, which `formatClauseList` derives from the locale rather
        // than baking an English ", " into an already-translated string.
        const detail = formatClauseList(rollUp.dimensions.map(dimensionLabel), i18n);
        return t({ id: "trail.stage.rollUp.composed", message: `${stage} (${detail})` });
      }
      case "editor-no-change": {
        const stage = stageLabel(rollUp.actionType);
        return t({ id: "trail.stage.rollUp.noChange", message: `${stage} (changed nothing)` });
      }
      case "editor-unmeasured": {
        const stage = stageLabel(rollUp.actionType);
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
    <div ref={scrollRef} style={containerStyle} data-testid="decision-trail">
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

      {displayItems.length === 0 ? (
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
              onClick={() => setShowSuperseded(!showSuperseded)}
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
            {displayItems.map((item) => {
              if (item.kind === "notAsked") {
                // FR-068: no decisions were recorded here at all — a passed
                // statement, never an expandable stage (there is nothing to
                // expand into).
                return (
                  <li
                    key={item.stepId}
                    style={stageGroupStyle}
                    data-testid="decision-stage-not-asked-only"
                    data-step-id={item.stepId}
                  >
                    <span data-testid="decision-stage-summary">
                      {stepStageLabel(item.stepId)}
                      {" — "}
                      {notAskedPassedMessage(item.status.reason, i18n)}
                    </span>
                  </li>
                );
              }
              const group = item.group;
              const expanded = !collapsedSteps.has(group.stepId);
              // Derived from the manifest stepId (unique per group), never
              // rendered as text — an `id` attribute is not author-facing
              // content, so this is FR-008-clean the way `data-step-id`
              // already is above.
              const entriesRegionId = `decision-stage-entries-${group.stepId}`;
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
                      {notAskedNoticeFor(group) !== null && (
                        <span data-testid="decision-stage-not-asked" style={{ color: TEXT_DIM }}>
                          {" — "}
                          {notAskedNoticeFor(group)}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      data-testid="decision-stage-toggle"
                      style={toggleStyle}
                      aria-expanded={expanded}
                      aria-controls={entriesRegionId}
                      aria-label={stageToggleAriaLabel(group, expanded)}
                      onClick={() => toggleStage(group.stepId)}
                    >
                      {expanded
                        ? t({ id: "trail.stage.toggle.hide", message: "Hide decisions" })
                        : t({ id: "trail.stage.toggle.show", message: "Show decisions" })}
                    </button>
                  </div>
                  {expanded && (
                    <ul style={stageEntriesStyle} id={entriesRegionId}>
                      {group.entries.map((entry) => {
                        const superseded = supersededIds.has(entry.entryId);
                        return (
                          <DecisionEntryRow
                            key={entry.entryId}
                            entry={entry}
                            superseded={superseded}
                            hidden={superseded && !showSuperseded}
                            resolveImpact={resolveImpact}
                            {...(resolveImpactAsync !== undefined ? { resolveImpactAsync } : {})}
                            {...(resolveCtx !== undefined ? { resolveCtx } : {})}
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
