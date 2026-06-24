// SignUpPanel — the decoupled "Sign up with GitHub / Google" control on
// the Output screen.
//
// Per docs/github-integration.md §1a, sign-up is a guest-first, DEFERRED
// IDENTITY step: it establishes who the user is and nothing more. This panel
// does NOT fork, branch, open a pull request, or call publishPR — that
// submission step is separate and decoupled (it defaults to the org-mediated
// path). This is the §1 north star in UI form: "a GitHub login is acceptable;
// a GitHub workflow is not" — the user never sees a branch or PR here.
//
// Option A gating note: Option A (fork+PR) requires a GitHub token. For a
// Google-only session, provider === "google" and Option A affordances
// elsewhere in the UI should be disabled with a "Connect GitHub to use this
// option" prompt. The Google identity is clearly marked provider:"google" via
// the IdentitySession union in src/lib/identity.ts — other UI components gate
// off that discriminant.
//
// Replaces the older coupled "Connect GitHub + Submit PR" panel
// (GitHubSubmitPanel). Reuses the existing useGitHubAuth hook for the OAuth
// connect/disconnect lifecycle — no new auth plumbing.

import { useCallback } from "react";
import { useGitHubAuth } from "../hooks/useGitHubAuth.ts";
import { useGoogleAuth } from "../hooks/useGoogleAuth.ts";

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const sectionStyle: React.CSSProperties = {
  marginTop: 16,
  paddingTop: 16,
  borderTop: "1px solid #283040",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  alignItems: "flex-start",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#7ee787",
  fontWeight: 700,
};

function githubButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    alignSelf: "flex-start",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 16px",
    background: enabled ? "#238636" : "#161b22",
    color: enabled ? "#e6edf3" : "#484f58",
    border: "1px solid #2ea043",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: enabled ? "pointer" : "not-allowed",
    fontFamily: FONT,
    transition: "background 0.15s",
  };
}

function googleButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    alignSelf: "flex-start",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 16px",
    background: enabled ? "#1a73e8" : "#161b22",
    color: enabled ? "#ffffff" : "#484f58",
    border: enabled ? "1px solid #1a73e8" : "1px solid #283040",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: enabled ? "pointer" : "not-allowed",
    fontFamily: FONT,
    transition: "background 0.15s",
  };
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  background: "transparent",
  color: "#9aa7b8",
  border: "1px solid #283040",
  borderRadius: 6,
  fontSize: 12,
  cursor: "pointer",
  fontFamily: FONT,
};

/** GitHub mark — inline SVG so no external asset / CSP request is needed. */
function GitHubMark() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/**
 * Google "G" glyph — inline SVG so no external asset / CSP / network request
 * is needed. Uses the official Google brand colours.
 */
function GoogleMark() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function SignUpPanel() {
  const { status: ghStatus, login, error: ghError, connect: ghConnect, disconnect: ghDisconnect } =
    useGitHubAuth();
  const { status: googleStatus, identity: googleIdentity, error: googleError, connect: googleConnect, disconnect: googleDisconnect } =
    useGoogleAuth();

  const onGitHubSignUp = useCallback(() => {
    void ghConnect();
  }, [ghConnect]);

  const onGoogleSignUp = useCallback(() => {
    void googleConnect();
  }, [googleConnect]);

  // "connected" and "needs-scope" both mean a GitHub identity is established —
  // which is all sign-up cares about. (The missing-scope distinction matters
  // only for the later submit step, which is decoupled from sign-up.)
  const ghSignedIn = ghStatus === "connected" || ghStatus === "needs-scope";
  const googleSignedIn = googleStatus === "connected";

  // If both identities are established, show both connected states.
  // If only one is established, show the connected state + the other sign-in button.
  // Verifying state: show interim while GitHub token is being checked.
  if (ghStatus === "verifying") {
    return (
      <section aria-label="Account" style={sectionStyle}>
        <div style={labelStyle}>Account</div>
        <div role="status" aria-live="polite" style={{ fontSize: 13, color: "#9aa7b8" }}>
          Checking GitHub sign-in...
        </div>
      </section>
    );
  }

  // Both signed in — show both identities with sign-out for each.
  if (ghSignedIn && googleSignedIn && googleIdentity !== null) {
    return (
      <section aria-label="Account" style={sectionStyle}>
        <div style={labelStyle}>Account</div>
        <div
          role="status"
          style={{ fontSize: 13, color: "#7ee787", display: "flex", alignItems: "center", gap: 8 }}
        >
          <GitHubMark /> Signed up with GitHub{login !== null ? ` as ${login}` : ""}
        </div>
        <button type="button" onClick={ghDisconnect} style={secondaryButtonStyle}>
          Sign out of GitHub
        </button>
        <div
          role="status"
          style={{ fontSize: 13, color: "#7ee787", display: "flex", alignItems: "center", gap: 8 }}
        >
          <GoogleMark /> Signed in with Google as {googleIdentity.name} ({googleIdentity.email})
        </div>
        <button type="button" onClick={googleDisconnect} style={secondaryButtonStyle}>
          Sign out of Google
        </button>
      </section>
    );
  }

  // GitHub only signed in.
  if (ghSignedIn) {
    return (
      <section aria-label="Account" style={sectionStyle}>
        <div style={labelStyle}>Account</div>
        <div
          role="status"
          style={{ fontSize: 13, color: "#7ee787", display: "flex", alignItems: "center", gap: 8 }}
        >
          <GitHubMark /> Signed up with GitHub{login !== null ? ` as ${login}` : ""}
        </div>
        <button type="button" onClick={ghDisconnect} style={secondaryButtonStyle}>
          Sign out
        </button>
        <button
          type="button"
          onClick={onGoogleSignUp}
          aria-label="Sign up with Google"
          style={googleButtonStyle(true)}
        >
          <GoogleMark />
          Sign up with Google
        </button>
        {googleError !== null && (
          <div role="alert" style={{ fontSize: 12, color: "#f0a0a0" }}>
            {googleError}
          </div>
        )}
      </section>
    );
  }

  // Google only signed in.
  if (googleSignedIn && googleIdentity !== null) {
    return (
      <section aria-label="Account" style={sectionStyle}>
        <div style={labelStyle}>Account</div>
        <div
          role="status"
          style={{ fontSize: 13, color: "#7ee787", display: "flex", alignItems: "center", gap: 8 }}
        >
          <GoogleMark /> Signed in with Google as {googleIdentity.name} ({googleIdentity.email})
        </div>
        <button type="button" onClick={googleDisconnect} style={secondaryButtonStyle}>
          Sign out
        </button>
        <button
          type="button"
          onClick={onGitHubSignUp}
          aria-label="Sign up with GitHub"
          style={githubButtonStyle(true)}
        >
          <GitHubMark />
          Sign up with GitHub
        </button>
        {ghError !== null && (
          <div role="alert" style={{ fontSize: 12, color: "#f0a0a0" }}>
            {ghError}
          </div>
        )}
      </section>
    );
  }

  // Neither signed in — show both sign-in buttons.
  return (
    <section aria-label="Submit your keyboard" style={sectionStyle}>
      <div style={labelStyle}>Submit your keyboard</div>
      <p style={{ margin: 0, fontSize: 12, color: "#9aa7b8", lineHeight: 1.5 }}>
        Sign up to submit your keyboard to the community repository. We handle
        the technical side — you just choose how to sign in.
      </p>

      <button
        type="button"
        onClick={onGitHubSignUp}
        aria-label="Sign up with GitHub"
        style={githubButtonStyle(true)}
      >
        <GitHubMark />
        Sign up with GitHub
      </button>

      <button
        type="button"
        onClick={onGoogleSignUp}
        aria-label="Sign up with Google"
        style={googleButtonStyle(true)}
      >
        <GoogleMark />
        Sign up with Google
      </button>

      {ghError !== null && (
        <div role="alert" style={{ fontSize: 12, color: "#f0a0a0" }}>
          {ghError}
        </div>
      )}
      {googleError !== null && (
        <div role="alert" style={{ fontSize: 12, color: "#f0a0a0" }}>
          {googleError}
        </div>
      )}
    </section>
  );
}
