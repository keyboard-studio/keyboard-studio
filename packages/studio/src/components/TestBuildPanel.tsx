// TestBuildPanel — "Make a test build" and the list of builds made (spec 094
// FR-006..FR-009, FR-011).
//
// The button shares the installable download's gates exactly (one
// outputBlockers() call), plus the one blocker only a test build has: a
// version with no room for a test version below the publish version (R1).
// Builds are numbered, listed with what changed since the previous one, and
// read-only once the project is submitted.

import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { outputBlockers, type OutputBlockersInput } from "../lib/outputBlockers.ts";
import { collidingBuildNumbers, useTestingStore } from "../stores/testingStore.ts";
import type { TestBuild } from "../lib/draftTypes.ts";
import { stageLabel } from "../decisions/progressDots.ts";
import { formatClauseList } from "../decisions/stageText.ts";
import { ACCENT, BORDER, TEXT_DIM } from "../ui/theme.ts";
import { TesterReports } from "./TesterReports.tsx";

export interface TestBuildPanelProps {
  /** The download gates, exactly as the installable download sees them. */
  gate: Omit<OutputBlockersInput, "testVersionUnsupported">;
  /** The next build's version, or null when none fits (research R1). */
  nextTestVersion: string | null;
  /** A download or build is already in flight. */
  busy: boolean;
  onMakeTestBuild: () => Promise<TestBuild | null>;
}

/** A changed section's display name; `"source"` is a direct `.kmn` edit (research R7). */
export function useChangedSectionName(): (id: string) => string {
  const { t, i18n } = useLingui();
  return (id) =>
    id === "source"
      ? t({ id: "output.testing.changed.source", message: "Source edited directly" })
      : stageLabel(id, i18n);
}

export function TestBuildPanel({ gate, nextTestVersion, busy, onMakeTestBuild }: TestBuildPanelProps) {
  const { t, i18n } = useLingui();
  const sectionName = useChangedSectionName();
  const builds = useTestingStore((s) => s.builds);
  const nextNumber = useTestingStore((s) => s.nextBuildNumber);
  const frozen = useTestingStore((s) => s.frozen);
  const [status, setStatus] = useState<string | null>(null);

  const blockers = outputBlockers({ ...gate, testVersionUnsupported: nextTestVersion === null });
  const firstBlocker = blockers.blockers[0];
  const enabled = !frozen && !busy && !blockers.testBuildBlocked;
  const colliding = collidingBuildNumbers(builds);

  const version = nextTestVersion ?? "";
  const buttonLabel =
    firstBlocker !== undefined
      ? i18n.t(firstBlocker.downloadAria)
      : t({
          id: "output.testing.make.ariaLabel",
          message: `Make test build ${nextNumber}, version ${version}, and download it`,
        });

  const changedText = (build: TestBuild): string => {
    if (build.identicalTo !== undefined) {
      const n = build.identicalTo;
      return t({ id: "output.testing.changed.same", message: `Same as build ${n}` });
    }
    if (build.changedSections.length === 0) {
      return t({ id: "output.testing.changed.first", message: "First build" });
    }
    const sections = formatClauseList(build.changedSections.map(sectionName), i18n);
    return t({ id: "output.testing.changed.sections", message: `Changed: ${sections}` });
  };

  const make = async () => {
    setStatus(null);
    const build = await onMakeTestBuild();
    if (build !== null) {
      const n = build.number;
      setStatus(t({ id: "output.testing.made", message: `Test build ${n} downloaded.` }));
    }
  };

  return (
    <section
      aria-label={t({ id: "output.testing.regionLabel", message: "Test builds" })}
      data-testid="test-build-panel"
      style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}
    >
      <button
        type="button"
        data-testid="make-test-build"
        disabled={!enabled}
        aria-label={buttonLabel}
        onClick={() => void make()}
        style={{
          alignSelf: "flex-start",
          padding: "8px 16px",
          background: "transparent",
          border: `1px solid ${enabled ? ACCENT : BORDER}`,
          borderRadius: 6,
          color: enabled ? ACCENT : "var(--app-text-disabled)",
          fontSize: 13,
          cursor: enabled ? "pointer" : "not-allowed",
          fontFamily: "inherit",
        }}
      >
        <Trans id="output.testing.make">Make a test build</Trans>
      </button>
      <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, maxWidth: "46ch" }}>
        {frozen ? (
          <Trans id="output.testing.frozen">
            This keyboard has been submitted, so its test builds are read-only.
          </Trans>
        ) : (
          <Trans id="output.testing.help">
            An installable package labelled with its build number, to share with testers before you
            publish.
          </Trans>
        )}
      </p>
      {builds.length > 0 && (
        <ol
          aria-label={t({ id: "output.testing.list.label", message: "Test builds made" })}
          data-testid="test-build-list"
          style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}
        >
          {builds.map((build) => {
            const n = build.number;
            const version = build.version;
            const when = i18n.date(new Date(build.createdAt), { dateStyle: "medium", timeStyle: "short" });
            return (
              <li key={build.buildId} data-testid={`test-build-${build.buildId}`}>
                <span style={{ fontWeight: 600 }}>
                  {t({ id: "output.testing.list.item", message: `Build ${n} (version ${version})` })}
                </span>{" "}
                <span style={{ color: TEXT_DIM }}>
                  {when} · {changedText(build)}
                </span>
                {colliding.has(build.number) && (
                  <span style={{ color: "var(--app-warning-text)" }}>
                    {" "}
                    {t({
                      id: "output.testing.list.collision",
                      message: `[WARN] Another build ${n} was made on a different device before they synced.`,
                    })}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <span role="status" aria-live="polite" style={{ fontSize: 12, color: TEXT_DIM }}>
        {status}
      </span>
      {/* spec 094 FR-012: reports attach to a build, so they appear once one exists. */}
      {builds.length > 0 && <TesterReports />}
    </section>
  );
}
