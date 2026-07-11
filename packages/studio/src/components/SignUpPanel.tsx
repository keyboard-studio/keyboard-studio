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
// (GitHubSubmitPanel). Consumes useIdentitySession for the unified connect /
// link state and the single GLOBAL sign-out — Keyboard Studio is one account,
// so there is no per-provider sign-out here (the same model as ProfileScreen
// and AccountControl).

import { useIdentitySession } from "../hooks/useIdentitySession.ts";
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


const statusLineStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#7ee787",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const alertStyle: React.CSSProperties = { fontSize: 12, color: "#f0a0a0" };

/** "Signed in with Google as <name> (<email>)" — name falls back to email. */
function googleLabel(name: string | null, email: string | null): string {
  const display = name !== null && name.length > 0 ? name : (email ?? "");
  return display.length > 0 ? `Signed in with Google as ${display}` : "Signed in with Google";
}

export function SignUpPanel() {
  const { isVerifying, github, google, signOut } = useIdentitySession();

  // Verifying state: show interim while the GitHub token is being checked, so we
  // don't flash the signed-out sign-up state for a returning user.
  if (isVerifying) {
    return (
      <section aria-label="Account" style={sectionStyle}>
        <div style={labelStyle}>Account</div>
        <div role="status" aria-live="polite" style={{ fontSize: 13, color: "#9aa7b8" }}>
          Checking GitHub sign-in...
        </div>
      </section>
    );
  }

  // Keyboard Studio is one account — sign-out is global (it clears both
  // providers), never per-provider. Providers can only be linked or unlinked
  // together. Below: identity lines for whatever is linked, sign-up buttons for
  // whatever is not, and exactly one "Sign out" once any provider is linked.
  if (github.linked || google.linked) {
    return (
      <section aria-label="Account" style={sectionStyle}>
        <div style={labelStyle}>Account</div>

        {github.linked ? (
          <div role="status" style={statusLineStyle}>
            <GitHubMark /> Signed up with GitHub{github.login !== null ? ` as ${github.login}` : ""}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { void github.connect("identity"); }}
            aria-label="Sign up with GitHub"
            style={githubButtonStyle(true)}
          >
            <GitHubMark />
            Sign up with GitHub
          </button>
        )}

        {google.linked ? (
          <div role="status" style={statusLineStyle}>
            <GoogleMark /> {googleLabel(google.name, google.email)}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { void google.connect(); }}
            aria-label="Sign up with Google"
            style={googleButtonStyle(true)}
          >
            <GoogleMark />
            Sign up with Google
          </button>
        )}

        <button type="button" onClick={signOut} style={secondaryButtonStyle}>
          Sign out
        </button>

        {github.error !== null && (
          <div role="alert" style={alertStyle}>
            {github.error}
          </div>
        )}
        {google.error !== null && (
          <div role="alert" style={alertStyle}>
            {google.error}
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
        onClick={() => { void github.connect("identity"); }}
        aria-label="Sign up with GitHub"
        style={githubButtonStyle(true)}
      >
        <GitHubMark />
        Sign up with GitHub
      </button>

      <button
        type="button"
        onClick={() => { void google.connect(); }}
        aria-label="Sign up with Google"
        style={googleButtonStyle(true)}
      >
        <GoogleMark />
        Sign up with Google
      </button>

      {github.error !== null && (
        <div role="alert" style={alertStyle}>
          {github.error}
        </div>
      )}
      {google.error !== null && (
        <div role="alert" style={alertStyle}>
          {google.error}
        </div>
      )}
    </section>
  );
}
