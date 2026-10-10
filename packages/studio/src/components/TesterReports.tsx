// TesterReports — the author's own notes on what testers reported (spec 094
// FR-012..FR-014).
//
// Each report belongs to the build it was found in, optionally names the
// section it concerns (which opens with the return-to-Output seam, FR-013),
// and is open or fixed. Marking a report fixed records the decision cursor;
// the next build stamps itself as the one containing the fix
// (testingStore.recordBuild). Nothing here is tester-facing.

import { useId, useMemo, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { REPORT_TEXT_MAX, useTestingStore } from "../stores/testingStore.ts";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { buildStageGroups } from "../decisions/stageGroups.ts";
import { stageLabel } from "../decisions/progressDots.ts";
import { useSurveySessionStore, type ActiveStepId } from "../stores/surveySessionStore.ts";
import { jumpToLocation } from "../lib/jumpToLocation.ts";
import { completedSections } from "./OutputSectionList.tsx";
import { ACCENT, BORDER, TEXT_DIM } from "../ui/theme.ts";

const LINK_STYLE = {
  background: "none",
  border: "none",
  padding: 0,
  color: ACCENT,
  textDecoration: "underline",
  cursor: "pointer",
  font: "inherit",
} as const;

export function TesterReports() {
  const { t, i18n } = useLingui();
  const builds = useTestingStore((s) => s.builds);
  const reports = useTestingStore((s) => s.reports);
  const frozen = useTestingStore((s) => s.frozen);
  const record = useDecisionLogStore((s) => s.record);
  const visited = useSurveySessionStore((s) => s.visited);
  const sections = useMemo(() => completedSections(visited, buildStageGroups(record)), [visited, record]);

  const buildNumbers = useMemo(() => [...new Set(builds.map((b) => b.number))], [builds]);
  const latest = buildNumbers[buildNumbers.length - 1];
  const [text, setText] = useState("");
  const [foundIn, setFoundIn] = useState<string>("");
  const [sectionId, setSectionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ids = { text: useId(), build: useId(), section: useId(), error: useId() };

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    const build = Number(foundIn !== "" ? foundIn : latest);
    const report = useTestingStore.getState().addReport({
      text,
      foundInBuild: build,
      ...(sectionId !== "" ? { sectionId } : {}),
    });
    if (report === null) {
      setError(t({ id: "output.testing.reports.error", message: "Describe the problem (up to 2000 characters)." }));
      return;
    }
    setError(null);
    setText("");
    setSectionId("");
  };

  const openSection = (stepId: string) => {
    jumpToLocation({ route: "survey", step: stepId as ActiveStepId }, { returnTo: { route: "output" } });
  };

  const setStatus = (reportId: string, status: "open" | "fixed") => {
    useTestingStore.getState().setReportStatus(reportId, status, useDecisionLogStore.getState().record.entries.length);
  };

  return (
    <section
      aria-label={t({ id: "output.testing.reports.regionLabel", message: "Tester reports" })}
      data-testid="tester-reports"
      style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}
    >
      <h3 style={{ margin: 0, fontSize: 13 }}>
        <Trans id="output.testing.reports.heading">What testers reported</Trans>
      </h3>
      {!frozen && (
        <form onSubmit={add} style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: "46ch" }}>
          <label htmlFor={ids.text} style={{ fontSize: 12 }}>
            <Trans id="output.testing.reports.text">Problem reported</Trans>
          </label>
          <textarea
            id={ids.text}
            data-testid="report-text"
            value={text}
            maxLength={REPORT_TEXT_MAX}
            rows={2}
            aria-invalid={error !== null}
            aria-describedby={error !== null ? ids.error : undefined}
            onChange={(e) => setText(e.target.value)}
            style={{ fontFamily: "inherit", fontSize: 12 }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label htmlFor={ids.build} style={{ fontSize: 12 }}>
              <Trans id="output.testing.reports.build">Found in</Trans>
            </label>
            <select
              id={ids.build}
              data-testid="report-build"
              value={foundIn !== "" ? foundIn : String(latest ?? "")}
              onChange={(e) => setFoundIn(e.target.value)}
            >
              {buildNumbers.map((n) => (
                <option key={n} value={String(n)}>
                  {t({ id: "output.testing.reports.buildOption", message: `Build ${n}` })}
                </option>
              ))}
            </select>
            <label htmlFor={ids.section} style={{ fontSize: 12 }}>
              <Trans id="output.testing.reports.section">Section (optional)</Trans>
            </label>
            <select
              id={ids.section}
              data-testid="report-section"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
            >
              <option value="">{t({ id: "output.testing.reports.sectionNone", message: "Not sure" })}</option>
              {sections.map((s) => (
                <option key={s.stepId} value={s.stepId}>
                  {stageLabel(s.stepId, i18n)}
                </option>
              ))}
            </select>
          </div>
          {error !== null && (
            <span id={ids.error} role="alert" style={{ fontSize: 12, color: "var(--app-danger-text)" }}>
              {error}
            </span>
          )}
          <button
            type="submit"
            data-testid="report-add"
            style={{ alignSelf: "flex-start", padding: "4px 12px", border: `1px solid ${BORDER}`, borderRadius: 6, background: "transparent", color: ACCENT, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}
          >
            <Trans id="output.testing.reports.add">Add report</Trans>
          </button>
        </form>
      )}
      {reports.length > 0 && (
        <ul data-testid="report-list" style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}>
          {reports.map((report) => {
            const found = report.foundInBuild;
            const fixedIn = report.fixedInBuild;
            const where =
              report.status === "open"
                ? t({ id: "output.testing.reports.open", message: `Open · found in build ${found}` })
                : fixedIn !== undefined
                  ? t({ id: "output.testing.reports.fixedIn", message: `Found in build ${found} · fixed in build ${fixedIn}` })
                  : t({ id: "output.testing.reports.fixedPending", message: `Found in build ${found} · fixed, not yet in a build` });
            const section = report.sectionId;
            const sectionName = section !== undefined ? stageLabel(section, i18n) : "";
            return (
              <li key={report.reportId} data-testid={`report-${report.reportId}`}>
                <span>{report.text}</span>{" "}
                <span style={{ color: TEXT_DIM }}>({where})</span>
                {section !== undefined && (
                  <>
                    {" "}
                    <button
                      type="button"
                      data-testid={`report-open-${report.reportId}`}
                      onClick={() => openSection(section)}
                      style={LINK_STYLE}
                    >
                      {t({ id: "output.testing.reports.openSection", message: `Open ${sectionName}` })}
                    </button>
                  </>
                )}
                {!frozen && (
                  <>
                    {" "}
                    <button
                      type="button"
                      data-testid={`report-toggle-${report.reportId}`}
                      onClick={() => setStatus(report.reportId, report.status === "open" ? "fixed" : "open")}
                      style={LINK_STYLE}
                    >
                      {report.status === "open"
                        ? t({ id: "output.testing.reports.markFixed", message: "Mark fixed" })
                        : t({ id: "output.testing.reports.reopen", message: "Reopen" })}
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p style={{ margin: 0, fontSize: 11, color: TEXT_DIM }}>
        <Trans id="output.testing.reports.note">
          These are your own notes. Testers send their reports to you however they like.
        </Trans>
      </p>
    </section>
  );
}
