// GitHubSubmitPanel — the "Connect GitHub" + "Submit PR" output controls
// (spec §12 "Option A": OAuth fork+PR delivery). Rendered adjacent to the
// "Download .zip" button in PreviewShell.
//
// Responsibilities (UI side only — engine owns the network + file shape):
//   - Connect / Disconnect GitHub (delegates to useGitHubAuth).
//   - Surface a "re-authenticate" prompt when the token lacks `public_repo`.
//   - Gate "Submit PR" on a valid scoped token AND a download-ready working copy.
//   - Confirmation dialog with editable branchName / prTitle / prBody.
//   - Call getGitHubOutputService().publishPR(vfs, opts); show progress.
//   - On success, show the clickable PR URL; on error, map every PublishPRError
//     kind to a message (and re-show branchName on branch-exists).
//
// Matches PreviewShell's inline-style dark-theme idiom + a11y conventions
// (aria-live status, disabled gating).

import { useCallback, useId, useState } from "react";
import type { PublishPROptions } from "@keyboard-studio/contracts";
import { useGitHubAuth } from "../hooks/useGitHubAuth.ts";
import { getGitHubOutputService } from "../lib/services.ts";
import { projectWorkingCopyForOutput } from "../lib/serializeWorkingCopy.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import {
  publishPRErrorMessage,
  isPublishPRError,
} from "../lib/publishPRErrorMessage.ts";

// ---------------------------------------------------------------------------
// Shared style fragments (mirroring PreviewShell)
// ---------------------------------------------------------------------------

const PANEL_FONT =
  "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function primaryButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    alignSelf: "flex-start",
    padding: "7px 16px",
    background: enabled ? "#238636" : "#161b22",
    color: enabled ? "#e6edf3" : "#484f58",
    border: "1px solid #283040",
    borderRadius: 6,
    fontSize: 13,
    cursor: enabled ? "pointer" : "not-allowed",
    fontFamily: PANEL_FONT,
    transition: "background 0.15s",
  };
}

function secondaryButtonStyle(): React.CSSProperties {
  return {
    padding: "6px 12px",
    background: "transparent",
    color: "#9aa7b8",
    border: "1px solid #283040",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: PANEL_FONT,
  };
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#9aa7b8",
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  padding: "6px 8px",
  background: "#0d1117",
  color: "#e6edf3",
  border: "1px solid #283040",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: PANEL_FONT,
  width: "100%",
  boxSizing: "border-box",
};

// ---------------------------------------------------------------------------
// Default PR-body stub (NOT the full lint checklist composer — see issue scope)
// ---------------------------------------------------------------------------

function defaultPrBody(displayName: string, version: string): string {
  return [
    `## ${displayName} ${version}`,
    "",
    "Submitted from Keyboard Studio.",
    "",
    "- Source files only (no compiled artifacts).",
    "- Please review before merging.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Copyright attestation (spec §12 / Scenario E — MANDATORY manual gate)
// ---------------------------------------------------------------------------

/**
 * Resolve the copyright holder for the attestation sentence from the working
 * copy. Prefers the imported IR header's `copyright` field (Track 2 / adapted
 * keyboards carry the source's holder); returns null when no holder is known so
 * the caller falls back to neutral phrasing.
 *
 * Read once at confirm-open (not reactive) — the dialog opens against a settled
 * working copy.
 */
function resolveCopyrightHolder(): string | null {
  const { baseIr } = useWorkingCopyStore.getState();
  const holder = baseIr?.header.copyright.trim();
  return holder !== undefined && holder !== "" ? holder : null;
}

/**
 * Build the copyright attestation sentence (spec §12, spec.md:1320 / Scenario E,
 * spec.md:1477):
 *
 *   "I confirm I am the copyright holder or am authorized to submit on behalf
 *    of <holder>."
 *
 * When no holder is known, falls back to neutral phrasing so the gate still
 * stands without naming a holder.
 */
function attestationLabel(holder: string | null): string {
  return holder !== null
    ? `I confirm I am the copyright holder or am authorized to submit on behalf of ${holder}.`
    : "I confirm I am the copyright holder or am authorized to submit this keyboard.";
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GitHubSubmitPanelProps {
  /**
   * Whether the working copy is ready to serialize (compile ready +
   * instantiated). Mirrors PreviewShell's `canDownload`.
   */
  canSubmitArtifact: boolean;
}

type SubmitPhase =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "publishing" }
  | { kind: "success"; prUrl: string }
  | { kind: "error"; message: string; showBranchField: boolean };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GitHubSubmitPanel({ canSubmitArtifact }: GitHubSubmitPanelProps) {
  const auth = useGitHubAuth();
  const [phase, setPhase] = useState<SubmitPhase>({ kind: "idle" });

  // Editable PR fields — initialised when the dialog opens.
  const [branchName, setBranchName] = useState("");
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");

  // Copyright attestation gate (spec §12 / Scenario E). Resolved holder for the
  // sentence + the user's active confirmation. NEVER auto-checked, NEVER
  // persisted across sessions: both reset every time the dialog opens.
  const [copyrightHolder, setCopyrightHolder] = useState<string | null>(null);
  const [attested, setAttested] = useState(false);

  const branchId = useId();
  const titleId = useId();
  const bodyId = useId();
  const attestId = useId();

  // Submit PR enabled only with a valid scoped token AND a ready artifact.
  const submitEnabled = auth.canSubmit && canSubmitArtifact;

  const openConfirm = useCallback(async () => {
    // Pre-fill defaults from the projected working copy (keyboardId, name, version).
    const projected = await projectWorkingCopyForOutput();
    const keyboardId = projected?.keyboardId ?? "keyboard";
    const displayName = projected?.displayName ?? keyboardId;
    const version = projected?.version ?? "1.0";
    setBranchName(`add/${keyboardId}`);
    setPrTitle(`Add ${displayName} ${version}`);
    setPrBody(defaultPrBody(displayName, version));
    // Resolve the attestation holder and reset the checkbox unchecked each open
    // (never auto-checked, never carried across sessions).
    setCopyrightHolder(resolveCopyrightHolder());
    setAttested(false);
    setPhase({ kind: "confirming" });
  }, []);

  const doPublish = useCallback(async () => {
    if (auth.login === null) {
      setPhase({
        kind: "error",
        message: "Not connected to GitHub.",
        showBranchField: false,
      });
      return;
    }
    const token = auth.token?.accessToken ?? "";
    setPhase({ kind: "publishing" });
    try {
      const projected = await projectWorkingCopyForOutput();
      if (projected === null) {
        setPhase({
          kind: "error",
          message: "Nothing to submit — select a keyboard first.",
          showBranchField: false,
        });
        return;
      }
      const opts: PublishPROptions = {
        token,
        forkOwner: auth.login,
        branchName,
        commitMessage: prTitle,
        prTitle,
        prBody,
        // v1 sink: log per-step progress (no UI calcification yet, per #448).
        // A future iteration can route this into setPhase for a progress bar.
        onProgress: (step) =>
          console.info(`[publishPR] step ${step.index}/${step.total}: ${step.name}`),
      };
      const svc = await getGitHubOutputService();
      const result = await svc.publishPR(projected.vfs, opts);
      setPhase({ kind: "success", prUrl: result.prUrl });
    } catch (err: unknown) {
      if (isPublishPRError(err)) {
        setPhase({
          kind: "error",
          message: publishPRErrorMessage(err),
          showBranchField: err.kind === "branch-exists",
        });
      } else {
        setPhase({
          kind: "error",
          message: err instanceof Error ? err.message : "Unexpected error submitting PR.",
          showBranchField: false,
        });
      }
    }
  }, [auth.login, auth.token, branchName, prTitle, prBody]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <section
      aria-label="Submit to community repository"
      style={{
        marginTop: 12,
        padding: "12px 14px",
        background: "#161b22",
        border: "1px solid #283040",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: PANEL_FONT,
      }}
    >
      <div style={{ ...labelStyle, color: "#7ee787" }}>Submit a pull request</div>

      {/* Connection controls */}
      {auth.status === "connected" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "#e6edf3" }}>
            Connected as <strong>{auth.login}</strong>
          </span>
          <button type="button" onClick={auth.disconnect} style={secondaryButtonStyle()}>
            Disconnect
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void auth.connect()}
            disabled={auth.status === "verifying"}
            style={primaryButtonStyle(auth.status !== "verifying")}
          >
            {auth.status === "verifying" ? "Connecting..." : "Connect GitHub"}
          </button>
          {auth.status === "needs-scope" && (
            <button type="button" onClick={auth.disconnect} style={secondaryButtonStyle()}>
              Disconnect
            </button>
          )}
        </div>
      )}

      {/* Re-authenticate prompt when missing scope */}
      {auth.status === "needs-scope" && (
        <div role="alert" style={{ fontSize: 12, color: "#d29922" }}>
          [WARN] This GitHub token is missing the required scope
          {auth.missingScopes.length > 0
            ? ` (${auth.missingScopes.join(", ")})`
            : ""}
          . Reconnect GitHub and grant <code>public_repo</code> access.
        </div>
      )}
      {/* Auth error — surfaced whenever set, not only in "error" status, so a
          failed/denied OAuth round-trip (?oauth_error=, picked up on the idle
          no-token path) is visible next to the bare Connect button. */}
      {auth.error !== null && (
        <div role="alert" style={{ fontSize: 12, color: "#f0a0a0" }}>
          {auth.error}
        </div>
      )}

      {/* Submit PR button */}
      <button
        type="button"
        disabled={!submitEnabled || phase.kind === "publishing"}
        onClick={() => void openConfirm()}
        aria-label={
          submitEnabled
            ? "Submit a pull request to the community repository"
            : auth.canSubmit
              ? "Submit unavailable until compile completes"
              : "Connect GitHub with public_repo scope to submit a pull request"
        }
        title={
          submitEnabled
            ? undefined
            : auth.canSubmit
              ? "Compile must complete first"
              : "Connect GitHub (public_repo) first"
        }
        style={primaryButtonStyle(submitEnabled && phase.kind !== "publishing")}
      >
        {phase.kind === "publishing" ? "Submitting..." : "Submit PR"}
      </button>

      {/* Confirmation dialog */}
      {phase.kind === "confirming" && (
        <div
          role="dialog"
          aria-label="Confirm pull request"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: "12px",
            background: "#0d1117",
            border: "1px solid #283040",
            borderRadius: 8,
          }}
        >
          <label htmlFor={branchId} style={labelStyle}>
            Branch name
          </label>
          <input
            id={branchId}
            type="text"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            style={inputStyle}
          />

          <label htmlFor={titleId} style={labelStyle}>
            PR title
          </label>
          <input
            id={titleId}
            type="text"
            value={prTitle}
            onChange={(e) => setPrTitle(e.target.value)}
            style={inputStyle}
          />

          <label htmlFor={bodyId} style={labelStyle}>
            PR description
          </label>
          <textarea
            id={bodyId}
            value={prBody}
            onChange={(e) => setPrBody(e.target.value)}
            rows={6}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "ui-monospace, monospace" }}
          />

          {/* Copyright attestation — MANDATORY manual gate (spec §12 /
              Scenario E). Unchecked by default; the confirm button stays
              disabled until the user actively checks it. */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <input
              id={attestId}
              type="checkbox"
              checked={attested}
              onChange={(e) => setAttested(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label htmlFor={attestId} style={{ fontSize: 12, color: "#e6edf3", lineHeight: 1.4 }}>
                {attestationLabel(copyrightHolder)}
              </label>
              {copyrightHolder === null && (
                <span style={{ fontSize: 11, color: "#9aa7b8" }}>
                  No copyright holder set — add one in identity for proper attribution.
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => void doPublish()}
              disabled={branchName.trim() === "" || prTitle.trim() === "" || !attested}
              style={primaryButtonStyle(
                branchName.trim() !== "" && prTitle.trim() !== "" && attested,
              )}
            >
              Confirm and submit
            </button>
            <button
              type="button"
              onClick={() => setPhase({ kind: "idle" })}
              style={secondaryButtonStyle()}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Status / result region */}
      <div aria-live="polite">
        {phase.kind === "success" && (
          <div style={{ fontSize: 13, color: "#7ee787" }}>
            Draft PR opened:{" "}
            <a
              href={phase.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#6ea8fe" }}
            >
              {phase.prUrl}
            </a>
          </div>
        )}
        {phase.kind === "error" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div role="alert" style={{ fontSize: 13, color: "#f0a0a0" }}>
              {phase.message}
            </div>
            {phase.showBranchField && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor={`${branchId}-retry`} style={labelStyle}>
                  Rename branch and retry
                </label>
                <input
                  id={`${branchId}-retry`}
                  type="text"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => void doPublish()}
                  disabled={branchName.trim() === "" || !attested}
                  style={primaryButtonStyle(branchName.trim() !== "" && attested)}
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
