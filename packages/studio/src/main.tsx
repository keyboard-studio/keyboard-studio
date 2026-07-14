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
import { rehydrateWorkingCopyFromSession } from "./lib/persistWorkingCopy.ts";
import { installE2eHook } from "./lib/e2eHook.ts";
import { loadDraft, resolveActiveProjectKey } from "./lib/draftPersistence.ts";

function requireRoot(): HTMLElement {
  const rootEl = document.getElementById("root");
  if (!rootEl) {
    throw new Error("Studio bootstrap: #root element missing from index.html");
  }
  return rootEl;
}

function mountApp(): void {
  const rootEl = requireRoot();

  // Flag-gated E2E test hook (window.__ksE2E__) — no-op unless VITE_E2E=1 or
  // ?e2e=1. See lib/e2eHook.ts.
  installE2eHook();

  // Durable draft restore (spec 034 US3) — MUST run BEFORE the OAuth-redirect
  // sessionStorage rehydrate immediately below, so the durable localStorage
  // draft is authoritative (research D4). DEVIATION 2 (spec 034 US3 task
  // brief): the persistence contract describes this running at "StudioShell
  // mount, before route resolves" but the real OAuth rehydrate already runs
  // here, in main.tsx, before React ever mounts — so the durable draft load
  // must run here too, at the same pre-mount point, to stay ahead of it.
  // `resolveActiveProjectKey()` reads the `ks.draft.active` pointer (absent on
  // a fresh install / after start-over); `loadDraft()` patches the working-copy
  // and survey-session stores directly if a valid draft is found (setting the
  // `wasDraftRestoredThisBoot()` flag StudioShell's mount effect reads to skip
  // its own reset — see StudioShell.tsx).
  const activeProjectKey = resolveActiveProjectKey();
  if (activeProjectKey !== null) {
    loadDraft(activeProjectKey);
  }

  // Rehydrate the working copy from the pre-redirect OAuth snapshot (if
  // present). On a normal (non-OAuth-return) load this is a no-op: the key is
  // absent. On an OAuth-return boot this may legitimately layer the
  // pre-redirect working copy on top of whatever the durable draft above just
  // restored (or left untouched, if no draft resolved) — both paths patch the
  // SAME single working-copy store (Article III), never a second one.
  // Consume-and-clear semantics ensure a stale snapshot from a previous
  // interrupted session does not clobber a freshly-instantiated working copy.
  rehydrateWorkingCopyFromSession();

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
