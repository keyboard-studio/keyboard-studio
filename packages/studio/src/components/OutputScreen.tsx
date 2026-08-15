// OutputScreen — "ship it" tab.
//
// Left pane: shared PickerPane. Which variant depends on whether a working
// copy exists (spec 058):
//   - instantiated (the normal end-of-flow arrival) -> "shipping": read-only
//     base provenance + a "Change base keyboard" control that routes back to
//     the survey's choose_base step, plus TrackOneIdentityPanel and KmnEditor.
//     No mode toggle, no picker — nothing on the ship-it screen can re-base
//     the working copy in place. See PickerPane.tsx's variant notes.
//   - not instantiated (cold arrival at #output) -> "full": the historical
//     pane, so a base can still be selected and compiled here standalone.
// The variant is a LIVE store subscription, not a mount-once read: SurveyView's
// onInstantiate can settle after this screen mounts (see usePreviewArtifact's
// late-instantiation adoption), and an author with a working copy must never be
// left looking at the start-over pane.
// Right pane: Download .zip button + downloadError + downloadWarnings banner +
// showIdentityWarn banner + SignUpPanel.
//
// NO OSKFrame. NO OskModeToggle.
//
// The pipeline (usePreviewArtifact) runs independently on this screen so
// stage reaches "ready" and canDownload evaluates correctly without depending
// on a prior visit to another screen. The Zustand working-copy store persists
// across hash navigation so handleDownload reads the settled store regardless
// of which screen ran the compile.
//
// Coverage gate (the P0 fix — the Phase F hard-gate closure): this screen is
// directly reachable via #output without ever passing through advance.ts's
// "help" case or PhaseFGate — a nav-bar click, a typed hash, or a bookmark all
// land here regardless of survey progress. canDownload (from usePreviewArtifact)
// already folds in `!coverageGate.blocked`, so the button/PR-submit path can
// never emit while inventory characters remain unimplemented; this screen
// additionally renders WHY (which characters, which modality) and a control
// back to the relevant gallery, rather than a silently-disabled button — the
// same explanatory pattern PhaseFGate uses, reusing the identical shared
// selector (lib/unimplementedInventory.ts via usePreviewArtifact).

import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { formatCoverageBannerParts } from "../lib/unimplementedInventory.ts";
import { useResizablePanes } from "../hooks/useResizablePanes.ts";
import { usePreviewArtifact } from "../hooks/usePreviewArtifact.ts";
import { useGitHubAuth } from "../hooks/useGitHubAuth.ts";
import { useGoogleAuth } from "../hooks/useGoogleAuth.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { navigateTo } from "../lib/navigate.ts";
import { resolveOutputKeyboardId } from "../lib/outputKeyboardId.ts";
import { TOUCH_STEP_ID } from "../steps/reducer.ts";
import { BaseKeyboardPicker } from "./BaseKeyboardPicker.tsx";
import { ScaffoldForm } from "../editors/panels/ScaffoldForm.tsx";
import { KmnEditor } from "./KmnEditor.tsx";
import { TrackOneIdentityPanel } from "../editors/panels/TrackOneIdentityPanel.tsx";
import { PickerPane } from "./PickerPane.tsx";
import { SignUpPanel } from "./SignUpPanel.tsx";
import { ManagedPRSubmitPanel } from "./ManagedPRSubmitPanel.tsx";
import { ResizeHandle } from "./ResizeHandle.tsx";
import {
  DIVIDER_WIDTH,
  LEFT_MIN_PCT,
  LEFT_MAX_PCT,
  LEFT_INIT_PCT,
  PANE_SECONDARY_BUTTON,
} from "./previewOutputLayout.ts";

// Shared amber "[WARN]" banner shell used by both the touch-staleness banner
// and the download-projection-warnings banner below. Only the genuinely
// shared visual properties live here — per-banner text color / layout
// differences stay as local overrides at each call site.
const warningBannerStyle: React.CSSProperties = {
  marginTop: 4,
  padding: "8px 12px",
  background: "var(--app-warning-bg)",
  border: "1px solid var(--app-warning-border)",
  borderRadius: 6,
  fontSize: 12,
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

// Cap the package-failure diagnostic list. A dangling asset reference can
// produce a long run of near-identical messages, and a banner that pushes the
// still-working .zip button off screen would turn a recoverable failure into a
// dead end. The full set is in the console via devLog.
const KMP_DIAGNOSTIC_LIMIT = 5;

export function OutputScreen() {
  const { t } = useLingui();
  // Each screen runs its own independent artifact pipeline — see usePreviewArtifact.ts module comment for why this is deliberate (do not "dedupe" across screens).
  const artifact = usePreviewArtifact();
  const { containerRef, leftPct, onPointerDown } =
    useResizablePanes({ minPct: LEFT_MIN_PCT, maxPct: LEFT_MAX_PCT, initPct: LEFT_INIT_PCT });

  const {
    baseKeyboard,
    canDownload,
    downloading,
    downloadError,
    downloadWarnings,
    handleDownload,
    buildingKmp,
    kmpError,
    kmpDiagnostics,
    handleDownloadKmp,
    coverageGate,
    showIdentityWarn,
    // spec 059: the two attribution hard-blocks and the D5 escape hatch.
    attributionMissing,
    licenseUnparseable,
    resolveBaseHolder,
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

  // ---------------------------------------------------------------------------
  // Coverage-blocked explanation (P0 fix) — mirrors PhaseFGate's display
  // exactly, off the SAME shared gate. Named string locals computed BEFORE
  // the JSX below; no conditional JSX as direct <Trans> children.
  // ---------------------------------------------------------------------------
  const {
    unimplementedDesktop,
    unimplementedTouch,
    blockedOnDesktop,
    blockedOnTouch,
    blocked: coverageBlocked,
    touchLayoutCorrupted,
  } = coverageGate;
  const sessionBackToUnfinishedGallery = useSurveySessionStore((s) => s.backToUnfinishedGallery);
  const coverageTotalCount =
    unimplementedDesktop.length + (blockedOnTouch ? unimplementedTouch.length : 0);
  const coverageCountLabel = t({
    id: "output.coverageBlocked.count",
    message: plural(coverageTotalCount, { one: "# character", other: "# characters" }),
  });
  const mechanismGalleryLabel = t({
    id: "editor.assignLoop.mechanismGalleryHeading",
    message: "Mechanism Gallery",
  });
  const touchGalleryLabel = t({ id: "editor.assignLoop.touchGalleryHeading", message: "Touch Gallery" });
  const { uncoveredCharsList: coverageUncoveredCharsList, targetGalleryLabel: coverageTargetGalleryLabel } =
    formatCoverageBannerParts(coverageGate, {
      desktopLabel: mechanismGalleryLabel,
      touchLabel: touchGalleryLabel,
    });
  const handleGoToGallery = () => {
    // Route back into the survey wizard at whichever gallery still has
    // work — desktop first (it gates touch's own completion too, so fixing
    // it first is always correct — same ordering as PhaseFGate) — EXCEPT a
    // corrupted touch layout, which can only be fixed by re-deriving it in
    // the touch gallery and so takes priority. This is a BACK action
    // (backToUnfinishedGallery), not the forward-push `advance` — see that
    // store action's docstring for the P0 regression a forward-push here
    // would reproduce (a stale history entry a later ordinary Back traversal
    // would resurface as Phase F).
    //
    // Spec 057 FR-005/FR-008 (D-3): the ORDER here is load-bearing and now
    // actually holds. Setting the target step before navigating was always the
    // right shape; it simply did not survive arrival, because `SurveyView`'s
    // mount reset ran on the remount the hash change causes and put the author
    // back on the identity question — the very thing the banner had promised
    // to take them away from. With the reset gone (D-1) this lands on the
    // gallery it names. Covered by `wizardEntryPoints.test.tsx`.
    sessionBackToUnfinishedGallery(
      touchLayoutCorrupted ? "touch" : blockedOnDesktop ? "mechanisms" : "touch",
    );
    navigateTo("survey");
  };

  // Output-time staleness gate. staleSteps.has(TOUCH_STEP_ID) already implies
  // the touch step was completed (a touchLayoutJson side-car was written) and
  // has since been re-opened by a downstream mechanics edit (see
  // MechanismGallery.handleUnlock) — so the emitted side-car would be stale.
  // Refuse both output surfaces (zip download, managed-PR submit) rather than
  // silently ship a stale on-screen-keyboard layout.
  const staleSteps = useWorkingCopyStore((s) => s.staleSteps);
  const touchStale = staleSteps.has(TOUCH_STEP_ID);

  // Pane variant (spec 058). Live subscription through the store's OWN
  // predicate — do not fork a second notion of "has a working copy".
  const instantiated = useWorkingCopyStore((s) => s.isInstantiated());

  // "Change base keyboard" — relocates re-basing to the survey's choose_base
  // step rather than mutating the working copy from the ship-it screen. A BACK
  // action (see backToChooseBase's docstring for why an advance() would corrupt
  // the history stack), and it deliberately mutates nothing itself: the rebase
  // question is answered at the destination by the existing confirmRebaseTo
  // gate, which also no-ops when the author re-picks the same base.
  const sessionBackToChooseBase = useSurveySessionStore((s) => s.backToChooseBase);
  const handleChangeBase = () => {
    sessionBackToChooseBase();
    navigateTo("survey");
  };

  // Derive prefill: Google identity takes precedence (has both name + email).
  // GitHub provides only the login handle as a name hint.
  const submitPrefill: { displayName?: string; email?: string } =
    googleIdentity !== null
      ? { displayName: googleIdentity.name, email: googleIdentity.email }
      : ghLogin !== null
        ? { displayName: ghLogin }
        : {};

  const rightPct = 100 - leftPct;

  // Download button aria-label — computed unconditionally (cheap) so the JSX
  // below stays a single conditional, not a nested t()-per-branch call site.
  //
  // The id MUST come from the same place the emitted filename does, and the way
  // it does so is by calling the same function — `resolveOutputKeyboardId`, which
  // `projectWorkingCopyForOutput` also calls for the `<id>-<version>.zip` name.
  // The previous derivation went through pickerMode/scaffoldSpec instead, and
  // since pickerMode is per-screen local state that always initializes to "open"
  // here, it announced the BASE id ("Download keyboard us as zip") while the file
  // that landed was "dagbanli-<version>.zip" — WCAG 2.2 AA 2.5.3 / 4.1.2. Do not
  // reintroduce a second derivation of this id; extend the shared helper.
  const downloadKeyboardId = resolveOutputKeyboardId(identity, baseKeyboard);
  const downloadAriaLabel = touchStale
    ? t({
        id: "output.download.aria.touchStale",
        message:
          "Download unavailable — the touch layout is out of date. Return to the Touch step and re-complete it before downloading.",
      })
    : coverageBlocked
      ? t({
          id: "output.download.aria.coverageBlocked",
          message:
            "Download unavailable — finish every inventory character before downloading. See the banner below for details.",
        })
      : // spec 059 D5 before D6: an unreadable base notice is the more specific
        // problem, and its banner is the one carrying the control that fixes it.
        licenseUnparseable !== null
        ? t({
            id: "output.download.aria.licenseUnreadable",
            // Names the field the author is being sent to ("Original copyright
            // holder" in the banner below) rather than paraphrasing it, so the
            // announcement and the control it points at use the same words.
            message:
              "Download unavailable — the base keyboard's original copyright holder could not be read. Confirm it in the banner below.",
          })
        : attributionMissing
          ? t({
              id: "output.download.aria.attributionMissing",
              message:
                "Download unavailable — the keyboard needs an author and a copyright holder.",
            })
          : canDownload
            ? t({
                id: "output.download.aria.ready",
                message: `Download keyboard ${downloadKeyboardId} as zip`,
              })
            : t({
                id: "output.download.aria.notReady",
                message: "Download unavailable until compile completes",
              });

  // The .kmp shares every gate with the .zip, so it reuses the same
  // unavailability reasons and only differs in the ready case.
  const kmpAriaLabel = canDownload && !touchStale
    ? t({
        id: "output.download.aria.kmp",
        message: `Download keyboard ${downloadKeyboardId} as an installable Keyman package`,
      })
    : downloadAriaLabel;

  // Both buttons disable while EITHER download is in flight: they share one
  // projection + compile, so overlapping clicks would do the same work twice.
  const kmpActionable = canDownload && !buildingKmp && !downloading && !touchStale;
  const zipActionable = canDownload && !downloading && !buildingKmp && !touchStale;

  return (
    <div
      ref={containerRef}
      data-testid="output-screen-root"
      style={{
        display: "flex",
        flexDirection: "row",
        height: "100%",
        width: "100%",
        background: "var(--app-bg)",
        color: "var(--app-text)",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Left pane: shipping details once instantiated, else the cold-arrival
          picker — see the module comment. */}
      <PickerPane
        artifact={artifact}
        variant={instantiated ? "shipping" : "full"}
        changeBaseSlot={
          <button
            type="button"
            data-testid="output-change-base"
            onClick={handleChangeBase}
            // The left pane owns this treatment even though the slot content is
            // authored here — see PANE_SECONDARY_BUTTON in previewOutputLayout.
            style={{ ...PANE_SECONDARY_BUTTON, alignSelf: "flex-start" }}
          >
            <Trans id="output.changeBase.label">Change base keyboard</Trans>
          </button>
        }
        leftPct={leftPct}
        dividerWidth={DIVIDER_WIDTH}
        pickerSlot={
          <BaseKeyboardPicker
            value={artifact.baseKeyboard}
            onChange={artifact.handleBaseKeyboardChange}
          />
        }
        scaffoldFormSlot={
          artifact.pickerMode === "scaffold" && artifact.baseKeyboard !== null ? (
            <ScaffoldForm onSubmit={(spec) => { artifact.setScaffoldSpec(spec); }} />
          ) : null
        }
        identityPanelSlot={<TrackOneIdentityPanel />}
        kmnEditorSlot={
          artifact.stage.kind === "ready" ? (
            <KmnEditor vfs={artifact.stage.vfs} onRecompile={artifact.recompile} />
          ) : null
        }
      />

      {/* Drag handle */}
      <ResizeHandle onPointerDown={onPointerDown} />

      {/* Right pane: download + submit controls */}
      <section
        aria-label={t({ id: "output.pane.label", message: "Output pane" })}
        style={{
          flexBasis: `calc(${rightPct}% - ${DIVIDER_WIDTH / 2}px)`,
          flexGrow: 1,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minHeight: 0,
          overflow: "auto",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.1rem", color: "var(--app-accent-text)" }}>
          <Trans id="output.heading">Output</Trans>
        </h2>
        {baseKeyboard !== null && (
          <>
            {/* PRIMARY download: the installable package. A user double-clicks
                this and the keyboard installs on Keyman for Windows, macOS,
                Linux, iOS, or Android — no Keyman Developer, no unzipping, no
                compile step. The source .zip below is for editing and
                contributing, which is a different (and rarer) need. */}
            <button
              type="button"
              data-testid="emit-download-kmp"
              disabled={!canDownload || buildingKmp || downloading || touchStale}
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
                // NOT transitioned: `color` switches with `background` on the
                // SAME kmpActionable flip, but with no matching transition of
                // its own it snaps instantly while background fades over
                // 150ms, so the disabled bg briefly pairs with the actionable
                // text color mid-fade -- a real (if brief) 1.4.3 contrast
                // violation axe caught during the disabled->actionable
                // transition (#1477).
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

            {/* SECONDARY download: source, for editing or contributing. */}
            <button
              type="button"
              data-testid="emit-download"
              disabled={!canDownload || downloading || buildingKmp || touchStale}
              onClick={() => { void handleDownload(); }}
              aria-label={downloadAriaLabel}
              style={{
                alignSelf: "flex-start",
                padding: "6px 14px",
                background: "transparent",
                color: zipActionable ? "var(--app-text-subtle)" : "var(--app-text-disabled)",
                border: "1px solid var(--app-border)",
                borderRadius: 6,
                fontSize: 12,
                cursor: zipActionable ? "pointer" : "not-allowed",
                fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
                transition: "background 0.15s",
              }}
            >
              {downloading ? (
                <Trans id="output.download.button.downloading">Downloading...</Trans>
              ) : (
                <Trans id="output.download.button.download">Download source .zip</Trans>
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
              <Trans id="output.download.zip.help">
                The keyboard&apos;s source files, for editing in Keyman Developer or
                contributing upstream.
              </Trans>
            </p>
            {touchStale && (
              <div
                role="alert"
                style={{ ...warningBannerStyle, color: "var(--app-warning-text)", lineHeight: 1.5 }}
              >
                {"[WARN] "}
                <Trans id="output.status.touchStale">
                  A mechanics change after the Touch step means the on-screen
                  (touch) keyboard layout is now out of date. Return to the
                  Touch step and re-complete it before downloading or
                  submitting — otherwise the shipped keyboard would include a
                  stale touch layout.
                </Trans>
              </div>
            )}
            {/* Coverage-blocked explanation (P0 fix) — WHY download/submit is
                unavailable, not just a disabled button. Reuses the same
                shared gate (lib/unimplementedInventory.ts) and explanatory
                pattern as PhaseFGate: count + which characters + which
                modality + a control back to the relevant gallery. */}
            {coverageBlocked && (
              <div
                role="alert"
                style={{ ...warningBannerStyle, color: "var(--app-danger-text)", borderColor: "var(--app-danger)", lineHeight: 1.5 }}
              >
                {"[ERROR] "}
                {touchLayoutCorrupted ? (
                  <Trans id="output.status.coverageBlocked.touchCorrupted">
                    Your touch layout couldn't be read and may be corrupted. Re-derive it
                    from the {coverageTargetGalleryLabel} to continue.
                  </Trans>
                ) : (
                  <Trans id="output.status.coverageBlocked">
                    {coverageCountLabel} still need an implementation before you can
                    download or submit: {coverageUncoveredCharsList}. Go back to the{" "}
                    {coverageTargetGalleryLabel} to finish them.
                  </Trans>
                )}{" "}
                <button
                  type="button"
                  data-testid="output-coverage-goto-gallery"
                  onClick={handleGoToGallery}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "var(--app-danger-text)",
                    textDecoration: "underline",
                    cursor: "pointer",
                    font: "inherit",
                  }}
                >
                  <Trans id="output.status.coverageBlocked.goto">Go finish them now</Trans>
                </button>
              </div>
            )}
            {/* spec 059 D5 — the base's own copyright notice could not be read.
                This is an [ERROR] rather than a warning: emitting anyway would
                publish a LICENSE.md naming only this author, silently dropping
                the notice MIT requires a derivative to retain. Carries the one
                control that clears it. */}
            {licenseUnparseable !== null && (
              <div
                role="alert"
                data-testid="license-unreadable"
                style={{
                  ...warningBannerStyle,
                  color: "var(--app-danger-text)",
                  borderColor: "var(--app-danger)",
                  lineHeight: 1.5,
                  maxWidth: 560,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {"[ERROR] "}
                  <Trans id="output.status.licenseUnreadable.title">
                    The base keyboard&apos;s copyright notice could not be read
                  </Trans>
                </div>
                <div style={{ marginBottom: 6 }}>
                  <Trans id="output.status.licenseUnreadable.line">Its licence file says:</Trans>{" "}
                  <code style={{ fontFamily: "ui-monospace, monospace" }}>
                    {licenseUnparseable.line}
                  </code>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <Trans id="output.status.licenseUnreadable.why">
                    This keyboard must keep the original author&apos;s copyright, so who held
                    it needs confirming before it can be downloaded.
                  </Trans>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input = e.currentTarget.elements.namedItem(
                      "baseHolder",
                    ) as HTMLInputElement | null;
                    if (input !== null) resolveBaseHolder(input.value);
                  }}
                  style={{ display: "flex", gap: 6, alignItems: "center" }}
                >
                  <input
                    name="baseHolder"
                    type="text"
                    aria-label={t({
                      id: "output.status.licenseUnreadable.holderLabel",
                      message: "Original copyright holder",
                    })}
                    placeholder={t({
                      id: "output.status.licenseUnreadable.holderPlaceholder",
                      message: "Original copyright holder",
                    })}
                    style={{
                      flex: 1,
                      padding: "5px 8px",
                      background: "var(--app-bg)",
                      color: "var(--app-text)",
                      border: "1px solid var(--app-border)",
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                  />
                  <button
                    type="submit"
                    data-testid="resolve-base-holder"
                    style={{
                      padding: "5px 12px",
                      background: "var(--app-accent)",
                      color: "var(--app-text-on-accent)",
                      border: "1px solid var(--app-border)",
                      borderRadius: 4,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    <Trans id="output.status.licenseUnreadable.confirm">Confirm</Trans>
                  </button>
                </form>
              </div>
            )}
            {/* spec 059 D6 — no attribution captured at all. Not an error the
                author caused, so [WARN] styling and a pointer back to where it
                is answered. */}
            {attributionMissing && (
              <div
                role="status"
                aria-live="polite"
                data-testid="attribution-required"
                style={{ ...warningBannerStyle, color: "var(--app-warning-text)", lineHeight: 1.5 }}
              >
                {"[WARN] "}
                <Trans id="output.status.attributionRequired">
                  This keyboard needs an author and a copyright holder before it can be
                  downloaded. Go back to the language step to add them.
                </Trans>
              </div>
            )}
            {downloadError !== null && (
              <div role="alert" style={{ fontSize: 11, color: "var(--app-danger-text)", marginTop: 4 }}>
                {downloadError}
              </div>
            )}
            {downloadWarnings.length > 0 && (
              <div
                role="status"
                aria-live="polite"
                aria-label={t({
                  id: "output.download.warnings.ariaLabel",
                  message: "Download projection warnings",
                })}
                style={warningBannerStyle}
              >
                <div style={{ color: "var(--app-warning-text)", fontWeight: 600, marginBottom: 4 }}>
                  {"[WARN] "}
                  <Trans id="output.download.warnings.header">
                    Download completed with warnings:
                  </Trans>
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    color: "var(--app-warning-text)",
                    lineHeight: 1.6,
                  }}
                >
                  {downloadWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {showIdentityWarn && (
              <div
                role="status"
                aria-live="polite"
                style={{ fontSize: 12, color: "var(--app-warning-text)", marginTop: 4 }}
              >
                {"[WARN] "}
                <Trans id="output.identity.warn">
                  Your keyboard id is still set to the base keyboard&rsquo;s
                  id. Downloading now will name the .zip and its internal
                  file paths after the base id. Set your own keyboard name
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
                    el?.scrollIntoView({ behavior: "smooth", block: "center" });
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
            {/* Option B (org-mediated PR) submit — PRIMARY submit action per
                docs/github-integration.md §1a. Calls the backend proxy; the
                user never sees a branch or PR workflow. Gated on canDownload
                (compile ready + working copy instantiated + inventory
                coverage — same P0 gate as the zip download), plus the
                touchStale/coverageBlocked flags below purely for the
                explanatory aria-label (canSubmit already forbids the
                emission either way). Attribution prefill from whichever
                identity provider is active. */}
            <ManagedPRSubmitPanel
              canSubmit={canDownload}
              outputBlocked={touchStale || coverageBlocked}
              outputBlockedReason={
                touchStale
                  ? t({
                      id: "output.submit.outputBlockedReason.touchStale",
                      message:
                        "the touch layout is out of date — return to the Touch step and re-complete it",
                    })
                  : t({
                      id: "output.submit.outputBlockedReason.coverageBlocked",
                      message:
                        "some inventory characters still need an implementation — see the banner above",
                    })
              }
              prefill={submitPrefill}
            />

            {/* Decoupled "Sign up with GitHub / Google" identity step (docs/github-integration.md
                §1a). Establishes who the user is — NOT a submit/PR action, and not
                gated on artifact readiness (you can sign up any time). */}
            <SignUpPanel />
          </>
        )}
      </section>
    </div>
  );
}
