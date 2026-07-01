// ProfileScreen — account management page (proposal §A.5).
//
// Left-column layout: a large avatar + username anchor the top-left, and the
// provider controls (GitHub / Google) and the "My keyboards" entry stack
// directly beneath the avatar as buttons. A single global "Sign out" button
// sits at the bottom — Keyboard Studio is one account, so there is no
// per-provider sign-out; providers can only be linked.

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

const AVATAR_SIZE = 96;

// The left column that holds the avatar, provider buttons and "My keyboards".
const COLUMN_WIDTH = 280;

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
  gap: 28,
};

const columnStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: 24,
  width: COLUMN_WIDTH,
  maxWidth: "100%",
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

// Base look shared by every button in the left column: full-width, bordered,
// with an icon slot on the left. This is what gives the provider controls a
// "button" feel rather than the old inline-link look.
const columnButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 16px",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  fontFamily: FONT,
  textAlign: "left",
  background: BG_CARD,
  color: TEXT_MAIN,
  border: `1px solid ${BORDER}`,
  cursor: "pointer",
};

// A linked provider is not actionable — render it as a static, filled chip that
// still reads as a button but carries no pointer affordance.
const linkedProviderStyle: React.CSSProperties = {
  ...columnButtonStyle,
  cursor: "default",
  borderColor: ACCENT,
};

// The connect action gets the accent treatment so it reads as the primary CTA.
const connectProviderStyle: React.CSSProperties = {
  ...columnButtonStyle,
  background: ACCENT,
  color: "#0d1117",
  borderColor: ACCENT,
};

const providerLabelStyle: React.CSSProperties = {
  color: TEXT_DIM,
  fontWeight: 600,
};

const providerValueStyle: React.CSSProperties = {
  color: TEXT_MAIN,
  fontWeight: 700,
};

// "My keyboards" — a disabled, non-functional entry with a coming-soon caption.
const myKeyboardsStyle: React.CSSProperties = {
  ...columnButtonStyle,
  opacity: 0.6,
};

const comingSoonStyle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 12,
  color: TEXT_DIM,
  fontFamily: FONT,
  fontStyle: "italic",
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
      {/* Left column — avatar + username, then the provider + "My keyboards" buttons */}
      <div style={columnStyle}>
        {/* Avatar + username */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={avatarStyle} aria-hidden="true">
            {initial ?? "?"}
          </div>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "1.5rem",
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
                fontSize: 13,
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

        {/* Provider buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* GitHub */}
          {github.linked ? (
            <div style={linkedProviderStyle}>
              <GitHubMark />
              <span style={providerLabelStyle}>GitHub</span>
              <span style={{ ...providerValueStyle, marginLeft: "auto" }}>
                {github.login ?? "Connected"}
              </span>
            </div>
          ) : (
            <button
              type="button"
              style={connectProviderStyle}
              aria-label="Link GitHub"
              onClick={() => { void github.connect(); }}
            >
              <GitHubMark />
              <span>Link GitHub</span>
            </button>
          )}

          {/* Google */}
          {google.linked ? (
            <div style={linkedProviderStyle}>
              <GoogleMark />
              <span style={providerLabelStyle}>Google</span>
              <span style={{ ...providerValueStyle, marginLeft: "auto" }}>
                {google.name !== null && google.name.length > 0
                  ? google.name
                  : (google.email ?? "Connected")}
              </span>
            </div>
          ) : (
            <button
              type="button"
              style={connectProviderStyle}
              aria-label="Link Google"
              onClick={() => { void google.connect(); }}
            >
              <GoogleMark />
              <span>Link Google</span>
            </button>
          )}

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

        {/* My keyboards — non-functional placeholder */}
        <div>
          <button
            type="button"
            style={myKeyboardsStyle}
            disabled
          >
            <span>My keyboards</span>
          </button>
          <p style={comingSoonStyle}>Coming soon. It&rsquo;s non-functional.</p>
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
