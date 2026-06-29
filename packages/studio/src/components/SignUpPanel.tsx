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
import { GitHubMark, GoogleMark } from "./ProviderMarks.tsx";

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
