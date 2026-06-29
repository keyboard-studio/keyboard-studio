// WelcomeScreen — brief first-visit landing (proposal §A.6).
//
// Two paths:
//   • Sign in (returning user) — GitHub or Google. In OAuth, "sign in" and
//     "sign up" are the same connect() call; the provider decides whether the
//     user is new or returning. So these reuse the existing useGitHubAuth /
//     useGoogleAuth connect() — no new auth plumbing (see SignUpPanel.tsx).
//   • "I'm new" → navigateTo('survey') (fresh start).
//
// Deliberately plain: a centered card, a heading, three buttons. No gradients
// or marketing chrome. Provider buttons mirror SignUpPanel's brand styling.

import { useGitHubAuth } from "../hooks/useGitHubAuth.ts";
import { useGoogleAuth } from "../hooks/useGoogleAuth.ts";
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
import { GitHubMark, GoogleMark } from "./ProviderMarks.tsx";

const providerButtonBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "12px 24px",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: FONT,
};

const githubButtonStyle: React.CSSProperties = {
  ...providerButtonBase,
  background: "#238636",
  color: "#e6edf3",
  border: "1px solid #2ea043",
};

const googleButtonStyle: React.CSSProperties = {
  ...providerButtonBase,
  background: "#1a73e8",
  color: "#ffffff",
  border: "1px solid #1a73e8",
};

export function WelcomeScreen() {
  const { connect: ghConnect, error: ghError } = useGitHubAuth();
  const { connect: googleConnect, error: googleError } = useGoogleAuth();

  return (
    <div
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
          maxWidth: 480,
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: "32px 36px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          textAlign: "center",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "1.5rem",
            fontWeight: 600,
            color: ACCENT,
            fontFamily: FONT,
          }}
        >
          Welcome to Keyboard Studio
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: 14,
            lineHeight: 1.6,
            color: TEXT_DIM,
            fontFamily: FONT,
          }}
        >
          Design and ship a Keyman keyboard, right in your browser.
        </p>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            marginTop: 4,
          }}
        >
          <button
            type="button"
            onClick={() => {
              void ghConnect();
            }}
            style={githubButtonStyle}
          >
            <GitHubMark />
            Sign in with GitHub
          </button>

          <button
            type="button"
            onClick={() => {
              void googleConnect();
            }}
            style={googleButtonStyle}
          >
            <GoogleMark />
            Sign in with Google
          </button>

          <button
            type="button"
            onClick={() => navigateTo("survey")}
            style={{
              ...providerButtonBase,
              background: "transparent",
              border: `1px solid ${BORDER}`,
              color: TEXT_MAIN,
            }}
          >
            I&rsquo;m new
          </button>
        </div>

        {ghError !== null && (
          <p
            role="alert"
            style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "#f0a0a0", fontFamily: FONT }}
          >
            {ghError}
          </p>
        )}
        {googleError !== null && (
          <p
            role="alert"
            style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "#f0a0a0", fontFamily: FONT }}
          >
            {googleError}
          </p>
        )}
      </div>
    </div>
  );
}
