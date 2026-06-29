// ProfileScreen — account management page (proposal §A.5).
//
// Full-screen centered card matching WelcomeScreen styling. Shows linked
// provider status and lets the user connect or disconnect each provider.
// "Link GitHub" is highlighted as the preferred provider since fork+PR
// delivery (§12) requires it.

import { useIdentitySession } from "../hooks/useIdentitySession.ts";
import { navigateTo } from "../lib/navigate.ts";
import {
  BG_PAGE,
  BG_CARD,
  BORDER,
  ACCENT,
  TEXT_DIM,
  TEXT_MAIN,
  FONT,
} from "../lib/galleryTheme.ts";
import { ERROR_TEXT } from "../ui/theme.ts";
import { GitHubMark, GoogleMark } from "./ProviderMarks.tsx";

// ---------------------------------------------------------------------------
// Shared style helpers
// ---------------------------------------------------------------------------

const githubPrimaryStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "9px 18px",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: FONT,
  background: "#238636",
  color: "#e6edf3",
  border: "1px solid #2ea043",
  whiteSpace: "nowrap",
};

const googlePrimaryStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "9px 18px",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: FONT,
  background: "#1a73e8",
  color: "#ffffff",
  border: "1px solid #1a73e8",
  whiteSpace: "nowrap",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: FONT,
  background: "transparent",
  color: TEXT_DIM,
  border: `1px solid ${BORDER}`,
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const providerRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "14px 16px",
  background: "#0d1117",
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
};

const providerLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  fontWeight: 600,
  color: TEXT_MAIN,
  fontFamily: FONT,
  flexShrink: 0,
  minWidth: 100,
};

const connectedInfoStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
};

const connectedNameStyle: React.CSSProperties = {
  fontSize: 13,
  color: TEXT_MAIN,
  fontFamily: FONT,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const connectedSubStyle: React.CSSProperties = {
  fontSize: 12,
  color: TEXT_DIM,
  fontFamily: FONT,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  marginTop: 2,
};

const errorStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.5,
  color: ERROR_TEXT,
  fontFamily: FONT,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProfileScreen() {
  const { isSignedIn, displayName, github, google } = useIdentitySession();

  return (
    <main
      aria-label="Account profile"
      style={{
        background: BG_PAGE,
        height: "100%",
        boxSizing: "border-box",
        fontFamily: FONT,
        color: TEXT_MAIN,
        padding: "24px 32px",
        overflowY: "auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: "32px 36px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* Heading */}
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "1.4rem",
              fontWeight: 600,
              color: ACCENT,
              fontFamily: FONT,
            }}
          >
            Your account
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 14,
              color: TEXT_DIM,
              fontFamily: FONT,
            }}
          >
            {isSignedIn
              ? (displayName !== null ? displayName : "Signed in")
              : "Guest — sign in to save and submit keyboards"}
          </p>
        </div>

        {/* Provider rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* GitHub row */}
          <div style={providerRowStyle}>
            <div style={providerLabelStyle}>
              <GitHubMark />
              GitHub
            </div>

            {github.linked ? (
              <>
                <div style={connectedInfoStyle}>
                  <div style={connectedNameStyle}>
                    {github.login ?? "Connected"}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Sign out of GitHub"
                  style={secondaryButtonStyle}
                  onClick={() => github.disconnect()}
                >
                  Sign out
                </button>
              </>
            ) : (
              <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  style={githubPrimaryStyle}
                  onClick={() => { void github.connect(); }}
                >
                  Link GitHub
                </button>
              </div>
            )}
          </div>

          {github.error !== null && (
            <p role="alert" style={errorStyle}>
              {github.error}
            </p>
          )}

          {/* Google row */}
          <div style={providerRowStyle}>
            <div style={providerLabelStyle}>
              <GoogleMark />
              Google
            </div>

            {google.linked ? (
              <>
                <div style={connectedInfoStyle}>
                  {google.name !== null && (
                    <div style={connectedNameStyle}>{google.name}</div>
                  )}
                  {google.email !== null && (
                    <div style={connectedSubStyle}>{google.email}</div>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Sign out of Google"
                  style={secondaryButtonStyle}
                  onClick={() => google.disconnect()}
                >
                  Sign out
                </button>
              </>
            ) : (
              <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  style={googlePrimaryStyle}
                  onClick={() => { void google.connect(); }}
                >
                  Link Google account
                </button>
              </div>
            )}
          </div>

          {google.error !== null && (
            <p role="alert" style={errorStyle}>
              {google.error}
            </p>
          )}
        </div>

        {/* Note */}
        <p
          style={{
            margin: 0,
            fontSize: 12,
            lineHeight: 1.6,
            color: TEXT_DIM,
            fontFamily: FONT,
          }}
        >
          One Keyboard Studio account can link both — GitHub is preferred (needed
          to submit your keyboard via fork + pull request).
        </p>

        {/* Back link */}
        <button
          type="button"
          style={{
            alignSelf: "flex-start",
            padding: "7px 16px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: FONT,
            background: "transparent",
            color: TEXT_DIM,
            border: `1px solid ${BORDER}`,
          }}
          onClick={() => navigateTo("survey")}
        >
          &larr; Back to studio
        </button>
      </div>
    </main>
  );
}
