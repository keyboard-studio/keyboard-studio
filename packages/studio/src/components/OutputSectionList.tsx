// OutputSectionList — "Revise a section" on Output (spec 094 FR-001, research
// R4).
//
// Lists the sections the author has completed, each opening that step with
// the return-to-Output seam (`jumpToLocation(..., { returnTo: { route:
// "output" } })`), so a fix after testing never means walking the rest of the
// survey again.
//
// Membership and order come from what the author actually did, not from a
// hand-kept list (constitution Article IX): the steps they walked
// (`visited`, in walked order) that have decisions recorded. The steps that
// choose the starting point are left out — revising them would re-instantiate
// the working copy, which this loop must never do (FR-005).
//
// An ARIA APG disclosure: one button toggles the list (docs/accessibility.md).

import { useId, useMemo, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { buildStageGroups, type StageGroup } from "../decisions/stageGroups.ts";
import { formatClauseList, dimensionLabel } from "../decisions/stageText.ts";
import { stageLabel, unreachableReasonLabel } from "../decisions/progressDots.ts";
import { useSurveySessionStore, type ActiveStepId } from "../stores/surveySessionStore.ts";
import { jumpToLocation } from "../lib/jumpToLocation.ts";
import { ACCENT, BORDER, TEXT_DIM } from "../ui/theme.ts";

/** Steps that pick the starting point. Revising one would replace the working copy (FR-005). */
const STARTING_POINT_STEPS: ReadonlySet<string> = new Set(["layout", "choose_base", "track"]);

export interface OutputSection {
  stepId: string;
  group: StageGroup;
}

/** The completed, revisable sections, in the order the author walked them. */
export function completedSections(
  visited: readonly string[],
  groups: readonly StageGroup[],
): OutputSection[] {
  const byStep = new Map(groups.map((g) => [g.stepId, g]));
  const out: OutputSection[] = [];
  for (const stepId of visited) {
    if (STARTING_POINT_STEPS.has(stepId)) continue;
    const group = byStep.get(stepId);
    if (group === undefined || group.rollUp.kind === "not-recorded") continue;
    out.push({ stepId, group });
  }
  return out;
}

export function OutputSectionList() {
  const { t, i18n } = useLingui();
  const record = useDecisionLogStore((s) => s.record);
  const visited = useSurveySessionStore((s) => s.visited);
  const sections = useMemo(() => completedSections(visited, buildStageGroups(record)), [visited, record]);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const listId = useId();

  if (sections.length === 0) return null;

  const summary = ({ group }: OutputSection): string => {
    const rollUp = group.rollUp;
    switch (rollUp.kind) {
      case "editor-summary":
        return formatClauseList(rollUp.dimensions.map((d) => dimensionLabel(d, i18n)), i18n);
      case "survey-summary": {
        const count = rollUp.answerCount;
        return t({
          id: "output.sections.summary.answerCount",
          message: plural(count, { one: "# answer", other: "# answers" }),
        });
      }
      default:
        return t({ id: "output.sections.summary.completed", message: "Completed" });
    }
  };

  const openSection = (stepId: string) => {
    const outcome = jumpToLocation(
      { route: "survey", step: stepId as ActiveStepId },
      { returnTo: { route: "output" } },
    );
    setStatus(outcome.kind === "refused" ? unreachableReasonLabel(outcome.reason, i18n) : null);
  };

  return (
    <section
      aria-label={t({ id: "output.sections.regionLabel", message: "Revise a section" })}
      data-testid="output-section-list"
      style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        data-testid="output-section-list-toggle"
        onClick={() => setOpen((v) => !v)}
        style={{
          alignSelf: "flex-start",
          padding: "6px 12px",
          background: "transparent",
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          color: ACCENT,
          fontSize: 13,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <Trans id="output.sections.toggle">Revise a section</Trans>
      </button>
      <ul id={listId} hidden={!open} style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {sections.map((section) => {
          const label = stageLabel(section.stepId, i18n);
          const detail = summary(section);
          return (
            <li key={section.stepId}>
              <button
                type="button"
                data-testid={`output-section-${section.stepId}`}
                aria-label={t({
                  id: "output.sections.open.ariaLabel",
                  message: `Revise ${label}: ${detail}`,
                })}
                onClick={() => openSection(section.stepId)}
                style={{
                  display: "flex",
                  gap: 8,
                  width: "100%",
                  padding: "6px 4px",
                  background: "transparent",
                  border: "none",
                  borderBottom: `1px solid ${BORDER}`,
                  color: "inherit",
                  fontSize: 13,
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <span style={{ fontWeight: 600 }}>{label}</span>
                <span style={{ color: TEXT_DIM }}>{detail}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <span role="status" aria-live="polite" style={{ fontSize: 12, color: TEXT_DIM }}>
        {status}
      </span>
    </section>
  );
}
