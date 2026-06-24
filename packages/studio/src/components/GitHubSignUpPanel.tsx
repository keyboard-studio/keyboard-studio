// GitHubSignUpPanel — the decoupled "Sign up with GitHub" control on the
// Output screen.
//
// Per docs/github-integration.md §1a, sign-up is a guest-first, DEFERRED
// IDENTITY step: it establishes who the user is and nothing more. This panel
// does NOT fork, branch, open a pull request, or call publishPR — that
// submission step is separate and decoupled (it defaults to the org-mediated
// path). This is the §1 north star in UI form: "a GitHub login is acceptable;
// a GitHub workflow is not" — the user never sees a branch or PR here.
//
// Replaces the older coupled "Connect GitHub + Submit PR" panel
// (GitHubSubmitPanel). Reuses the existing useGitHubAuth hook for the OAuth
// connect/disconnect lifecycle — no new auth plumbing.

import { useCallback } from "react";
import { useGitHubAuth } from "../hooks/useGitHubAuth.ts";

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

const disabledButtonStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 16px",
  background: "#161b22",
  color: "#484f58",
  border: "1px solid #283040",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: "not-allowed",
  fontFamily: FONT,
};

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

export function GitHubSignUpPanel() {
  const { status, login, error, connect, disconnect } = useGitHubAuth();

  const onSignUp = useCallback(() => {
    void connect();
  }, [connect]);

  // "connected" and "needs-scope" both mean a GitHub identity is established —
  // which is all sign-up cares about. (The missing-scope distinction matters
  // only for the later submit step, which is decoupled from sign-up.)
  const signedIn = status === "connected" || status === "needs-scope";

  if (signedIn) {
    return (
      <section aria-label="Account" style={sectionStyle}>
        <div style={labelStyle}>Account</div>
        <div
          role="status"
          style={{ fontSize: 13, color: "#7ee787", display: "flex", alignItems: "center", gap: 8 }}
        >
          <GitHubMark /> Signed up with GitHub{login !== null ? ` as ${login}` : ""}
        </div>
        <button type="button" onClick={disconnect} style={secondaryButtonStyle}>
          Sign out
        </button>
      </section>
    );
  }

  // Token present but still being verified on mount — neutral interim state.
  if (status === "verifying") {
    return (
      <section aria-label="Account" style={sectionStyle}>
        <div style={labelStyle}>Account</div>
        <div role="status" aria-live="polite" style={{ fontSize: 13, color: "#9aa7b8" }}>
          Checking GitHub sign-in…
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Submit your keyboard" style={sectionStyle}>
      <div style={labelStyle}>Submit your keyboard</div>
      <p style={{ margin: 0, fontSize: 12, color: "#9aa7b8", lineHeight: 1.5 }}>
        Sign up to submit your keyboard to the community repository. We handle
        the technical side — you just choose how to sign in.
      </p>

      <button
        type="button"
        onClick={onSignUp}
        aria-label="Sign up with GitHub"
        style={githubButtonStyle(true)}
      >
        <GitHubMark />
        Sign up with GitHub
      </button>

      {/* Google sign-up — placeholder; Google OAuth backend not built yet
          (docs/github-integration.md §5 Q5). Disabled until that lands. */}
      <button
        type="button"
        disabled
        aria-label="Sign up with Google (coming soon)"
        title="Coming soon"
        style={disabledButtonStyle}
      >
        Sign up with Google (coming soon)
      </button>

      {status === "error" && error !== null && (
        <div role="alert" style={{ fontSize: 12, color: "#f0a0a0" }}>
          {error}
        </div>
      )}
    </section>
  );
}
