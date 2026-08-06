// Stale-deployment carve-out (spec 060 US3 — FR-005a, FR-050 – FR-055, SC-015).
//
// THE ASSERTION THAT MATTERS MOST IS THE FIRST ONE. `loadEngine()` used to
// collapse every failure to `null`, after which the caller threw a friendly
// synthetic string — and the classifier can only match the text it is handed.
// So a genuine post-deploy chunk 404 in the engine path produced
// "Engine failed to load — check browser console for WASM errors.", matched
// nothing, and went to ordinary filing: the exact deploy flood this story
// exists to prevent, arriving through the one code path most likely to hit it.
//
// The mirror assertion is just as important: a rejection that does NOT match
// the pattern must still reach ordinary filing. A carve-out that over-suppresses
// silently disables crash reporting for every genuine engine failure, which is
// a strictly worse bug than the flood.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  handleStaleChunkFailure,
  isStaleChunkFailure,
  STALE_CHUNK_RELOAD_WINDOW_MS,
  STALE_CHUNK_RELOAD_KEY,
  _resetStaleChunkState,
} from "./staleChunk.ts";
import { flattenErrorMessage } from "./globalHandlers.ts";
import {
  getCrashSendSnapshot,
  resetCrashSendState,
} from "./send.ts";

const NOW = Date.parse("2026-08-05T12:00:00.000Z");

/** The message Chrome produces for a chunk that no longer exists after a deploy. */
const CHROME_CHUNK_404 =
  "Failed to fetch dynamically imported module: https://studio.example/assets/engine-DLGH1X0S.js";

/** The synthetic string useKeyboardArtifact shows the author. */
const SYNTHETIC =
  "Engine failed to load — check browser console for WASM errors.";

beforeEach(() => {
  _resetStaleChunkState();
  resetCrashSendState();
});

afterEach(() => {
  _resetStaleChunkState();
  resetCrashSendState();
});

// ---------------------------------------------------------------------------
// FR-005a / SC-015 — the original rejection reaches the classifier
// ---------------------------------------------------------------------------

describe("loadEngine rejection forwarding (FR-005a, SC-015)", () => {
  it("does NOT match the synthetic string on its own", () => {
    // This is the bug, stated as a test: if the classifier only ever saw this,
    // the carve-out could never fire for an engine chunk 404.
    expect(isStaleChunkFailure(SYNTHETIC)).toBe(false);
  });

  it("matches once the original rejection is carried as `cause`", () => {
    const wrapped = new Error(SYNTHETIC, { cause: new Error(CHROME_CHUNK_404) });
    expect(isStaleChunkFailure(flattenErrorMessage(wrapped))).toBe(true);
  });

  it("flattens more than one level of cause", () => {
    const wrapped = new Error(SYNTHETIC, {
      cause: new Error("import failed", { cause: new Error(CHROME_CHUNK_404) }),
    });
    expect(isStaleChunkFailure(flattenErrorMessage(wrapped))).toBe(true);
  });

  it("still does not match a genuine engine failure wrapped the same way", () => {
    // Over-suppression check: the wrapping must not make everything look stale.
    const wrapped = new Error(SYNTHETIC, {
      cause: new Error("WebAssembly.instantiate(): expected magic word"),
    });
    expect(isStaleChunkFailure(flattenErrorMessage(wrapped))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FR-051 — the pattern
// ---------------------------------------------------------------------------

describe("stale-chunk pattern (FR-051)", () => {
  it.each([
    ["Chrome", CHROME_CHUNK_404],
    ["Firefox", "error loading dynamically imported module"],
    ["Safari", "Importing a module script failed."],
  ])("matches the %s wording", (_browser, message) => {
    expect(isStaleChunkFailure(message)).toBe(true);
  });

  it.each([
    ["a null-property TypeError", "TypeError: Cannot read properties of undefined"],
    ["a WASM failure", "WebAssembly.instantiate(): expected magic word"],
    ["a plain network error", "NetworkError when attempting to fetch resource."],
    ["an empty message", ""],
  ])("does not match %s", (_label, message) => {
    expect(isStaleChunkFailure(message)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FR-052 / FR-053 — one-shot reload, then let it through
// ---------------------------------------------------------------------------

describe("one-shot reload gate", () => {
  it("reloads once on first detection and reports nothing", () => {
    let reloads = 0;
    const handled = handleStaleChunkFailure(CHROME_CHUNK_404, {
      reload: () => {
        reloads += 1;
      },
      now: NOW,
    });

    expect(handled).toBe(true);
    expect(reloads).toBe(1);
    expect(sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY)).toBe(String(NOW));
  });

  it("does not reload again inside the window", () => {
    let reloads = 0;
    const reload = () => {
      reloads += 1;
    };
    handleStaleChunkFailure(CHROME_CHUNK_404, { reload, now: NOW });
    const handled = handleStaleChunkFailure(CHROME_CHUNK_404, {
      reload,
      now: NOW + STALE_CHUNK_RELOAD_WINDOW_MS / 2,
    });

    // A second reload here is an infinite loop for anyone whose network
    // genuinely cannot reach the asset.
    expect(reloads).toBe(1);
    expect(handled).toBe(false);
  });

  it("lets the recurrence through to ordinary filing (FR-053)", () => {
    handleStaleChunkFailure(CHROME_CHUNK_404, { reload: () => {}, now: NOW });
    const handled = handleStaleChunkFailure(CHROME_CHUNK_404, {
      reload: () => {},
      now: NOW + 1_000,
    });

    // `false` means "not handled" — the caller files it.
    expect(handled).toBe(false);
  });

  it("raises the retry notice on the recurrence", () => {
    handleStaleChunkFailure(CHROME_CHUNK_404, { reload: () => {}, now: NOW });
    handleStaleChunkFailure(CHROME_CHUNK_404, { reload: () => {}, now: NOW + 1_000 });

    expect(getCrashSendSnapshot().retryExhausted).toBe(true);
  });

  it("reloads again once the window has elapsed", () => {
    let reloads = 0;
    const reload = () => {
      reloads += 1;
    };
    handleStaleChunkFailure(CHROME_CHUNK_404, { reload, now: NOW });
    handleStaleChunkFailure(CHROME_CHUNK_404, {
      reload,
      now: NOW + STALE_CHUNK_RELOAD_WINDOW_MS + 1,
    });

    // A different deploy, later in the same session, deserves its own reload.
    expect(reloads).toBe(2);
  });

  it("never handles a non-matching failure, so it always files", () => {
    let reloads = 0;
    const handled = handleStaleChunkFailure("TypeError: x is not a function", {
      reload: () => {
        reloads += 1;
      },
      now: NOW,
    });
    expect(handled).toBe(false);
    expect(reloads).toBe(0);
  });
});
