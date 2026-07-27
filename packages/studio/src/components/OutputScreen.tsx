// OutputScreen — "ship it" tab.
//
// Left pane: shared PickerPane (BaseKeyboardPicker, mode toggle, ScaffoldForm,
// TrackOneIdentityPanel, KmnEditor, MetadataCard).
// Right pane: Download .zip button + downloadError + downloadWarnings banner +
// showIdentityWarn banner + SignUpPanel.
//
// NO OSKFrame. NO OskModeToggle.
//
// The pipeline (usePreviewArtifact) runs independently on this screen so
// stage reaches "ready" and canDownload evaluates correctly without depending
// on a prior visit to PreviewScreen. The Zustand working-copy store persists
// across hash navigation so handleDownload reads the settled store regardless
// of which screen ran the compile.

import { Trans, useLingui } from "@lingui/react/macro";
import { useResizablePanes } from "../hooks/useResizablePanes.ts";
import { usePreviewArtifact } from "../hooks/usePreviewArtifact.ts";
import { useGitHubAuth } from "../hooks/useGitHubAuth.ts";
import { useGoogleAuth } from "../hooks/useGoogleAuth.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { TOUCH_STEP_ID } from "../steps/reducer.ts";
import { BaseKeyboardPicker } from "./BaseKeyboardPicker.tsx";
import { ScaffoldForm } from "../editors/panels/ScaffoldForm.tsx";
import { KmnEditor } from "./KmnEditor.tsx";
import { TrackOneIdentityPanel } from "../editors/panels/TrackOneIdentityPanel.tsx";
import { PickerPane } from "./PickerPane.tsx";
import { SignUpPanel } from "./SignUpPanel.tsx";
import { ManagedPRSubmitPanel } from "./ManagedPRSubmitPanel.tsx";
import { ResizeHandle } from "./ResizeHandle.tsx";
import { DIVIDER_WIDTH, LEFT_MIN_PCT, LEFT_MAX_PCT, LEFT_INIT_PCT } from "./previewOutputLayout.ts";

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
    pickerMode,
    scaffoldSpec,
    canDownload,
    downloading,
    downloadError,
    downloadWarnings,
    handleDownload,
    showIdentityWarn,
  } = artifact;

  // Identity prefill for the Option B submit form. Read from whichever auth
  // provider is active. GitHub: login name (no email — only user:email scope
  // was requested at sign-up, and that is not surfaced in the SPA). Google:
  // name + email from the stored identity claims.
  const { login: ghLogin } = useGitHubAuth();
  const { identity: googleIdentity } = useGoogleAuth();

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

  const rightPct = 100 - leftPct;

  // Download button aria-label — computed unconditionally (cheap) so the JSX
  // below stays a single conditional, not a nested t()-per-branch call site.
  const downloadKeyboardId =
    baseKeyboard !== null
      ? pickerMode === "scaffold" && scaffoldSpec !== null
        ? scaffoldSpec.keyboardId
        : baseKeyboard.id
      : "";
  const downloadAriaLabel = touchStale
    ? t({
        id: "output.download.aria.touchStale",
        message:
          "Download unavailable — the touch layout is out of date. Return to the Touch step and re-complete it before downloading.",
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
      {/* Left pane: picker */}
      <PickerPane
        artifact={artifact}
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
                (compile ready + working copy instantiated), same guard as the
                zip download. Attribution prefill from whichever identity
                provider is active. */}
            <ManagedPRSubmitPanel
              canSubmit={canDownload}
              outputBlocked={touchStale}
              outputBlockedReason={t({
                id: "output.submit.outputBlockedReason.touchStale",
                message:
                  "the touch layout is out of date — return to the Touch step and re-complete it",
              })}
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
