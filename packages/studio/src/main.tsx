import './index.css';
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StudioShell } from "./StudioShell.tsx";
import { LintDemo } from "./lint/index.ts";
import { OAuthCallbackScreen } from "./components/OAuthCallbackScreen.tsx";
import {
  detectOAuthCallback,
  type OAuthProvider,
} from "./lib/handleOAuthCallback.ts";

function requireRoot(): HTMLElement {
  const rootEl = document.getElementById("root");
  if (!rootEl) {
    throw new Error("Studio bootstrap: #root element missing from index.html");
  }
  return rootEl;
}

function mountApp(): void {
  const rootEl = requireRoot();

  const isDemoLint =
    typeof window !== "undefined" &&
    window.location.search.includes("demo=lint");

  createRoot(rootEl).render(
    <StrictMode>
      {isDemoLint ? <LintDemo /> : <StudioShell />}
    </StrictMode>,
  );
}

function mountCallbackScreen(provider: OAuthProvider): void {
  const rootEl = requireRoot();
  createRoot(rootEl).render(
    <StrictMode>
      <OAuthCallbackScreen provider={provider} />
    </StrictMode>,
  );
}

// OAuth (spec §12): the studio is hash-routed, so the /oauth/callback and
// /oauth/google/callback redirects are handled here at boot rather than by a
// router. On a callback path we mount a visible "completing sign-in" screen
// (which runs the code→token exchange and then redirects to the app root)
// instead of the app — so the exchange is never an invisible blank page. On
// every normal path we mount the app.
const oauthProvider = detectOAuthCallback();
if (oauthProvider !== null) {
  mountCallbackScreen(oauthProvider);
} else {
  mountApp();
}
