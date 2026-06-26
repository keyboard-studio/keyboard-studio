// OAuthCallbackScreen — visible UI for the /oauth/callback and
// /oauth/google/callback redirect targets.
//
// The studio is hash-routed and has no path router, so OAuth redirects are
// handled at boot in main.tsx. Previously the callback path rendered *nothing*
// while the code→token exchange ran, so any slow or hung exchange left the user
// staring at a blank page with no feedback. This component replaces that blank
// with a "Completing sign-in…" screen, and — crucially — a timeout + error
// fallback so a stuck exchange becomes a readable message with a way back into
// the app rather than a permanent white page.
//
// Flow:
//   1. Mount immediately (synchronously, before any network) → visible spinner.
//   2. Run the provider-appropriate callback processor (handleOAuthCallback).
//   3. On resolve → redirect to the app root (success) or /?<provider>_error=…
//      (handled failure), exactly as the headless handler did.
//   4. If the exchange does not resolve within CALLBACK_TIMEOUT_MS, or throws
//      unexpectedly, show a recoverable error with a "Return to keyboard studio"
//      button instead of hanging blank.

import { useEffect, useState } from "react";
import {
  processOAuthCallbackForProvider,
  redirectTargetForResult,
  type OAuthProvider,
} from "../lib/handleOAuthCallback.ts";

/**
 * How long to wait for the token exchange before showing a recoverable error.
 * `fetch` has no default timeout, so a hung OAuth backend would otherwise leave
 * the user blank forever; this is the upper bound on that wait.
 */
const CALLBACK_TIMEOUT_MS = 15_000;

const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  github: "GitHub",
  google: "Google",
};

/**
 * Module-level guard so the exchange runs exactly once even though React
 * StrictMode invokes effects twice in development — without it the one-time
 * authorization code would be POSTed twice.
 */
let processingStarted = false;

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background: "var(--bg)",
  color: "var(--text)",
  fontFamily: "var(--ui)",
};

const cardStyle: React.CSSProperties = {
  maxWidth: 420,
  width: "100%",
  textAlign: "center",
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "40px 32px",
};

const spinnerStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  margin: "0 auto 20px",
  borderRadius: "50%",
  border: "3px solid var(--border-strong)",
  borderTopColor: "var(--accent)",
  animation: "ks-oauth-spin 0.8s linear infinite",
};

const primaryBtnStyle: React.CSSProperties = {
  marginTop: 24,
  padding: "10px 20px",
  fontSize: 15,
  fontFamily: "var(--ui)",
  color: "var(--text)",
  background: "var(--primary)",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
};

type Phase = "working" | "error";

export function OAuthCallbackScreen({ provider }: { provider: OAuthProvider }) {
  const [phase, setPhase] = useState<Phase>("working");
  const label = PROVIDER_LABEL[provider];

  useEffect(() => {
    if (processingStarted) return;
    processingStarted = true;

    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      setPhase("error");
    }, CALLBACK_TIMEOUT_MS);

    void (async () => {
      try {
        const result = await processOAuthCallbackForProvider(
          provider,
          window.location.search,
        );
        if (settled) return; // already timed out — keep the error screen up
        settled = true;
        window.clearTimeout(timer);
        window.location.replace(redirectTargetForResult(provider, result));
      } catch {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        setPhase("error");
      }
    })();

    return () => window.clearTimeout(timer);
  }, [provider]);

  // On the error path, hand the app the safe "exchange-failed" reason so the
  // auth hook surfaces its static "could not be completed — please try again"
  // copy, rather than landing the user on a bare screen with no explanation.
  const errorParam = provider === "google" ? "google_oauth_error" : "oauth_error";
  const returnToApp = (): void => {
    window.location.assign(`/?${errorParam}=exchange-failed`);
  };

  return (
    <div style={pageStyle} role="status" aria-live="polite">
      {/* Keyframes can't be expressed inline; scope them to this screen. */}
      <style>{"@keyframes ks-oauth-spin { to { transform: rotate(360deg); } }"}</style>
      <div style={cardStyle}>
        {phase === "working" ? (
          <>
            <div style={spinnerStyle} aria-hidden="true" />
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>
              Completing {label} sign-in…
            </h1>
            <p style={{ fontSize: 14, color: "var(--muted)", margin: 0 }}>
              Just a moment while we finish connecting your account.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>
              {label} sign-in is taking too long
            </h1>
            <p style={{ fontSize: 14, color: "var(--muted)", margin: 0 }}>
              We couldn’t complete the sign-in. This is usually temporary — please
              return to the studio and try connecting again.
            </p>
            <button type="button" style={primaryBtnStyle} onClick={returnToApp}>
              Return to keyboard studio
            </button>
          </>
        )}
      </div>
    </div>
  );
}
