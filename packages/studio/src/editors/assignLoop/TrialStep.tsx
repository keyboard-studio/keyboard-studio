// TrialStep — Trial step host (spec 113, #2540).
//
// Try the keyboard and get it to testers: the test-build, tester-report
// and revise-and-return parts of spec 094 that used to sit inside the
// Output screen, moved here unchanged. Optional — Continue to Publish is
// always available; with no test builds yet the step shows a nudge, never
// a gate.
//
// The one gate on this step is the coverage gate: an author who reached
// Trial through the `#output` side door has not passed the Phase F `help`
// gate, so Continue is disabled while characters are still unimplemented
// (the same refusal shape as `help`). The banner's "Go finish them now"
// is the way forward. Emission stays blocked regardless — the test-build
// button shares the same `outputBlockers()` gate.
//
// On Continue passes `{ buildsAtCompletion }` via onComplete (recorded in
// the decision audit; the builds and reports themselves live in the
// testingStore slice of the draft envelope).

import { useId } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { usePreviewArtifact } from "../../hooks/usePreviewArtifact.ts";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";
import { outputBlockers } from "../../lib/outputBlockers.ts";
import { useTestingStore } from "../../stores/testingStore.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { TOUCH_STEP_ID } from "../../steps/reducer.ts";
import type { EditorStepProps } from "../../steps/types.ts";
import { OutputSectionList } from "../../components/OutputSectionList.tsx";
import { TestBuildPanel } from "../../components/TestBuildPanel.tsx";
import { OutputGateBanners } from "../../components/OutputGateBanners.tsx";
import { SourceDownloads } from "../../components/output/SourceDownloads.tsx";
import { ReformatConsentDialog } from "../../components/ReformatConsentDialog.tsx";
import { resolveOutputKeyboardId } from "../../lib/outputKeyboardId.ts";

export function TrialStep({ onComplete, onBack }: EditorStepProps) {
  const { t, i18n } = useLingui();
  // Each step runs its own independent artifact pipeline — see
  // usePreviewArtifact.ts's module comment for why this is deliberate (do
  // not "dedupe" across steps). The Zustand working-copy store persists
  // across step changes, so the pipeline reads the settled store.
  const artifact = usePreviewArtifact();
  const builds = useTestingStore((s) => s.builds);

  const {
    startKeyboard,
    coverageGate,
    attributionMissing,
    licenseUnparseable,
    resolveStartHolder,
  } = artifact;
  const staleSteps = useWorkingCopyStore((s) => s.staleSteps);
  const touchStale = staleSteps.has(TOUCH_STEP_ID);

  // spec 094 C6: one ordered blocker list feeds the test-build button's
  // accessible name and the banners' "Open" controls, so they cannot
  // disagree.
  const gateInput = {
    touchStale,
    coverageBlocked: coverageGate.blocked,
    licenseUnparseable: licenseUnparseable !== null,
    attributionMissing,
    stageReady: artifact.stage.kind === "ready" && startKeyboard !== null,
  };
  const outputGate = outputBlockers(gateInput);
  const blockerStepId = (kind: "touchStale" | "attribution"): string | undefined =>
    outputGate.blockers.find((b) => b.kind === kind)?.stepId;
  // Narrowed into consts (not re-called inline) so the conditional spreads
  // below carry `string`, never `string | undefined`, under
  // exactOptionalPropertyTypes.
  const touchBlockerStep = blockerStepId("touchStale");
  // The source .zip and LDML sit behind the release gate, as on Publish.
  const identity = useWorkingCopyStore((s) => s.identity);
  const downloadKeyboardId = resolveOutputKeyboardId(identity, startKeyboard);
  const firstBlocker = outputGate.blockers[0];
  const downloadGatedAria =
    outputGate.blocked && firstBlocker !== undefined ? i18n.t(firstBlocker.downloadAria) : null;
  const attributionBlockerStep = blockerStepId("attribution");

  // The coverage gate disables Continue (see the module comment). The hint
  // is a mounted element only while blocked, so ariaDescribedBy is passed
  // only then (usePublishStepNav's rule).
  const blockedHintId = useId();
  const continueBlocked = coverageGate.blocked;
  usePublishStepNav({
    ...(onBack !== undefined
      ? {
          back: {
            label: t({ id: "editor.assignLoop.trial.back", message: "Back" }),
            onClick: onBack,
            testId: "trial-back",
          },
        }
      : {}),
    forward: {
      label: t({ id: "editor.assignLoop.trial.continue", message: "Continue" }),
      onClick: () => {
        onComplete({ buildsAtCompletion: builds.length });
      },
      testId: "trial-continue",
      ...(continueBlocked
        ? { disabled: true, ariaDescribedBy: blockedHintId }
        : {}),
    },
  });

  return (
    <div
      data-testid="trial-step-root"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 24,
        boxSizing: "border-box",
        maxWidth: 860,
        background: "var(--app-bg)",
        color: "var(--app-text)",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <h1 style={{ margin: 0, fontSize: "1.3rem", color: "var(--app-accent-text)" }}>
        <Trans id="trial.heading">Trial</Trans>
      </h1>
      <p style={{ margin: 0, color: "var(--app-text-subtle)", fontSize: 13 }}>
        <Trans id="trial.intro">
          Try the keyboard out before you publish it: make numbered test
          builds for your testers, read their reports, and revise any
          section — then come back here.
        </Trans>
      </p>
      {/* Nudge, never a gate (ruling §2): with no test builds yet, suggest
          one — the author can still Continue straight to Publish. */}
      {builds.length === 0 && (
        <p
          role="status"
          style={{ margin: 0, fontSize: 12, color: "var(--app-text-muted)", lineHeight: 1.5 }}
        >
          <Trans id="trial.nudge.noBuilds">
            No test builds yet. Consider making one below so testers can try
            the keyboard before you publish — or Continue to Publish when
            you&apos;re ready.
          </Trans>
        </p>
      )}
      {continueBlocked && (
        <p
          id={blockedHintId}
          role="status"
          style={{ margin: 0, fontSize: 12, color: "var(--app-text-muted)", lineHeight: 1.5 }}
        >
          <Trans id="trial.continueBlocked.hint">
            Finish every inventory character before continuing to Publish —
            use “Go finish them now” below.
          </Trans>
        </p>
      )}
      {/* spec 094 FR-001: revise any completed section and come back. */}
      <OutputSectionList />
      {/* spec 094 FR-006: a labelled, numbered build for testers, from the
          same working copy and behind the same gates as the package. */}
      <TestBuildPanel
        gate={gateInput}
        nextTestVersion={artifact.nextTestVersion}
        busy={artifact.buildingKmp || artifact.downloading || artifact.downloadingLdml}
        onMakeTestBuild={artifact.handleMakeTestBuild}
      />
      {/* Testers may want the source or the LDML alongside a test build. */}
      {startKeyboard !== null && (
        <SourceDownloads
          artifact={artifact}
          keyboardId={downloadKeyboardId}
          gatedAriaLabel={downloadGatedAria}
        />
      )}
      <OutputGateBanners
        returnToStep="trial"
        touchStale={touchStale}
        {...(touchBlockerStep !== undefined ? { touchBlockerStep } : {})}
        coverageGate={coverageGate}
        licenseUnparseable={licenseUnparseable}
        attributionMissing={attributionMissing}
        {...(attributionBlockerStep !== undefined ? { attributionBlockerStep } : {})}
        resolveStartHolder={resolveStartHolder}
      />
      <ReformatConsentDialog {...artifact.reformatConsent} />
    </div>
  );
}
