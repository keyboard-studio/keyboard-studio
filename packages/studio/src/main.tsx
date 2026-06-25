import './index.css';
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StudioShell } from "./StudioShell.tsx";
import { LintDemo } from "./lint/index.ts";
import { runOAuthCallbackIfPresent } from "./lib/handleOAuthCallback.ts";
import { rehydrateWorkingCopyFromSession } from "./lib/persistWorkingCopy.ts";

function mountApp(): void {
  const rootEl = document.getElementById("root");
  if (!rootEl) {
    throw new Error("Studio bootstrap: #root element missing from index.html");
  }

  // Rehydrate the working copy from the pre-redirect snapshot (if present).
  // On a normal (non-OAuth-return) load this is a no-op: the key is absent.
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

// GitHub OAuth (spec §12 "Option A"): the studio is hash-routed, so the
// /oauth/callback redirect is handled here at boot rather than by a router.
// When the path matches, the handler exchanges the code for a token and
// redirects to the app root; we skip mounting this tick (the redirect remounts).
void (async () => {
  const handled = await runOAuthCallbackIfPresent();
  if (!handled) {
    mountApp();
  }
})();
