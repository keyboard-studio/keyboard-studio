// The window-level net, wired the way main.tsx wires it (spec 060, FR-002 –
// FR-004, FR-050, FR-053).
//
// WHY THIS FILE EXISTS. staleChunk.test.ts proves the carve-out classifies and
// gates correctly when called directly. That is not the same as proving the
// handlers reach it: the two hazards here are both wiring, not logic — a
// `vite:preloadError` that files a report instead of reloading (the deploy
// flood US3 exists to prevent), and an `unhandledrejection` whose `cause` chain
// is never flattened, so the carve-out matches the friendly wrapper string and
// declines a failure it should have handled.
//
// The handlers install once per module registry and cannot be removed, so every
// test here shares one installation and varies only the state around it.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { installGlobalCrashHandlers, flattenErrorMessage } from "./globalHandlers.ts";
import { handleStaleChunkFailure, setStaleChunkReload, _resetStaleChunkState } from "./staleChunk.ts";
import { getCrashSendSnapshot, resetCrashSendState } from "./send.ts";
import { _resetBreadcrumbs } from "./breadcrumbs.ts";

/** The message Chrome produces for a chunk a deploy removed. */
const CHUNK_404 =
  "Failed to fetch dynamically imported module: https://studio.example/assets/engine-DLGH1X0S.js";

/** The friendly string useKeyboardArtifact shows the author. */
const SYNTHETIC = "Engine failed to load — check browser console for WASM errors.";

const reload = vi.fn();

// Exactly main.tsx's wiring: the reload is registered once (it flushes the
// draft there), and the handler is the carve-out with no arguments of its own.
installGlobalCrashHandlers({
  handleStaleChunk: (message) => handleStaleChunkFailure(message),
});

beforeEach(() => {
  reload.mockClear();
  _resetStaleChunkState();
  resetCrashSendState();
  _resetBreadcrumbs();
  sessionStorage.clear();
  setStaleChunkReload(reload);
  // No fetch stub: nothing here should ever reach a POST, and an unstubbed
  // fetch makes that failure loud rather than silently satisfied by a mock.
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no send expected"))));
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetStaleChunkState();
});

function dispatchPreloadError(payload: unknown): Event {
  const event = new Event("vite:preloadError", { cancelable: true });
  (event as Event & { payload?: unknown }).payload = payload;
  window.dispatchEvent(event);
  return event;
}

function dispatchRejection(reason: unknown): void {
  const event = new Event("unhandledrejection", { cancelable: true });
  (event as Event & { reason?: unknown }).reason = reason;
  window.dispatchEvent(event);
}

describe("vite:preloadError (FR-004, FR-050)", () => {
  it("reloads once and files nothing", () => {
    const event = dispatchPreloadError(new Error(CHUNK_404));

    expect(reload).toHaveBeenCalledTimes(1);
    // preventDefault is what stops the same failure also arriving as an
    // unhandled rejection and being counted twice.
    expect(event.defaultPrevented).toBe(true);
    expect(getCrashSendSnapshot().status).toBe("idle");
  });

  it("does not reload twice for one deploy", () => {
    dispatchPreloadError(new Error(CHUNK_404));
    dispatchPreloadError(new Error(CHUNK_404));

    expect(reload).toHaveBeenCalledTimes(1);
    // The second one means reloading did not help — the retry notice, not a
    // second reload (FR-053).
    expect(getCrashSendSnapshot().retryExhausted).toBe(true);
  });
});

describe("unhandledrejection (FR-003, FR-005a)", () => {
  it("recovers on the original text carried as `cause`, not the wrapper", () => {
    // The rejection useKeyboardArtifact's engineReadyPromise produces when the
    // engine chunk is the missing one. Matching only the outer message would
    // file it.
    expect(flattenErrorMessage(new Error(SYNTHETIC, { cause: new Error(CHUNK_404) }))).toContain(
      CHUNK_404,
    );

    dispatchRejection(new Error(SYNTHETIC, { cause: new Error(CHUNK_404) }));

    expect(reload).toHaveBeenCalledTimes(1);
    expect(getCrashSendSnapshot().status).toBe("idle");
  });

  it("leaves a genuine engine failure to ordinary filing", () => {
    dispatchRejection(
      new Error(SYNTHETIC, {
        cause: new Error("WebAssembly.instantiate(): expected magic word"),
      }),
    );

    // Over-suppression is the worse bug: this must NOT be swallowed.
    expect(reload).not.toHaveBeenCalled();
  });
});
