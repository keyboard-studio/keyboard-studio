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
import { beforeEach, vi } from "vitest";
import type { StateCreator } from "zustand";

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

// The studio's zustand stores (stores/*.ts, decisions/decisionLogStore.ts) are
// module-level, so they outlive a `render()` the way the real app's do. That
// is the point in production and cross-test pollution here: one test's working
// copy, survey traversal, Phase B draft or within-step walk cursor would become
// the next test's starting state, silently mounting a flow somewhere other than
// where the test set it up.
//
// Reset globally rather than per suite because any test that renders a
// SurveyView, a SurveyRunner or an assignment-loop gallery publishes into
// these stores, which is a much wider set of files than the ones that mean to
// exercise them. An opt-in reset would be forgotten; this one is automatic.
//
// The stores are NOT imported here. A module this setup file imports is loaded
// before the test file registers its vi.mock() calls, so it keeps the REAL
// versions of everything it imports: workingCopyStore would ignore a test's
// @keyboard-studio/engine mock, for instance. Instead, zustand's `create` is
// wrapped to record every store as the test file's own module graph creates
// it (mocks and all), and before each test every recorded store that exposes a
// `reset()` action is reset through it. A store the file never loads is never
// touched.
const createdStores = vi.hoisted(() => new Set<{ getState: () => unknown }>());

vi.mock("zustand", async (importOriginal) => {
  const actual = await importOriginal<typeof import("zustand")>();
  const track = <S extends { getState: () => unknown }>(store: S): S => {
    createdStores.add(store);
    return store;
  };
  // Both call shapes: create(initializer) and the curried create<T>()(initializer).
  const create = (initializer?: StateCreator<unknown>) =>
    initializer === undefined
      ? (init: StateCreator<unknown>) => track(actual.create(init))
      : track(actual.create(initializer));
  return { ...actual, create: create as unknown as typeof actual.create };
});

beforeEach(() => {
  for (const store of createdStores) {
    const { reset } = store.getState() as { reset?: unknown };
    if (typeof reset === "function") reset();
  }
});

/**
 * Clear sessionStorage and localStorage. Intended for beforeEach/afterEach in
 * OAuth test suites to ensure each test starts with clean storage state.
 */
export function clearAllStorage(): void {
  sessionStorage.clear();
  localStorage.clear();
}
