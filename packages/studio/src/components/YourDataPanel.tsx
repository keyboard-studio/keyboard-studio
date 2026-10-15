// YourDataPanel — the self-service half of specs 097/098, on the
// profile screen under My keyboards.
//
// Two actions, both against the drafts API with the caller's own
// session token (the server keys everything to the verified identity):
//   • Export my server data — GET /drafts/export, saved as a JSON file.
//     This is the Art. 15 copy for everything the server holds, without
//     filing a request.
//   • Delete all my server data — DELETE /drafts?all=true. The confirm
//     step separates the three cases the erasure procedure keeps apart
//     (spec 098): what this deletes now, what never left the device,
//     and what is public and not ours to retract. A failed deletion is
//     reported as failed — never dressed as success.
//
// Guests get the honest version of the same facts: nothing is stored
// on our servers for them at all.

import { useEffect, useRef, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";

import { useGitHubAuth } from "../hooks/useGitHubAuth.ts";
import { deleteAllServerDrafts, exportServerData } from "../lib/serverDraftStore.ts";
import { PrivacyLink } from "./PrivacyScreen.tsx";
import { BORDER, FONT, TEXT_DIM, TEXT_MAIN } from "../ui/theme.ts";

const sectionStyle: React.CSSProperties = {
  borderTop: `1px solid ${BORDER}`,
  paddingTop: 16,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  fontFamily: FONT,
};

const headingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: TEXT_DIM,
  fontWeight: 700,
};

const bodyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.5,
  color: TEXT_MAIN,
};

const buttonStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid ${BORDER}`,
  background: "transparent",
  color: TEXT_MAIN,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: FONT,
};

const dangerButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  borderColor: "var(--app-danger-text)",
  color: "var(--app-danger-text)",
};

type DeleteState =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "working" }
  | { kind: "done"; deleted: number }
  | { kind: "error" };

type ExportState = { kind: "idle" } | { kind: "working" } | { kind: "done" } | { kind: "error" };

export function YourDataPanel() {
  const { t } = useLingui();
  const { status: ghStatus, token } = useGitHubAuth();
  const isSignedIn = ghStatus === "connected" || ghStatus === "needs-scope";
  const accessToken = token?.accessToken ?? null;

  const [exportState, setExportState] = useState<ExportState>({ kind: "idle" });
  const [deleteState, setDeleteState] = useState<DeleteState>({ kind: "idle" });
  // Guards against setting state after unmount (MyKeyboardsList's idiom).
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  async function handleExport(): Promise<void> {
    if (accessToken === null) return;
    setExportState({ kind: "working" });
    const data = await exportServerData(accessToken);
    if (!mountedRef.current) return;
    if (data === null) {
      setExportState({ kind: "error" });
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "keyboard-studio-export.json";
    a.click();
    URL.revokeObjectURL(url);
    setExportState({ kind: "done" });
  }

  async function handleDeleteAll(): Promise<void> {
    if (accessToken === null) return;
    setDeleteState({ kind: "working" });
    const deleted = await deleteAllServerDrafts(accessToken);
    if (!mountedRef.current) return;
    if (deleted < 0) setDeleteState({ kind: "error" });
    else setDeleteState({ kind: "done", deleted });
  }

  return (
    <section
      aria-label={t({ id: "profile.yourData.ariaLabel", message: "Your data" })}
      style={sectionStyle}
    >
      <h2 style={headingStyle}>
        <Trans id="profile.yourData.heading">Your data</Trans>
      </h2>

      {!isSignedIn || accessToken === null ? (
        <p style={bodyStyle}>
          <Trans id="profile.yourData.guest">
            You are browsing as a guest, so our servers hold nothing for you — your drafts live
            only in this browser. What changes if you sign in is explained in the privacy
            notice.
          </Trans>{" "}
          <PrivacyLink />
        </p>
      ) : (
        <>
          <p style={bodyStyle}>
            <Trans id="profile.yourData.intro">
              Everything our servers hold for you is your saved drafts. Take a copy, or delete
              all of it — both happen immediately, no request needed.
            </Trans>
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              style={buttonStyle}
              disabled={exportState.kind === "working"}
              onClick={() => {
                void handleExport();
              }}
            >
              <Trans id="profile.yourData.export">Export my server data</Trans>
            </button>
            <button
              type="button"
              style={dangerButtonStyle}
              disabled={deleteState.kind === "working"}
              onClick={() => setDeleteState({ kind: "confirming" })}
            >
              <Trans id="profile.yourData.deleteAll">Delete all my server data</Trans>
            </button>
          </div>

          {exportState.kind === "error" && (
            <p role="alert" style={{ ...bodyStyle, color: "var(--app-danger-text)" }}>
              <Trans id="profile.yourData.exportError">
                The export failed — nothing was downloaded. Please try again, or contact us
                through the privacy notice and we will supply your data within one month.
              </Trans>
            </p>
          )}

          {deleteState.kind === "confirming" && (
            <div
              style={{
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <p style={bodyStyle}>
                <Trans id="profile.yourData.confirm.deleted">
                  <strong>Deleted now:</strong> every draft saved on our servers, content and
                  index together. This cannot be undone.
                </Trans>
              </p>
              <p style={bodyStyle}>
                <Trans id="profile.yourData.confirm.local">
                  <strong>Never left your device:</strong> drafts in this browser stay here —
                  delete them from My keyboards or clear this site&rsquo;s browser data.
                </Trans>
              </p>
              <p style={bodyStyle}>
                <Trans id="profile.yourData.confirm.public">
                  <strong>Public already:</strong> keyboards you submitted are public pull
                  requests; submitted work is not ours to retract, and merged submissions are
                  part of the public record. Crash reports contain no identity.
                </Trans>
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  style={dangerButtonStyle}
                  onClick={() => {
                    void handleDeleteAll();
                  }}
                >
                  <Trans id="profile.yourData.confirm.yes">Yes, delete all my server data</Trans>
                </button>
                <button
                  type="button"
                  style={buttonStyle}
                  onClick={() => setDeleteState({ kind: "idle" })}
                >
                  <Trans id="profile.yourData.confirm.no">Keep my data</Trans>
                </button>
              </div>
            </div>
          )}

          {deleteState.kind === "done" && (
            <p role="status" style={bodyStyle}>
              {deleteState.deleted === 1 ? (
                <Trans id="profile.yourData.done.one">Deleted 1 server draft.</Trans>
              ) : (
                <Trans id="profile.yourData.done.many">
                  Deleted {deleteState.deleted} server drafts.
                </Trans>
              )}
            </p>
          )}
          {deleteState.kind === "error" && (
            <p role="alert" style={{ ...bodyStyle, color: "var(--app-danger-text)" }}>
              <Trans id="profile.yourData.deleteError">
                The deletion failed — your server data is still there. Please try again, or
                contact us through the privacy notice and we will delete it for you.
              </Trans>
            </p>
          )}
        </>
      )}
    </section>
  );
}
