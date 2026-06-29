// ProfileScreen — account management page (proposal §A.5).
//
// Top-left focused layout: a large avatar + username anchor the top-left of the
// screen, with the linked-provider details (GitHub / Google) on the right. A
// single global "Sign out" button sits at the bottom — Keyboard Studio is one
// account, so there is no per-provider sign-out; providers can only be linked.

import { useIdentitySession } from "../hooks/useIdentitySession.ts";
import { navigateTo } from "../lib/navigate.ts";
import {
  BG_PAGE,
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

const AVATAR_SIZE = 96;

const pageStyle: React.CSSProperties = {
  background: BG_PAGE,
  height: "100%",
  boxSizing: "border-box",
  fontFamily: FONT,
  color: TEXT_MAIN,
  padding: "48px 56px",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 40,
};

const avatarStyle: React.CSSProperties = {
  width: AVATAR_SIZE,
  height: AVATAR_SIZE,
  borderRadius: "50%",
  background: ACCENT,
  color: "#0d1117",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  fontFamily: FONT,
  fontSize: 44,
  fontWeight: 700,
  lineHeight: 1,
  userSelect: "none",
};

// Neutral dim circle shown during the initial token-verify pass — mirrors
// AccountControl's placeholder so a returning user does not flash the "Guest"
// state before the GitHub token round-trip resolves.
const verifyingAvatarStyle: React.CSSProperties = {
  width: AVATAR_SIZE,
  height: AVATAR_SIZE,
  borderRadius: "50%",
  background: "#283040",
  flexShrink: 0,
};

const providerLineStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 15,
  color: TEXT_DIM,
  fontFamily: FONT,
};

const providerValueStyle: React.CSSProperties = {
  color: TEXT_MAIN,
  fontWeight: 700,
};

/** Bold value styled as an inline link — used for "link google" / "link github". */
const linkValueStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  margin: 0,
  font: "inherit",
  fontWeight: 700,
  color: ACCENT,
  cursor: "pointer",
  textDecoration: "underline",
};

const errorStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.5,
  color: ERROR_TEXT,
  fontFamily: FONT,
};

const signOutStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  padding: "10px 22px",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: FONT,
  background: "transparent",
  color: TEXT_MAIN,
  border: `1px solid ${BORDER}`,
};

const backLinkStyle: React.CSSProperties = {
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
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProfileScreen() {
  const { isSignedIn, isVerifying, displayName, initial, github, google, signOut } =
    useIdentitySession();

  // During the initial token-verify pass we cannot yet know whether the user is
  // signed in, so render a neutral placeholder rather than flashing the "Guest"
  // state and the link controls before the GitHub token round-trip resolves.
  if (isVerifying) {
    return (
      <main aria-label="Account profile" style={pageStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={verifyingAvatarStyle} aria-hidden="true" />
          <div
            role="status"
            aria-live="polite"
            style={{ fontSize: 15, color: TEXT_DIM, fontFamily: FONT }}
          >
            Checking sign-in&hellip;
          </div>
        </div>
      </main>
    );
  }

  return (
    <main aria-label="Account profile" style={pageStyle}>
      {/* Top row — avatar + username on the left, provider details on the right */}
      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 32,
          flexWrap: "wrap",
        }}
      >
        {/* Left: large avatar + username */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={avatarStyle} aria-hidden="true">
            {initial ?? "?"}
          </div>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "1.8rem",
                fontWeight: 700,
                color: TEXT_MAIN,
                fontFamily: FONT,
              }}
            >
              {displayName ?? "Guest"}
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
                ? "Keyboard Studio account"
                : "Sign in to save and submit keyboards"}
            </p>
          </div>
        </div>

        {/* Right: GitHub / Google details */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* GitHub line */}
          <div style={providerLineStyle}>
            <GitHubMark />
            <span>github:</span>
            {github.linked ? (
              <span style={providerValueStyle}>{github.login ?? "Connected"}</span>
            ) : (
              <button
                type="button"
                style={linkValueStyle}
                aria-label="Link GitHub"
                onClick={() => { void github.connect("identity"); }}
              >
                link github
              </button>
            )}
          </div>

          {/* Google line */}
          <div style={providerLineStyle}>
            <GoogleMark />
            <span>google:</span>
            {google.linked ? (
              <span style={providerValueStyle}>
                {google.name !== null && google.name.length > 0
                  ? google.name
                  : (google.email ?? "Connected")}
              </span>
            ) : (
              <button
                type="button"
                style={linkValueStyle}
                aria-label="Link Google"
                onClick={() => { void google.connect(); }}
              >
                link google
              </button>
            )}
          </div>

          {github.error !== null && (
            <p role="alert" style={errorStyle}>
              {github.error}
            </p>
          )}
          {google.error !== null && (
            <p role="alert" style={errorStyle}>
              {google.error}
            </p>
          )}
        </div>
      </div>

      {/* Bottom — back link, then the single global Sign out button */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: "auto" }}>
        <button
          type="button"
          style={backLinkStyle}
          onClick={() => navigateTo("survey")}
        >
          &larr; Back to studio
        </button>

        {isSignedIn && (
          <button
            type="button"
            style={signOutStyle}
            onClick={signOut}
          >
            Sign out
          </button>
        )}
      </div>
    </main>
  );
}
