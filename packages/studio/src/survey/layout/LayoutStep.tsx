// LayoutStep — the community-layout question as its own spine step, right
// after Identity (spec 076 A4).
//
// Propose-then-confirm: the studio suggests a Windows layout from the identity
// language tag and preselects it; the author confirms it or searches all
// layouts and picks another. Never a blank selection. Every pick persists
// immediately (survey answer store, answer "host_layout" on step "layout");
// Continue on an untouched suggestion records it as confirmed. The pick feeds
// the FR-023 likely-host resolution (lib/layoutFamily.ts).

import { useMemo } from "react";
import type { ComponentType } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { EditorStepProps } from "../../steps/types.ts";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { deriveSurveyContext } from "../../decisions/identitySelectors.ts";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import { WindowsLayoutPicker } from "../../components/WindowsLayoutPicker.tsx";
import { proposeWindowsLayout, windowsLayoutById } from "../../lib/windowsLayouts.ts";
import type { LayoutProposalBasis } from "../../lib/windowsLayouts.ts";
import {
  HOST_LAYOUT_ANSWER_ID,
  LAYOUT_FAMILY_STEP_ID,
  savePickedWindowsLayout,
} from "../../lib/layoutFamily.ts";
import { phaseHeadingFlush, mutedParaFlush } from "../surveyStyles.ts";

const HEADING_ID = "layout-step-heading";
const WHY_ID = "layout-step-why";

function WhyLine({ basis, tag }: { basis: LayoutProposalBasis; tag: string }) {
  if (basis === "region") {
    return (
      <Trans id="layout.step.why.region">
        Suggested from the region in your language tag ({tag}).
      </Trans>
    );
  }
  if (basis === "language") {
    return (
      <Trans id="layout.step.why.language">
        Suggested because this layout is used for your language tag ({tag}).
      </Trans>
    );
  }
  return (
    <Trans id="layout.step.why.default">
      Nothing in your language tag points to a particular layout, so this is the most widely used one.
    </Trans>
  );
}

const LayoutStep: ComponentType<EditorStepProps> = ({ onComplete, onBack }: EditorStepProps) => {
  const { t } = useLingui();
  const bcp47 = useDecisionStore((s) => deriveSurveyContext(s.decisions).bcp47_tag);
  const savedValue = useSurveyAnswerStore(
    (s) => s.steps[LAYOUT_FAMILY_STEP_ID]?.answers[HOST_LAYOUT_ANSWER_ID]?.value,
  );

  const proposal = useMemo(() => proposeWindowsLayout(bcp47), [bcp47]);
  const savedId = typeof savedValue === "string" && windowsLayoutById(savedValue) !== undefined ? savedValue : undefined;
  const selectedId = savedId ?? proposal.layout.id;
  const selected = windowsLayoutById(selectedId) ?? proposal.layout;
  const isSuggestion = selectedId === proposal.layout.id;
  const selectedName = selected.name;
  const suggestedName = proposal.layout.name;

  function pick(id: string): void {
    savePickedWindowsLayout(id, id === proposal.layout.id ? "confirmed" : "overturned");
  }

  function confirm(): void {
    savePickedWindowsLayout(selectedId, isSuggestion ? "confirmed" : "overturned");
    useSurveyAnswerStore.getState().setStatus(LAYOUT_FAMILY_STEP_ID, { kind: "finished" });
    onComplete(undefined);
  }

  usePublishStepNav({
    ...(onBack !== undefined
      ? {
          back: {
            label: t({ id: "layout.step.backButton", message: "Back" }),
            onClick: onBack,
            testId: "layout-back",
          },
        }
      : {}),
    forward: {
      label: isSuggestion
        ? t({ id: "layout.step.confirmButton", message: "Yes, use this layout" })
        : t({ id: "layout.step.continueButton", message: "Continue with this layout" }),
      onClick: confirm,
      testId: "layout-continue",
    },
  });

  return (
    <div
      data-testid="layout-step"
      style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640, padding: 16, overflow: "auto" }}
    >
      <h2 id={HEADING_ID} style={phaseHeadingFlush}>
        <Trans id="layout.step.heading">Which keyboard layout do your typists use?</Trans>
      </h2>
      <p style={mutedParaFlush}>
        <Trans id="layout.step.intro">
          This is the physical layout on your community&apos;s computers (the Windows layout). It
          tells the studio which keys your typists already have, so it can show what would happen
          on their machines. Confirm the suggestion or search for another.
        </Trans>
      </p>

      <WindowsLayoutPicker
        selectedId={selectedId}
        suggestedId={proposal.layout.id}
        onSelect={pick}
        labelledBy={HEADING_ID}
        describedBy={WHY_ID}
      />

      <p id={WHY_ID} data-testid="layout-step-why" style={{ ...mutedParaFlush, fontSize: 13 }}>
        {isSuggestion ? (
          <>
            <strong>{selectedName}</strong>{" "}
            <WhyLine basis={proposal.basis} tag={bcp47 ?? ""} />
          </>
        ) : (
          <Trans id="layout.step.why.chosen">
            You chose <strong>{selectedName}</strong>. The studio suggested{" "}
            <strong>{suggestedName}</strong>.
          </Trans>
        )}
      </p>
    </div>
  );
};

export { LayoutStep };
