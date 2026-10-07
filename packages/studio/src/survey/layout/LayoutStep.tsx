// LayoutStep — the community-layout question as its own spine step, right
// after Identity (spec 076 A4), and the `windows-layout` gallery module's
// renderer (spec 090 T011).
//
// Propose-then-confirm: the studio suggests a Windows layout from the
// identity language tag and preselects it; the author confirms it or
// searches all layouts and picks another. Never a blank selection. Every
// pick reports through `onChange` immediately — the gallery host
// (LayoutStepHost, this folder) records it as the `windows-layout`
// decision; Continue on an untouched suggestion records it as confirmed.
// The pick feeds the FR-023 likely-host resolution (lib/layoutFamily.ts),
// whose readers resolve it from the decision.
//
// This file is the RENDERER only: it receives the recorded value through
// DecisionRendererProps and never writes a store. The step wrapper
// (LayoutStepHost.tsx) owns navigation and the manifest registration.

import { useMemo } from "react";
import { Trans } from "@lingui/react/macro";
import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { deriveSurveyContext } from "../../decisions/identitySelectors.ts";
import { WindowsLayoutPicker } from "../../components/WindowsLayoutPicker.tsx";
import { proposeWindowsLayout, windowsLayoutById } from "../../lib/windowsLayouts.ts";
import type { LayoutProposalBasis } from "../../lib/windowsLayouts.ts";
import { phaseHeadingFlush, mutedParaFlush } from "../surveyStyles.ts";

/**
 * The windows-layout decision value (spec 090 data-model.md). Declared
 * here, with the renderer, and re-exported by the gallery module
 * (survey/questions/gallery/windowsLayout.ts): the module imports this
 * file for the component, so the type must not also flow module → here
 * (a depcruise no-circular cycle; research addendum D-090-8).
 */
export interface WindowsLayoutValue {
  layoutId: string;
  origin: "proposed" | "confirmed" | "overturned";
}

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

export function WindowsLayoutRenderer({ value, onChange }: DecisionRendererProps<WindowsLayoutValue>) {
  // bcp47 from the decision-derived survey context (spec 089's
  // identitySelectors migration, adopted at the 089 merge — the session
  // store's surveyContext is no longer the source).
  const bcp47 = useDecisionStore((s) => deriveSurveyContext(s.decisions).bcp47_tag);

  const proposal = useMemo(() => proposeWindowsLayout(bcp47), [bcp47]);
  const recordedId =
    value !== undefined && windowsLayoutById(value.layoutId) !== undefined ? value.layoutId : undefined;
  const selectedId = recordedId ?? proposal.layout.id;
  const selected = windowsLayoutById(selectedId) ?? proposal.layout;
  const isSuggestion = selectedId === proposal.layout.id;
  const selectedName = selected.name;
  const suggestedName = proposal.layout.name;

  function pick(id: string): void {
    onChange({ layoutId: id, origin: id === proposal.layout.id ? "confirmed" : "overturned" });
  }

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
}
