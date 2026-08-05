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
  background: "#2a1a00",
  border: "1px solid #d29922",
  borderRadius: 6,
  fontSize: 12,
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

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
    coverageGate,
    showIdentityWarn,
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
      : canDownload
        ? t({
            id: "output.download.aria.ready",
            message: `Download keyboard ${downloadKeyboardId} as zip`,
          })
        : t({
            id: "output.download.aria.notReady",
            message: "Download unavailable until compile completes",
          });

  return (
    <div
      ref={containerRef}
      data-testid="output-screen-root"
      style={{
        display: "flex",
        flexDirection: "row",
        height: "100%",
        width: "100%",
        background: "#0d1117",
        color: "#e6edf3",
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
        <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#6ea8fe" }}>
          <Trans id="output.heading">Output</Trans>
        </h2>
        {baseKeyboard !== null && (
          <>
            <button
              type="button"
              data-testid="emit-download"
              disabled={!canDownload || downloading || touchStale}
              onClick={() => { void handleDownload(); }}
              aria-label={downloadAriaLabel}
              style={{
                alignSelf: "flex-start",
                marginTop: 4,
                padding: "7px 16px",
                background: canDownload && !downloading && !touchStale ? "#1f6feb" : "#161b22",
                color: canDownload && !downloading && !touchStale ? "#e6edf3" : "#484f58",
                border: "1px solid #283040",
                borderRadius: 6,
                fontSize: 13,
                cursor: canDownload && !downloading && !touchStale ? "pointer" : "not-allowed",
                fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
                transition: "background 0.15s",
              }}
            >
              {downloading ? (
                <Trans id="output.download.button.downloading">Downloading...</Trans>
              ) : (
                <Trans id="output.download.button.download">Download .zip</Trans>
              )}
            </button>
            {touchStale && (
              <div
                role="alert"
                style={{ ...warningBannerStyle, color: "#d29922", lineHeight: 1.5 }}
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
                style={{ ...warningBannerStyle, color: "#f85149", borderColor: "#f85149", lineHeight: 1.5 }}
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
                    color: "#f85149",
                    textDecoration: "underline",
                    cursor: "pointer",
                    font: "inherit",
                  }}
                >
                  <Trans id="output.status.coverageBlocked.goto">Go finish them now</Trans>
                </button>
              </div>
            )}
            {downloadError !== null && (
              <div role="alert" style={{ fontSize: 11, color: "#f0a0a0", marginTop: 4 }}>
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
                <div style={{ color: "#d29922", fontWeight: 600, marginBottom: 4 }}>
                  {"[WARN] "}
                  <Trans id="output.download.warnings.header">
                    Download completed with warnings:
                  </Trans>
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    color: "#d29922",
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
                style={{ fontSize: 12, color: "#d29922", marginTop: 4 }}
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
                    color: "#d29922",
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
