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

import { Trans, useLingui } from "@lingui/react/macro";
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

// Both provider buttons are always rendered enabled (no disabled call site
// exists in this file), so these are plain style constants rather than
// functions parameterized on an `enabled` flag that is never false.
const githubButtonStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 16px",
  background: "#238636",
  color: "#e6edf3",
  border: "1px solid #2ea043",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: FONT,
  transition: "background 0.15s",
};

const googleButtonStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 16px",
  background: "#1a73e8",
  color: "#ffffff",
  border: "1px solid #1a73e8",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: FONT,
  transition: "background 0.15s",
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


const statusLineStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#7ee787",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const alertStyle: React.CSSProperties = { fontSize: 12, color: "#f0a0a0" };

export function SignUpPanel() {
  const { t } = useLingui();
  const { isVerifying, github, google, signOut } = useIdentitySession();

  const accountAriaLabel = t({ id: "output.identity.account.ariaLabel", message: "Account" });
  const githubSignUpAriaLabel = t({
    id: "output.identity.github.signUpAriaLabel",
    message: "Sign up with GitHub",
  });
  const googleSignUpAriaLabel = t({
    id: "output.identity.google.signUpAriaLabel",
    message: "Sign up with Google",
  });

  // Verifying state: show interim while the GitHub token is being checked, so we
  // don't flash the signed-out sign-up state for a returning user.
  if (isVerifying) {
    return (
      <section aria-label={accountAriaLabel} style={sectionStyle}>
        <div style={labelStyle}>
          <Trans id="output.identity.account.label">Account</Trans>
        </div>
        <div role="status" aria-live="polite" style={{ fontSize: 13, color: "#9aa7b8" }}>
          <Trans id="output.identity.checkingGithub">Checking GitHub sign-in...</Trans>
        </div>
      </section>
    );
  }

  // Keyboard Studio is one account — sign-out is global (it clears both
  // providers), never per-provider. Providers can only be linked or unlinked
  // together. Below: identity lines for whatever is linked, sign-up buttons for
  // whatever is not, and exactly one "Sign out" once any provider is linked.
  if (github.linked || google.linked) {
    // "Signed in with Google as <name>" — name falls back to email, and to no
    // suffix at all when neither is available.
    const googleDisplay =
      google.name !== null && google.name.length > 0 ? google.name : (google.email ?? "");

    return (
      <section aria-label={accountAriaLabel} style={sectionStyle}>
        <div style={labelStyle}>
          <Trans id="output.identity.account.label">Account</Trans>
        </div>

        {github.linked ? (
          <div role="status" style={statusLineStyle}>
            <GitHubMark />{" "}
            {github.login !== null ? (
              <Trans id="output.identity.github.signedUpAs">
                Signed up with GitHub as {github.login}
              </Trans>
            ) : (
              <Trans id="output.identity.github.signedUp">Signed up with GitHub</Trans>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { void github.connect("identity"); }}
            aria-label={githubSignUpAriaLabel}
            style={githubButtonStyle}
          >
            <GitHubMark />
            <Trans id="output.identity.github.signUpLabel">Sign up with GitHub</Trans>
          </button>
        )}

        {google.linked ? (
          <div role="status" style={statusLineStyle}>
            <GoogleMark />{" "}
            {googleDisplay.length > 0 ? (
              <Trans id="output.identity.google.signedInAs">
                Signed in with Google as {googleDisplay}
              </Trans>
            ) : (
              <Trans id="output.identity.google.signedIn">Signed in with Google</Trans>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { void google.connect(); }}
            aria-label={googleSignUpAriaLabel}
            style={googleButtonStyle}
          >
            <GoogleMark />
            <Trans id="output.identity.google.signUpLabel">Sign up with Google</Trans>
          </button>
        )}

        <button type="button" onClick={signOut} style={secondaryButtonStyle}>
          <Trans id="output.identity.signOut.label">Sign out</Trans>
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
    <section
      aria-label={t({ id: "output.identity.submit.ariaLabel", message: "Submit your keyboard" })}
      style={sectionStyle}
    >
      <div style={labelStyle}>
        <Trans id="output.identity.submit.label">Submit your keyboard</Trans>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "#9aa7b8", lineHeight: 1.5 }}>
        <Trans id="output.identity.submit.intro">
          Sign up to submit your keyboard to the community repository. We handle
          the technical side — you just choose how to sign in.
        </Trans>
      </p>

      <button
        type="button"
        onClick={() => { void github.connect("identity"); }}
        aria-label={githubSignUpAriaLabel}
        style={githubButtonStyle}
      >
        <GitHubMark />
        <Trans id="output.identity.github.signUpLabel">Sign up with GitHub</Trans>
      </button>

      <button
        type="button"
        onClick={() => { void google.connect(); }}
        aria-label={googleSignUpAriaLabel}
        style={googleButtonStyle}
      >
        <GoogleMark />
        <Trans id="output.identity.google.signUpLabel">Sign up with Google</Trans>
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
