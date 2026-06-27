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

import { useResizablePanes } from "../hooks/useResizablePanes.ts";
import { usePreviewArtifact } from "../hooks/usePreviewArtifact.ts";
import { useGitHubAuth } from "../hooks/useGitHubAuth.ts";
import { useGoogleAuth } from "../hooks/useGoogleAuth.ts";
import { BaseKeyboardPicker } from "./BaseKeyboardPicker.tsx";
import { ScaffoldForm } from "../editors/panels/ScaffoldForm.tsx";
import { KmnEditor } from "./KmnEditor.tsx";
import { TrackOneIdentityPanel } from "../editors/panels/TrackOneIdentityPanel.tsx";
import { PickerPane } from "./PickerPane.tsx";
import { SignUpPanel } from "./SignUpPanel.tsx";
import { ManagedPRSubmitPanel } from "./ManagedPRSubmitPanel.tsx";
import { ResizeHandle } from "./ResizeHandle.tsx";
import { DIVIDER_WIDTH, LEFT_MIN_PCT, LEFT_MAX_PCT, LEFT_INIT_PCT } from "./previewOutputLayout.ts";

export function OutputScreen() {
  // Each screen runs its own independent artifact pipeline — see usePreviewArtifact.ts module comment for why this is deliberate (do not "dedupe" across screens).
  const artifact = usePreviewArtifact();
  const { containerRef, leftPct, handleHovered, onPointerDown, setHandleHovered } =
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

  // Derive prefill: Google identity takes precedence (has both name + email).
  // GitHub provides only the login handle as a name hint.
  const submitPrefill: { displayName?: string; email?: string } =
    googleIdentity !== null
      ? { displayName: googleIdentity.name, email: googleIdentity.email }
      : ghLogin !== null
        ? { displayName: ghLogin }
        : {};

  const rightPct = 100 - leftPct;

  return (
    <div
      ref={containerRef}
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
      <ResizeHandle
        onPointerDown={onPointerDown}
        hovered={handleHovered}
        onHoverChange={setHandleHovered}
      />

      {/* Right pane: download + submit controls */}
      <section
        aria-label="Output pane"
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
          Output
        </h2>
        {baseKeyboard !== null && (
          <>
            <button
              type="button"
              disabled={!canDownload || downloading}
              onClick={() => { void handleDownload(); }}
              aria-label={
                canDownload
                  ? `Download keyboard ${pickerMode === "scaffold" && scaffoldSpec !== null ? scaffoldSpec.keyboardId : baseKeyboard.id} as zip`
                  : "Download unavailable until compile completes"
              }
              style={{
                alignSelf: "flex-start",
                marginTop: 4,
                padding: "7px 16px",
                background: canDownload && !downloading ? "#1f6feb" : "#161b22",
                color: canDownload && !downloading ? "#e6edf3" : "#484f58",
                border: "1px solid #283040",
                borderRadius: 6,
                fontSize: 13,
                cursor: canDownload && !downloading ? "pointer" : "not-allowed",
                fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
                transition: "background 0.15s",
              }}
            >
              {downloading ? "Downloading..." : "Download .zip"}
            </button>
            {downloadError !== null && (
              <div role="alert" style={{ fontSize: 11, color: "#f0a0a0", marginTop: 4 }}>
                {downloadError}
              </div>
            )}
            {downloadWarnings.length > 0 && (
              <div
                role="status"
                aria-live="polite"
                aria-label="Download projection warnings"
                style={{
                  marginTop: 4,
                  padding: "8px 12px",
                  background: "#2a1a00",
                  border: "1px solid #d29922",
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
                }}
              >
                <div style={{ color: "#d29922", fontWeight: 600, marginBottom: 4 }}>
                  [WARN] Download completed with warnings:
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
                [WARN] Your keyboard id is still set to the base keyboard&rsquo;s
                id. Downloading now will name the .zip and its internal file
                paths after the base id. Set your own keyboard name and id
                before downloading or submitting to the community repository.{" "}
                <button
                  type="button"
                  aria-label="Go to the keyboard name and id step"
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
                  Go to name &amp; id
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
