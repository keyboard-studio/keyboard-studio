// DocumentationChecklist — the Output step's informational list of the six
// documentation members every package ships (spec 076 FR-017, research R10).
//
// Six rows from `useDocMemberStates` (the FR-022 single source of truth): the
// member's name and projected path, the tier its content came from (derived /
// inherited / authored), a placeholder marker while the member is still the
// fallback stub, and any per-row warnings (a base page referencing images that
// were not carried). Placeholder rows offer "Go to <step>", which routes through
// `jumpToLocation` — the ONE jump implementation (spec 057), which performs a
// BACK-style `jumpToStep` — and never the forward-push `advance()`: that
// primitive leaves a stale entry on the traversal history, the documented P0
// regression the survey session store's `backToUnfinishedGallery` guards.
//
// NEVER BLOCKS (FR-018): this component reads state only. It is wired into
// neither `canDownload` (usePreviewArtifact) nor `submitEnabled`
// (ManagedPRSubmitPanel); the regression test downloads and submits with every
// prose row on placeholder.
//
// Open by default (SC-006: every tier and placeholder state visible without a
// secondary view); the disclosure toggle (RemovalBanner precedent) lets the
// author collapse it. The welcome row also carries the layout-chart preference
// control (FR-015 / FR-021 surface 5) when the base ships its own images.
//
// Accessibility (docs/accessibility.md): a labelled region, a semantic list,
// buttons with explicit names, a radiogroup for the chart choice; no new live
// region — the checklist changes only in response to the author's own actions.

import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { ChartPreference, DocMemberId, DocMemberState, DocSourceTier } from "@keyboard-studio/contracts";
import { useDocMemberStates } from "../hooks/useDocMemberStates.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { jumpToLocation } from "../lib/jumpToLocation.ts";
import { navigateTo } from "../lib/navigate.ts";
import { carriedWelcomeImages, effectiveChartPreference } from "../lib/welcomeFolder.ts";
import type { ActiveStepId } from "../stores/surveySessionStore.ts";

/**
 * The Phase F question a placeholder row lands on. The description feeds four
 * members; HISTORY has its own proposal screen. Members without a question
 * (LICENSE) land on their step with no question cursor.
 */
const FILL_QUESTION: Partial<Record<DocMemberId, string>> = {
  "readme-md": "pf_welcome_paragraph",
  "readme-htm": "pf_welcome_paragraph",
  "welcome-htm": "pf_welcome_paragraph",
  "help-php": "pf_welcome_paragraph",
  "history-md": "pf_history_entry",
};

/**
 * Route the author to the step that fills a member. `jumpToLocation` arrives or
 * refuses (spec 057 FR-012); on a refusal (a step never reached on this walk)
 * the plain survey route still resumes the walk where it stands, so the button
 * always does something — and neither path calls `advance()`.
 */
export function goToFillStep(state: DocMemberState): void {
  const step = state.fillStepId as ActiveStepId;
  const question = FILL_QUESTION[state.member];
  const outcome = jumpToLocation({ route: "survey", step, ...(question !== undefined ? { question } : {}) });
  if (outcome.kind === "refused") navigateTo("survey");
}

const ROW_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: "2px 10px",
  padding: "6px 0",
  borderTop: "1px solid var(--app-border)",
};

const TAG_STYLE: React.CSSProperties = {
  display: "inline-block",
  font: "600 10.5px/1.4 var(--app-font)",
  letterSpacing: ".03em",
  textTransform: "uppercase",
  padding: "1px 6px",
  borderRadius: 4,
  border: "1px solid var(--app-border-strong)",
  color: "var(--app-text-subtle)",
};

const SMALL_BUTTON: React.CSSProperties = {
  font: "600 12px var(--app-font)",
  cursor: "pointer",
  color: "var(--app-text)",
  background: "transparent",
  border: "1px solid var(--app-border-strong)",
  borderRadius: 7,
  padding: "3px 9px",
};

export function DocumentationChecklist() {
  const { t } = useLingui();
  const [open, setOpen] = useState(true);
  const states = useDocMemberStates();
  const baseWelcomeImages = useWorkingCopyStore((s) => s.baseWelcomeImages);
  const chartPreference = useWorkingCopyStore((s) => s.chartPreference);
  const setChartPreference = useWorkingCopyStore((s) => s.setChartPreference);
  const baseShipsImages = carriedWelcomeImages(baseWelcomeImages).length > 0;
  const effectivePreference: ChartPreference = effectiveChartPreference(chartPreference, baseShipsImages);

  const memberName = (member: DocMemberId): string => {
    switch (member) {
      case "readme-md":
        return t({ id: "output.docs.checklist.member.readmeMd", message: "Package README" });
      case "history-md":
        return t({ id: "output.docs.checklist.member.historyMd", message: "Version history" });
      case "license-md":
        return t({ id: "output.docs.checklist.member.licenseMd", message: "License" });
      case "readme-htm":
        return t({ id: "output.docs.checklist.member.readmeHtm", message: "Package details page" });
      case "welcome-htm":
        return t({ id: "output.docs.checklist.member.welcomeHtm", message: "Welcome page" });
      case "help-php":
        return t({ id: "output.docs.checklist.member.helpPhp", message: "Online help page" });
    }
  };

  const tierLabel = (tier: DocSourceTier): string => {
    switch (tier) {
      case "derived":
        return t({ id: "output.docs.checklist.tier.derived", message: "derived" });
      case "inherited":
        return t({ id: "output.docs.checklist.tier.inherited", message: "inherited" });
      case "authored":
        return t({ id: "output.docs.checklist.tier.authored", message: "authored" });
    }
  };

  const stepLabel = (fillStepId: string): string =>
    fillStepId === "identity"
      ? t({ id: "output.docs.checklist.step.identity", message: "Language & identity" })
      : t({ id: "output.docs.checklist.step.help", message: "Help & Tips" });

  const placeholderCount = states.filter((s) => s.placeholder).length;
  const summary =
    placeholderCount === 0
      ? t({
          id: "output.docs.checklist.summary.complete",
          message: "Documentation: all six files have real content.",
        })
      : t({
          id: "output.docs.checklist.summary.placeholders",
          message: plural(placeholderCount, {
            one: "Documentation: # of six files still ships placeholder text.",
            other: "Documentation: # of six files still ship placeholder text.",
          }),
        });

  return (
    <section
      aria-label={t({ id: "output.docs.checklist.regionAriaLabel", message: "Documentation that ships" })}
      data-testid="documentation-checklist"
      style={{
        marginTop: 10,
        padding: "8px 12px",
        border: "1px solid var(--app-border)",
        borderRadius: 6,
        background: "var(--app-surface)",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        fontSize: 12,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="documentation-checklist-rows"
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          gap: 8,
          textAlign: "left",
          font: "600 13px var(--app-font)",
          color: "var(--app-text)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <span aria-hidden="true" style={{ display: "inline-block", width: 10 }}>
          {open ? "v" : ">"}
        </span>
        <span>{summary}</span>
      </button>

      {open && (
        <ul
          id="documentation-checklist-rows"
          aria-label={t({ id: "output.docs.checklist.listAriaLabel", message: "Documentation files" })}
          style={{ margin: "8px 0 0", padding: 0, listStyle: "none" }}
        >
          {states.map((s) => (
            <li key={s.member} data-testid={`doc-member-${s.member}`} data-tier={s.tier} style={ROW_STYLE}>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 600, color: "var(--app-text)" }}>{memberName(s.member)}</span>{" "}
                <code style={{ fontFamily: "ui-monospace, monospace", color: "var(--app-text-subtle)" }}>{s.path}</code>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, justifySelf: "end" }}>
                <span style={TAG_STYLE}>{tierLabel(s.tier)}</span>
                {s.placeholder && (
                  <span
                    style={{ ...TAG_STYLE, color: "var(--app-warning-text)", borderColor: "var(--app-warning-border)" }}
                  >
                    <Trans id="output.docs.checklist.placeholder">placeholder</Trans>
                  </span>
                )}
                {s.placeholder && (
                  <button
                    type="button"
                    onClick={() => goToFillStep(s)}
                    aria-label={t({
                      id: "output.docs.checklist.goTo.ariaLabel",
                      message: `Go to ${{ step: stepLabel(s.fillStepId) }} to fill in ${{ member: memberName(s.member) }}`,
                    })}
                    style={SMALL_BUTTON}
                  >
                    {t({ id: "output.docs.checklist.goTo.label", message: `Go to ${{ step: stepLabel(s.fillStepId) }}` })}
                  </button>
                )}
              </div>
              {s.warnings.length > 0 && (
                <ul style={{ gridColumn: "1 / -1", margin: 0, paddingLeft: 16, color: "var(--app-warning-text)" }}>
                  {s.warnings.map((w) => (
                    <li key={w}>{"[WARN] "}{w}</li>
                  ))}
                </ul>
              )}
              {s.member === "welcome-htm" && baseShipsImages && (
                <div
                  role="radiogroup"
                  aria-label={t({ id: "output.docs.charts.groupAriaLabel", message: "Layout images" })}
                  style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: 12, marginTop: 2 }}
                >
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="chart-preference"
                      value="keep-base-images"
                      checked={effectivePreference === "keep-base-images"}
                      onChange={() => setChartPreference("keep-base-images")}
                    />
                    <Trans id="output.docs.charts.keepBaseImages">Keep base images</Trans>
                  </label>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="chart-preference"
                      value="regenerate"
                      checked={effectivePreference === "regenerate"}
                      onChange={() => setChartPreference("regenerate")}
                    />
                    <Trans id="output.docs.charts.regenerate">Regenerate layout charts</Trans>
                  </label>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
