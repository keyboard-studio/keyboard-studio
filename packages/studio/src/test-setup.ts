// Vitest global setup (wired via vitest.config.ts `setupFiles`).
//
// Polyfill the Web Crypto API for older local runtimes. `globalThis.crypto`
// (and its `.subtle` SubtleCrypto) is a default global only on Node >= 20 —
// NOT something jsdom provides. On Node 18 it is undefined, which breaks the
// PKCE tests in githubOAuth.test.ts (S256 challenge via crypto.subtle.digest).
// CI runs Node 22 and is unaffected; this keeps the suite robust below the repo
// minimum so a stale local runtime doesn't surface a false test failure (#510).
import { webcrypto } from "node:crypto";
import { beforeEach } from "vitest";
import { useStepWalkStore } from "./stores/stepWalkStore.ts";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as unknown as Crypto;
}

// The within-step walk store (stores/stepWalkStore.ts) is module-level, so it
// outlives a `render()` the way the real app's does — which is the point in
// production and cross-test pollution here: one test's cursor and answer draft
// would become the next test's ARRIVAL POSITION and replay source, silently
// mounting a flow on a different question than the test set up.
//
// Reset globally rather than per suite because any test that renders anything
// containing a SurveyRunner or an assignment-loop gallery publishes into it,
// which is a much wider set of files than the ones that mean to exercise it —
// making this an opt-out that would be forgotten rather than an opt-in.
beforeEach(() => {
  useStepWalkStore.getState().reset();
});

/**
 * Clear sessionStorage and localStorage. Intended for beforeEach/afterEach in
 * OAuth test suites to ensure each test starts with clean storage state.
 */
export function clearAllStorage(): void {
  sessionStorage.clear();
  localStorage.clear();
}
