// LayoutStep — the community-layout question as its own spine step, right
// after Identity (spec 076 A4), and the `windows-layout` gallery module's
// renderer (spec 090 T011).
//
// Propose-then-confirm, multi-select since #1902: the studio suggests a
// Windows layout from the identity language tag and preselects it; the
// author confirms it or searches all layouts and picks others. Choosing
// from the picker selects that layout — while the selection is exactly the
// untouched suggestion it is replaced (the suggestion is provisional until
// confirmed); further choices move to the front of the selection (becoming
// the primary) and earlier choices are kept, each removable from the chips
// list. Every change reports through `onChange` immediately — the gallery
// host (LayoutStepHost, this folder) records it as the `windows-layout`
// decision; Continue on an untouched suggestion records it as confirmed.
// The picks feed the FR-023 likely-host resolution (lib/layoutFamily.ts),
// whose readers resolve them from the decision.
//
// This file is the RENDERER only: it receives the recorded value through
// DecisionRendererProps and never writes a store. The step wrapper
// (LayoutStepHost.tsx) owns navigation and the manifest registration.

import { useMemo } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { deriveSurveyContext } from "../../decisions/identitySelectors.ts";
import { WindowsLayoutPicker } from "../../components/WindowsLayoutPicker.tsx";
import { proposeWindowsLayout, windowsLayoutById } from "../../lib/windowsLayouts.ts";
import type { LayoutProposalBasis } from "../../lib/windowsLayouts.ts";
import { pickedLayoutIds } from "../../lib/layoutFamily.ts";
import { phaseHeadingFlush, mutedParaFlush } from "../surveyStyles.ts";

/**
 * The windows-layout decision value (spec 090 data-model.md; multi-select
 * since #1902). Declared here, with the renderer, and re-exported by the
 * gallery module (survey/questions/gallery/windowsLayout.ts): the module
 * imports this file for the component, so the type must not also flow
 * module → here (a depcruise no-circular cycle; research addendum D-090-8).
 *
 * `layoutIds` is in selection order; the first element is the primary pick
 * (back-compat with the pre-#1902 single pick). Origin stays a single
 * per-answer value (#1902 deliberately did not model per-layout
 * provenance): "confirmed" when the selection is exactly the untouched
 * suggestion, "overturned" for any author change.
 */
export interface WindowsLayoutValue {
  layoutIds: string[];
  origin: "proposed" | "confirmed" | "overturned";
}

const HEADING_ID = "layout-step-heading";
const WHY_ID = "layout-step-why";
const SELECTED_ID = "layout-step-selected";

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
  const { t } = useLingui();
  // bcp47 from the decision-derived survey context (spec 089's
  // identitySelectors migration, adopted at the 089 merge — the session
  // store's surveyContext is no longer the source).
  const bcp47 = useDecisionStore((s) => deriveSurveyContext(s.decisions).bcp47_tag);

  const proposal = useMemo(() => proposeWindowsLayout(bcp47), [bcp47]);
  // The recorded selection, tolerating the pre-#1902 single-id shape so old
  // drafts still load. When nothing valid is recorded the suggestion stands
  // in — unrecorded, exactly as before.
  const selectedIds = useMemo(() => {
    const recorded = pickedLayoutIds(value);
    return recorded.length > 0 ? recorded : [proposal.layout.id];
  }, [value, proposal.layout.id]);
  const primaryId = selectedIds[0]!;
  const primary = windowsLayoutById(primaryId) ?? proposal.layout;
  const isSuggestion = primaryId === proposal.layout.id;
  const selectedName = primary.name;
  const suggestedName = proposal.layout.name;
  const extraNames = selectedIds
    .slice(1)
    .map((id) => windowsLayoutById(id)?.name ?? id)
    .join(", ");

  function originFor(ids: string[]): WindowsLayoutValue["origin"] {
    return ids.length === 1 && ids[0] === proposal.layout.id ? "confirmed" : "overturned";
  }

  // Choosing from the picker selects that layout: while the selection is
  // exactly the untouched suggestion it is replaced (the pre-#1902
  // behaviour — the suggestion is provisional until confirmed); otherwise
  // the choice moves to the front and becomes the primary, and the rest of
  // the selection is kept in order.
  function pick(id: string): void {
    if (selectedIds[0] === id) return;
    const next =
      selectedIds.length === 1 && selectedIds[0] === proposal.layout.id
        ? [id]
        : [id, ...selectedIds.filter((x) => x !== id)];
    onChange({ layoutIds: next, origin: originFor(next) });
  }

  // The selection is never empty: the last layout's remove stays disabled.
  function removePick(id: string): void {
    if (selectedIds.length <= 1) return;
    const next = selectedIds.filter((x) => x !== id);
    onChange({ layoutIds: next, origin: originFor(next) });
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
        <Trans id="layout.step.baseKeyboardIntro">
          This is the base keyboard on your community&apos;s computers (the Windows layout). It
          tells the studio which keys your typists already have, so it can show what would happen
          on their machines. Confirm the suggestion or search for another.
        </Trans>
      </p>

      <WindowsLayoutPicker
        selectedId={primaryId}
        selectedIds={selectedIds}
        suggestedId={proposal.layout.id}
        onSelect={pick}
        labelledBy={HEADING_ID}
        describedBy={WHY_ID}
      />

      <div role="group" aria-labelledby={SELECTED_ID} data-testid="layout-selected-list">
        <p id={SELECTED_ID} style={{ ...mutedParaFlush, fontSize: 13, fontWeight: 600, margin: "0 0 4px" }}>
          <Trans id="layout.step.selectedLayouts">Selected layouts</Trans>
        </p>
        <p style={{ ...mutedParaFlush, fontSize: 12.5, margin: "0 0 8px" }}>
          <Trans id="layout.step.addMoreHint">
            Choosing from the search above makes that layout the primary one; earlier choices stay
            selected below.
          </Trans>
        </p>
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {selectedIds.map((id, i) => {
            const layout = windowsLayoutById(id);
            if (layout === undefined) return null;
            const isLast = selectedIds.length <= 1;
            return (
              <li
                key={id}
                data-testid={`layout-chip-${id}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 6px 4px 10px",
                  border: "1px solid var(--app-border)",
                  borderRadius: 999,
                  background: "var(--app-surface)",
                  fontSize: 13,
                }}
              >
                <span>{layout.name}</span>
                {i === 0 && (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                      color: "var(--app-accent)",
                    }}
                  >
                    <Trans id="layout.step.primaryBadge">Primary</Trans>
                  </span>
                )}
                <button
                  type="button"
                  data-testid={`layout-remove-${id}`}
                  disabled={isLast}
                  aria-label={t({
                    id: "layout.step.removeLayout",
                    message: `Remove ${layout.name}`,
                  })}
                  onClick={() => removePick(id)}
                  style={{
                    border: "1px solid var(--app-border)",
                    borderRadius: 999,
                    background: "transparent",
                    color: "var(--app-text)",
                    width: 22,
                    height: 22,
                    lineHeight: 1,
                    cursor: isLast ? "default" : "pointer",
                    opacity: isLast ? 0.4 : 1,
                    fontSize: 14,
                  }}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      </div>

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
        {extraNames !== "" && (
          <>
            {" "}
            <Trans id="layout.step.alsoSelected">Also selected: {extraNames}.</Trans>
          </>
        )}
      </p>
    </div>
  );
}
