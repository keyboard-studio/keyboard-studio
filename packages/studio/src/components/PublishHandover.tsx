// PublishHandover — "Testing done, publish" (spec 094 FR-016, FR-017).
//
// Once a test build exists, the existing submit panel sits behind one confirm
// step. Opening it fingerprints the working copy (research R7) and says
// whether anything changed since the last test build, then lists the reports
// still open. Open reports inform; they never block (FR-016). The submit
// panel itself is passed through untouched (FR-017).
//
// With no test builds, or once the project is submitted, it renders its
// children directly, so the no-testing path is exactly as before.

import { useState, type ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { changedSectionsSince, useTestingStore } from "../stores/testingStore.ts";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { formatClauseList } from "../decisions/stageText.ts";
import { computeWorkingCopyFingerprint } from "../lib/workingCopyFingerprint.ts";
import { useChangedSectionName } from "./TestBuildPanel.tsx";
import { ACCENT, BORDER, TEXT_DIM } from "../ui/theme.ts";

export interface PublishHandoverProps {
  children: ReactNode;
  /** Injected in tests; defaults to the stable publish-projection fingerprint. */
  computeFingerprint?: () => Promise<string | null>;
}

type Check =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "checked"; changed: string[] | null; unknown: boolean };

const BUTTON_STYLE = {
  alignSelf: "flex-start",
  padding: "6px 14px",
  background: "transparent",
  border: `1px solid ${ACCENT}`,
  borderRadius: 6,
  color: ACCENT,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
} as const;

export function PublishHandover({
  children,
  computeFingerprint = computeWorkingCopyFingerprint,
}: PublishHandoverProps) {
  const { t, i18n } = useLingui();
  const sectionName = useChangedSectionName();
  const builds = useTestingStore((s) => s.builds);
  const reports = useTestingStore((s) => s.reports);
  const frozen = useTestingStore((s) => s.frozen);
  const last = builds[builds.length - 1];
  const [check, setCheck] = useState<Check>({ kind: "idle" });
  // The confirm belongs to the build it was given against: a newer build asks again.
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const [checkedFor, setCheckedFor] = useState<string | null>(null);

  if (last === undefined || frozen || confirmedFor === last.buildId) return <>{children}</>;

  const current = checkedFor === last.buildId ? check : ({ kind: "idle" } as const);
  const n = last.number;
  const openReports = reports.filter((r) => r.status === "open");

  const runCheck = async () => {
    const build = last;
    setCheckedFor(build.buildId);
    setCheck({ kind: "checking" });
    let fingerprint: string | null = null;
    try {
      fingerprint = await computeFingerprint();
    } catch {
      fingerprint = null;
    }
    if (fingerprint === null) {
      setCheck({ kind: "checked", changed: null, unknown: true });
      return;
    }
    const filesChanged = fingerprint !== build.fingerprint;
    const entries = useDecisionLogStore.getState().record.entries;
    setCheck({
      kind: "checked",
      changed: filesChanged ? changedSectionsSince(entries, build.decisionCursor, true) : [],
      unknown: false,
    });
  };

  let changesText = "";
  if (current.kind === "checking") {
    changesText = t({ id: "output.publishHandover.checking", message: "Checking for changes since the last test build..." });
  } else if (current.kind === "checked") {
    if (current.unknown || current.changed === null) {
      changesText = t({
        id: "output.publishHandover.unknown",
        message: `Could not compare the keyboard with test build ${n}.`,
      });
    } else if (current.changed.length === 0) {
      changesText = t({
        id: "output.publishHandover.unchanged",
        message: `No changes since test build ${n}. You are publishing what your testers tried.`,
      });
    } else {
      const sections = formatClauseList(current.changed.map(sectionName), i18n);
      changesText = t({
        id: "output.publishHandover.changed",
        message: `Changed since test build ${n}: ${sections}. Testers have not tried these changes.`,
      });
    }
  }

  return (
    <section
      aria-label={t({ id: "output.publishHandover.regionLabel", message: "Publish after testing" })}
      data-testid="publish-handover"
      style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}
    >
      {current.kind === "idle" ? (
        <button
          type="button"
          data-testid="publish-handover-open"
          onClick={() => void runCheck()}
          style={BUTTON_STYLE}
        >
          <Trans id="output.publishHandover.open">Testing done, publish</Trans>
        </button>
      ) : (
        <h3 style={{ margin: 0, fontSize: 13 }}>
          <Trans id="output.publishHandover.heading">Before you publish</Trans>
        </h3>
      )}
      <span
        role="status"
        aria-live="polite"
        data-testid="publish-handover-changes"
        style={{ fontSize: 12, maxWidth: "46ch" }}
      >
        {changesText}
      </span>
      {current.kind === "checked" && (
        <>
          {openReports.length > 0 ? (
            <>
              <p style={{ margin: 0, fontSize: 12 }}>
                {t({
                  id: "output.publishHandover.openReports",
                  message: "Reports still open. You can publish anyway.",
                })}
              </p>
              <ul
                data-testid="publish-handover-reports"
                style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}
              >
                {openReports.map((report) => {
                  const found = report.foundInBuild;
                  return (
                    <li key={report.reportId}>
                      {report.text}{" "}
                      <span style={{ color: TEXT_DIM }}>
                        ({t({ id: "output.publishHandover.foundIn", message: `found in build ${found}` })})
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM }}>
              <Trans id="output.publishHandover.noOpenReports">No open reports.</Trans>
            </p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              data-testid="publish-handover-confirm"
              onClick={() => setConfirmedFor(last.buildId)}
              style={BUTTON_STYLE}
            >
              <Trans id="output.publishHandover.confirm">Continue to submit</Trans>
            </button>
            <button
              type="button"
              data-testid="publish-handover-cancel"
              onClick={() => setCheck({ kind: "idle" })}
              style={{ ...BUTTON_STYLE, border: `1px solid ${BORDER}`, color: TEXT_DIM }}
            >
              <Trans id="output.publishHandover.cancel">Not yet</Trans>
            </button>
          </div>
        </>
      )}
    </section>
  );
}
