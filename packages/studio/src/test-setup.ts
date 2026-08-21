// Vitest global setup (wired via vitest.config.ts `setupFiles`).
//
// Polyfill the Web Crypto API for older local runtimes. `globalThis.crypto`
// (and its `.subtle` SubtleCrypto) is a default global only on Node >= 20 —
// NOT something jsdom provides. On Node 18 it is undefined, which breaks the
// PKCE tests in githubOAuth.test.ts (S256 challenge via crypto.subtle.digest).
// CI runs Node 22 and is unaffected; this keeps the suite robust below the repo
// minimum so a stale local runtime doesn't surface a false test failure (#510).
import { webcrypto } from "node:crypto";
import { File as NodeFile, Blob as NodeBlob } from "node:buffer";
import { beforeEach } from "vitest";
import { useStepWalkStore } from "./stores/stepWalkStore.ts";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as unknown as Crypto;
}

// jsdom's own File/Blob implementation (as of jsdom 26) exposes only
// `slice`/`size`/`type` — it does not implement `.text()`/`.arrayBuffer()`
// (see https://github.com/jsdom/jsdom/issues/2555, still open). Any test that
// exercises the browser's File.text() (e.g. a file-upload flow, spec 050)
// would otherwise hit "file.text is not a function" purely from the test
// environment, never in a real browser. Node's own global File/Blob (default
// since Node 20, same floor as this repo's — see CLAUDE.md) fully implement
// the spec, so swapping them in here is the same fix shape as the crypto
// polyfill above: replace the jsdom-missing global with the real one.
if (typeof globalThis.File.prototype.text !== "function") {
  globalThis.File = NodeFile as unknown as typeof File;
  globalThis.Blob = NodeBlob as unknown as typeof Blob;
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
