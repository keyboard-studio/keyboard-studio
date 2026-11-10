// PublishStep — Publish step host (spec 113, #2540).
//
// Get the finished keyboard out: the release checks, final downloads
// (.kmp / source .zip / LDML) and the managed GitHub PR that used to sit
// inside the Output screen, moved here unchanged. The "just download it"
// author ends up here, downloads, and never touches the PR panel.
//
// The step also hosts the Output screen's left-pane tools, which had no
// other home: the keyboard-details section (identity panel, "Change
// starting keyboard", advanced .kmn editor).
//
// Gates are unchanged from the Output screen: the downloads and the PR
// submit share the release gate (`outputBlockers().blocked`); criteria,
// documentation findings, unmapped findings, unapplied repairs and the
// documentation checklist are informational only and gate nothing. The
// Open ratchet keeps gating the update PR exactly as before.
//
// On Finish passes `{ submitted }` via onComplete — whether the project
// was submitted (testingStore `frozen`) at completion.

import { useMemo } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { usePreviewArtifact } from "../../hooks/usePreviewArtifact.ts";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";
import { useDocsPreview } from "../../hooks/useDocsPreview.ts";
import { useDocumentationFindings } from "../../hooks/useDocumentationFindings.ts";
import { useAuthoredCriteria } from "../../hooks/useAuthoredCriteria.ts";
import { useOpenRatchet } from "../../hooks/useOpenRatchet.ts";
import { useGitHubAuth } from "../../hooks/useGitHubAuth.ts";
import { useGoogleAuth } from "../../hooks/useGoogleAuth.ts";
import { useRouteStepIds } from "../../lib/routeStepIds.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { useTestingStore } from "../../stores/testingStore.ts";
import { navigateTo } from "../../lib/navigate.ts";
import { resolveOutputKeyboardId } from "../../lib/outputKeyboardId.ts";
import { outputBlockers } from "../../lib/outputBlockers.ts";
import { buildReviewInput } from "../../criteria/openPrBlocks.ts";
import { isLdmlLintCode } from "../../lint/ldmlFindings.ts";
import { selectUnmappedFindings } from "../../lint/lintToQuestion.ts";
import { TOUCH_STEP_ID } from "../../steps/reducer.ts";
import type { EditorStepProps } from "../../steps/types.ts";
import { OutputGateBanners } from "../../components/OutputGateBanners.tsx";
import { SourceDownloads } from "../../components/output/SourceDownloads.tsx";
import { DocumentationFindingsSummary } from "../../components/DocumentationFindingsSummary.tsx";
import { UnappliedRepairList } from "../../components/TouchKeyIdentityList.tsx";
import { LintSummary } from "../../lint/LintSummary.tsx";
import { DocumentationChecklist } from "../../components/DocumentationChecklist.tsx";
import { PublishHandover } from "../../components/PublishHandover.tsx";
import { ManagedPRSubmitPanel } from "../../components/ManagedPRSubmitPanel.tsx";
import { SignUpPanel } from "../../components/SignUpPanel.tsx";
import { TrackOneIdentityPanel } from "../../editors/panels/TrackOneIdentityPanel.tsx";
import { AdvancedKmnEditor } from "../../components/AdvancedKmnEditor.tsx";
import { ReformatConsentDialog } from "../../components/ReformatConsentDialog.tsx";
import { usePrefersReducedMotion } from "../../ui/motion.ts";

// Cap the package-failure diagnostic list. A dangling asset reference can
// produce a long run of near-identical messages, and a banner that pushes
// the still-working .zip button off screen would turn a recoverable failure
// into a dead end. The full set is in the console via devLog.
const KMP_DIAGNOSTIC_LIMIT = 5;

const warningBannerStyle: React.CSSProperties = {
  marginTop: 4,
  padding: "8px 12px",
  background: "var(--app-warning-bg)",
  border: "1px solid var(--app-warning-border)",
  borderRadius: 6,
  fontSize: 12,
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

export function PublishStep({ onComplete, onBack }: EditorStepProps) {
  const { t, i18n } = useLingui();
  const reducedMotion = usePrefersReducedMotion();
  // Each step runs its own independent artifact pipeline — see
  // usePreviewArtifact.ts's module comment for why this is deliberate (do
  // not "dedupe" across steps). The Zustand working-copy store persists
  // across step changes, so the pipeline reads the settled store.
  const artifact = usePreviewArtifact();
  const frozen = useTestingStore((s) => s.frozen);
  // Spec 084: the criteria summary card's counts. Judged off THIS step's
  // own artifact stage (the shared useAuthoredCriteria assembly) — no
  // second pipeline instance, and the card is informational only: like
  // DocumentationChecklist it never gates download or submit.
  const criteriaResult = useAuthoredCriteria(artifact.stage);
  // Open (spec 111): the ratchet over this same result. Null on Copy.
  const openRatchet = useOpenRatchet(criteriaResult, artifact.stage.kind === "error");
  // spec 102 FR-034: the checklist says when the inherited docs made the
  // generated typing guide redundant. A memoised derivation, no timer (D3).
  const docsPreview = useDocsPreview();
  // Issue #2145 (warnings-placement model): hygiene accumulates here. The
  // documentation findings render with the checklist below (grouped
  // authored vs inherited inside DocumentationFindingsSummary), and the
  // remaining unmapped findings — the ones with no owning question — render
  // as a plain summary. KM_WARN_* infrastructure findings are never
  // author-facing, and error-severity findings stay with the Output gate
  // and the NavBar outputBlocked treatment, so both are filtered out here.
  // Informational only: like the checklist, none of this gates download.
  const documentationFindings = useDocumentationFindings();
  const publishedFindings = useWorkingCopyStore((s) => s.validatorFindings);
  const route = useRouteStepIds();
  // spec 108 FR-015: every LDML finding is listed with the LDML download
  // (SourceDownloads), so the generic panel below excludes them and no
  // finding appears twice on this page.
  const otherOutputFindings = useMemo(() => {
    const docCodes = new Set(documentationFindings.map((f) => f.code));
    return selectUnmappedFindings(publishedFindings, route).filter(
      (f) =>
        !docCodes.has(f.code) &&
        !isLdmlLintCode(f.code) &&
        !f.code.startsWith("KM_WARN") &&
        f.severity !== "error",
    );
  }, [publishedFindings, documentationFindings, route]);

  const {
    startKeyboard,
    canDownload,
    downloading,
    buildingKmp,
    kmpError,
    kmpDiagnostics,
    handleDownloadKmp,
    downloadingLdml,
    coverageGate,
    showIdentityWarn,
    // spec 064: the two attribution hard-blocks and the D5 escape hatch.
    attributionMissing,
    licenseUnparseable,
    resolveStartHolder,
  } = artifact;

  // Identity prefill for the Option B submit form. Read from whichever auth
  // provider is active. GitHub: login name (no email — only user:email scope
  // was requested at sign-up, and that is not surfaced in the SPA). Google:
  // name + email from the stored identity claims.
  const { login: ghLogin } = useGitHubAuth();
  const { identity: googleIdentity } = useGoogleAuth();

  // Author-chosen keyboard identity (TrackOneIdentityPanel writes it). The
  // single source for the download control's announced id — see
  // downloadKeyboardId below.
  const identity = useWorkingCopyStore((s) => s.identity);
  const startLicenseText = useWorkingCopyStore((s) => s.startLicenseText);
  const startIr = useWorkingCopyStore((s) => s.startIr);

  // Output-time staleness gate. staleSteps.has(TOUCH_STEP_ID) already implies
  // the touch step was completed (a touchLayoutJson side-car was written) and
  // has since been re-opened by a downstream mechanics edit (see
  // MechanismGallery.handleUnlock) — so the emitted side-car would be stale.
  // Refuse both output surfaces (zip download, managed-PR submit) rather than
  // silently ship a stale on-screen-keyboard layout.
  const staleSteps = useWorkingCopyStore((s) => s.staleSteps);
  const touchStale = staleSteps.has(TOUCH_STEP_ID);

  // Derive prefill: Google identity takes precedence (has both name + email).
  // GitHub provides only the login handle as a name hint.
  const submitPrefill: { displayName?: string; email?: string } =
    googleIdentity !== null
      ? { displayName: googleIdentity.name, email: googleIdentity.email }
      : ghLogin !== null
        ? { displayName: ghLogin }
        : {};

  // Criteria card counts line — the SAME message the criteria page's own
  // summary header renders (criteria.summary.resolved), so the card and
  // the page can never state two different verdicts. Computed only when a
  // result exists; the card states the pending case separately below.
  const resolved = criteriaResult?.resolvedCount;
  const total = criteriaResult?.total;
  const criteriaCountsLine =
    resolved !== undefined && total !== undefined
      ? t({
          id: "criteria.summary.resolved",
          message: `${resolved} of ${total} criteria resolved`,
        })
      : null;

  // Download button aria-label — computed unconditionally (cheap) so the JSX
  // below stays a single conditional, not a nested t()-per-branch call site.
  //
  // The id MUST come from the same place the emitted filename does, and the way
  // it does so is by calling the same function — `resolveOutputKeyboardId`, which
  // `projectWorkingCopyForOutput` also calls for the `<id>-<version>.zip` name.
  const downloadKeyboardId = resolveOutputKeyboardId(identity, startKeyboard);
  // spec 094 C6: one ordered blocker list feeds the download aria-labels, the
  // action flags and the PR panel's reason, so they cannot disagree.
  const gateInput = {
    touchStale,
    coverageBlocked: coverageGate.blocked,
    licenseUnparseable: licenseUnparseable !== null,
    attributionMissing,
    stageReady: artifact.stage.kind === "ready" && startKeyboard !== null,
  };
  const outputGate = outputBlockers(gateInput);
  const firstBlocker = outputGate.blockers[0];
  const downloadAriaLabel = firstBlocker !== undefined
    ? i18n.t(firstBlocker.downloadAria)
    : t({
        id: "output.download.aria.ready",
        message: `Download keyboard ${downloadKeyboardId} as zip`,
      });
  // The first blocker the PR panel itself does not already explain ("compile
  // not complete" is its own text). Before C6 an attribution or licence block
  // fell through to that text.
  const submitBlocker = outputGate.blockers.find((b) => b.reason !== undefined);
  const blockerStepId = (kind: "touchStale" | "attribution"): string | undefined =>
    outputGate.blockers.find((b) => b.kind === kind)?.stepId;
  // Narrowed into consts (not re-called inline) so the conditional spreads
  // below carry `string`, never `string | undefined`, under
  // exactOptionalPropertyTypes.
  const touchBlockerStep = blockerStepId("touchStale");
  const attributionBlockerStep = blockerStepId("attribution");

  // The .kmp shares every gate with the .zip, so it reuses the same
  // unavailability reasons and only differs in the ready case.
  const kmpAriaLabel = !outputGate.blocked
    ? t({
        id: "output.download.aria.kmp",
        message: `Download keyboard ${downloadKeyboardId} as an installable Keyman package`,
      })
    : downloadAriaLabel;

  // Both buttons disable while EITHER download is in flight: they share one
  // projection + compile, so overlapping clicks would do the same work twice.
  // The LDML export (spec 108) is a third download and joins the same busy state.
  const kmpActionable = !outputGate.blocked && !buildingKmp && !downloading && !downloadingLdml;

  // "Change starting keyboard" — relocates re-basing to the survey's choose_base
  // step rather than mutating the working copy from here. A BACK action (see
  // backToChooseStart's docstring for why an advance() would corrupt the
  // history stack), and it deliberately mutates nothing itself: the rebase
  // question is answered at the destination by the existing confirmRebaseTo
  // gate, which also no-ops when the author re-picks the same base.
  const sessionBackToChooseStart = useSurveySessionStore((s) => s.backToChooseStart);
  const handleChangeStart = () => {
    sessionBackToChooseStart();
    navigateTo("survey");
  };

  usePublishStepNav({
    ...(onBack !== undefined
      ? {
          back: {
            label: t({ id: "editor.assignLoop.publish.back", message: "Back" }),
            onClick: onBack,
            testId: "publish-back",
          },
        }
      : {}),
    forward: {
      label: t({ id: "editor.assignLoop.publish.finish", message: "Finish" }),
      onClick: () => {
        onComplete({ submitted: frozen });
      },
      testId: "publish-finish",
    },
  });

  return (
    <div
      data-testid="publish-step-root"
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
        <Trans id="publish.heading">Publish</Trans>
      </h1>
      <p style={{ margin: 0, color: "var(--app-text-subtle)", fontSize: 13 }}>
        <Trans id="publish.intro">
          Submit your finished keyboard for publication through GitHub, or
          download it to install and share yourself.
        </Trans>
      </p>
      {startKeyboard !== null && (
        <>
          <OutputGateBanners
            returnToStep="publish"
            touchStale={touchStale}
            {...(touchBlockerStep !== undefined ? { touchBlockerStep } : {})}
            coverageGate={coverageGate}
            licenseUnparseable={licenseUnparseable}
            startLicenseText={startLicenseText}
            startIr={startIr}
            attributionMissing={attributionMissing}
            {...(attributionBlockerStep !== undefined ? { attributionBlockerStep } : {})}
            resolveStartHolder={resolveStartHolder}
          />
          {/* Option B (org-mediated PR) submit — PRIMARY submit action per
              docs/github-integration.md §1a. Calls the backend proxy; the
              user never sees a branch or PR workflow. Gated on canDownload
              (compile ready + working copy instantiated + inventory
              coverage — same P0 gate as the zip download), plus the
              touchStale/coverageBlocked flags below purely for the
              explanatory aria-label (canSubmit already forbids the
              emission either way). Attribution prefill from whichever
              identity provider is active. */}
          {/* spec 094 FR-016: after test builds, one "Testing done, publish"
              step says what changed since the last build and lists open
              reports before the unchanged submit panel appears. */}
          <PublishHandover>
            <ManagedPRSubmitPanel
              canSubmit={canDownload}
              outputBlocked={submitBlocker !== undefined}
              {...(submitBlocker?.reason !== undefined ? { outputBlockedReason: i18n.t(submitBlocker.reason) } : {})}
              prefill={submitPrefill}
              openRatchet={
                openRatchet !== null && criteriaResult !== null
                  ? {
                      gate: openRatchet.gate,
                      review: buildReviewInput(
                        criteriaResult,
                        openRatchet.baseline,
                        openRatchet.notes,
                      ),
                    }
                  : null
              }
              lintResults={{
                criteria:
                  criteriaResult?.rows.map((r) => ({
                    criterion: r.criterion,
                    status: r.status,
                  })) ?? null,
                findings: publishedFindings,
              }}
            />
          </PublishHandover>

          {/* Decoupled "Sign up with GitHub / Google" identity step (docs/github-integration.md
              §1a). Establishes who the user is — NOT a submit/PR action, and not
              gated on artifact readiness (you can sign up any time). */}
          <SignUpPanel />
          {/* Downloads come second: Publish points the author at submission. */}
          <h2 style={{ margin: "16px 0 0", fontSize: "1rem", color: "var(--app-text)" }}>
            <Trans id="publish.downloads.heading">Download</Trans>
          </h2>
          {/* PRIMARY download: the installable package. A user double-clicks
              this and the keyboard installs on Keyman for Windows, macOS,
              Linux, iOS, or Android — no Keyman Developer, no unzipping, no
              compile step. The source .zip below is for editing and
              contributing, which is a different (and rarer) need. */}
          <button
            type="button"
            data-testid="emit-download-kmp"
            disabled={!kmpActionable}
            onClick={() => { void handleDownloadKmp(); }}
            aria-label={kmpAriaLabel}
            style={{
              alignSelf: "flex-start",
              marginTop: 4,
              padding: "9px 18px",
              background: kmpActionable ? "var(--app-accent)" : "var(--app-surface)",
              color: kmpActionable ? "var(--app-text-on-accent)" : "var(--app-text-disabled)",
              border: "1px solid var(--app-border)",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: kmpActionable ? "pointer" : "not-allowed",
              fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
            }}
          >
            {buildingKmp ? (
              <Trans id="output.download.button.kmpBuilding">Building package...</Trans>
            ) : (
              <Trans id="output.download.button.kmp">Download keyboard (.kmp)</Trans>
            )}
          </button>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: "var(--app-text-muted)",
              lineHeight: 1.5,
              maxWidth: "46ch",
            }}
          >
            <Trans id="output.download.kmp.help">
              Install it by double-clicking the downloaded file. Works with Keyman
              on Windows, macOS, Linux, Android, and iOS.
            </Trans>
          </p>

          {/* Failed package build: say why, and leave the .zip working. */}
          {kmpError !== null && (
            <div
              role="alert"
              data-testid="emit-download-kmp-error"
              style={{
                ...warningBannerStyle,
                color: "var(--app-danger-text)",
                borderColor: "var(--app-danger)",
                lineHeight: 1.5,
              }}
            >
              {"[ERROR] "}
              {kmpError}
              {kmpDiagnostics.length > 0 && (
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {kmpDiagnostics.slice(0, KMP_DIAGNOSTIC_LIMIT).map((d, i) => (
                    <li key={`${d.code}-${i}`} style={{ fontFamily: "monospace", fontSize: 11 }}>
                      {d.code}: {d.message}
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ marginTop: 6, color: "var(--app-text-subtle)" }}>
                <Trans id="output.download.kmp.error.zipStillAvailable">
                  You can still download the source .zip below.
                </Trans>
              </div>
            </div>
          )}

          {/* SECONDARY downloads: source .zip and LDML (shared with Trial). */}
          <SourceDownloads
            artifact={artifact}
            keyboardId={downloadKeyboardId}
            gatedAriaLabel={outputGate.blocked ? downloadAriaLabel : null}
          />
          {showIdentityWarn && (
            <div
              role="status"
              aria-live="polite"
              style={{ fontSize: 12, color: "var(--app-warning-text)", marginTop: 4 }}
            >
              {"[WARN] "}
              <Trans id="output.identity.copiedWarn">
                Your keyboard id is still set to the copied keyboard&rsquo;s
                id. Downloading now will name the .zip and its internal
                file paths after the copied keyboard&rsquo;s id. Set your own keyboard name
                and id before downloading or submitting to the community
                repository.
              </Trans>{" "}
              <button
                type="button"
                aria-label={t({
                  id: "output.identity.warn.gotoAriaLabel",
                  message: "Go to the keyboard name and id step",
                })}
                onClick={() => {
                  const el = document.getElementById("identity-keyboard-id");
                  el?.scrollIntoView({
                    behavior: reducedMotion ? "auto" : "smooth",
                    block: "center",
                  });
                  (el as HTMLInputElement | null)?.focus();
                }}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "var(--app-warning-text)",
                  textDecoration: "underline",
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                <Trans id="output.identity.warn.gotoLabel">Go to name &amp; id</Trans>
              </button>
            </div>
          )}
          {/* Issue #2145: the accumulated hygiene set lives here, with
              the documentation surfaces below — documentation findings
              grouped authored vs inherited, then any other unmapped
              findings. Informational only; gates nothing. */}
          {documentationFindings.length > 0 && (
            <section
              aria-label={t({ id: "output.docFindings.regionAriaLabel", message: "Documentation notes" })}
              data-testid="output-doc-findings"
              style={{ marginTop: 10 }}
            >
              <DocumentationFindingsSummary findings={documentationFindings} />
            </section>
          )}
          {otherOutputFindings.length > 0 && (
            <section
              aria-label={t({ id: "output.otherFindings.regionAriaLabel", message: "Other findings" })}
              data-testid="output-other-findings"
              style={{ marginTop: 10 }}
            >
              <LintSummary findings={otherOutputFindings} />
            </section>
          )}

          {/* Spec 104 FR-015 (clarify ruling): a repair list never
              visited downloads with its repairs UNAPPLIED — the
              unapplied repairs are recorded as unvisited on the project
              and listed here. Informational only; gates nothing, and
              reaching this step never applies a repair. */}
          <UnappliedRepairList
            vfs={artifact.stage.kind === "ready" ? artifact.stage.vfs : null}
            keyboardId={artifact.stage.kind === "ready" ? artifact.stage.keyboardId : null}
          />

          {/* spec 080 FR-017: what documentation ships and where each file's
              content came from. Informational only — reads state, gates
              nothing (FR-018); placeholder rows link back to the step that
              fills them. */}
          <DocumentationChecklist typingGuideSuppressed={docsPreview.typingGuideSuppressed} />

          {/* spec 084: criteria summary card — counts from the shared
              authored result over this step's own stage, plus the way
              to the full page. Informational only, like the checklist
              above: it reads state and gates nothing. */}
          <section
            aria-label={t({ id: "output.criteria.regionAriaLabel", message: "Criteria summary" })}
            data-testid="output-criteria-card"
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
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--app-text)" }}>
              <Trans id="output.criteria.title">Criteria</Trans>
            </div>
            {criteriaCountsLine === null ? (
              <p style={{ margin: "4px 0 0", color: "var(--app-text-muted)", lineHeight: 1.5 }}>
                <Trans id="output.criteria.pending">
                  Criteria will appear here once the keyboard has compiled.
                </Trans>
              </p>
            ) : (
              <>
                <p
                  data-testid="output-criteria-counts"
                  style={{ margin: "4px 0 8px", color: "var(--app-text-muted)", lineHeight: 1.5 }}
                >
                  {criteriaCountsLine}
                </p>
                <button
                  type="button"
                  data-testid="output-criteria-view"
                  onClick={() => navigateTo({ route: "criteria" })}
                  style={{
                    background: "none",
                    border: "1px solid var(--app-border)",
                    borderRadius: 6,
                    padding: "4px 10px",
                    color: "var(--app-text-subtle)",
                    cursor: "pointer",
                    fontSize: 12,
                    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
                  }}
                >
                  <Trans id="output.criteria.view">View criteria</Trans>
                </button>
              </>
            )}
          </section>


          {/* Keyboard details — the Output screen's left-pane tools, which
              had no other home: the keyboard's identity, re-basing, and
              the advanced .kmn editor. */}
          <section
            aria-label={t({ id: "publish.details.regionAriaLabel", message: "Keyboard details" })}
            data-testid="publish-keyboard-details"
            style={{
              marginTop: 10,
              padding: "8px 12px",
              border: "1px solid var(--app-border)",
              borderRadius: 6,
              background: "var(--app-surface)",
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--app-text)", marginBottom: 8 }}>
              <Trans id="publish.details.title">Keyboard details</Trans>
            </div>
            <TrackOneIdentityPanel />
            <button
              type="button"
              data-testid="publish-change-base"
              onClick={handleChangeStart}
              style={{
                marginTop: 8,
                padding: "5px 12px",
                background: "none",
                border: "1px solid var(--app-border)",
                borderRadius: 4,
                color: "var(--app-text-subtle)",
                cursor: "pointer",
                fontSize: 12,
                fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
              }}
            >
              <Trans id="publish.changeStarting.label">Change starting keyboard</Trans>
            </button>
            {artifact.stage.kind === "ready" && (
              <AdvancedKmnEditor vfs={artifact.stage.vfs} onRecompile={artifact.recompile} />
            )}
          </section>
        </>
      )}
      <ReformatConsentDialog {...artifact.reformatConsent} />
    </div>
  );
}
