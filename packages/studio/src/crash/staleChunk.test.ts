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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  handleStaleChunkFailure,
  importOrReload,
  isStaleChunkError,
  isStaleChunkFailure,
  recoverFromStaleChunk,
  setStaleChunkReload,
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
    // The SPA catch-all rewrite used to answer a missing chunk with index.html,
    // so the browser complained about the MIME type instead of the 404. The
    // rewrite is fixed, but tabs open across that deploy still say this.
    [
      "Chrome's module-script MIME complaint",
      'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".',
    ],
    ["Vite's CSS preload helper", "Unable to preload CSS for /assets/index-abc.css"],
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

// ---------------------------------------------------------------------------
// The import-site entry point — same gate, thrown value instead of a message
// ---------------------------------------------------------------------------
//
// `globalHandlers.ts` only sees what nobody caught. An import site that catches
// its own rejection (services.ts's engine seam, useKeyboardArtifact) therefore
// has to classify it itself, and it holds the thrown value with its `cause`
// chain intact rather than a flattened string.

describe("isStaleChunkError (thrown values)", () => {
  it.each([
    ["Chrome dynamic import", CHROME_CHUNK_404],
    [
      "Chrome module script MIME",
      'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".',
    ],
    ["Firefox", "error loading dynamically imported module: /assets/main-abc.js"],
    ["Safari", "Importing a module script failed."],
    ["Vite CSS preload", "Unable to preload CSS for /assets/index-abc.css"],
  ])("recognises the %s phrasing", (_label, message) => {
    expect(isStaleChunkError(new Error(message))).toBe(true);
  });

  it("sees through the engine's CompilerLoadError wrapping", () => {
    // What the studio actually receives when the kmc-kmn chunk is the missing
    // one: the engine re-reports it rather than rethrowing verbatim.
    expect(isStaleChunkError(new Error(`kmc-kmn load failed: ${CHROME_CHUNK_404}`))).toBe(true);
  });

  it("sees through a cause chain", () => {
    const wrapped = new Error("VFS load failed", { cause: new Error(CHROME_CHUNK_404) });
    expect(isStaleChunkError(wrapped)).toBe(true);
  });

  it("does not match unrelated failures", () => {
    expect(isStaleChunkError(new Error("compile failed: syntax error"))).toBe(false);
    expect(isStaleChunkError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });
});

describe("recoverFromStaleChunk", () => {
  const reload = vi.fn();

  beforeEach(() => {
    reload.mockClear();
    setStaleChunkReload(reload);
  });

  it("uses the reload main.tsx registered — the one that flushes the draft", () => {
    // Registered, not passed: the import sites have no `reload` argument to
    // give, which is exactly how the draft flush reached them.
    expect(recoverFromStaleChunk(new Error(CHROME_CHUNK_404))).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("leaves unrelated errors alone", () => {
    expect(recoverFromStaleChunk(new Error("network offline"))).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads at most once per window so a broken deploy cannot loop", () => {
    expect(recoverFromStaleChunk(new Error(CHROME_CHUNK_404), { now: NOW })).toBe(true);
    expect(recoverFromStaleChunk(new Error(CHROME_CHUNK_404), { now: NOW + 1_000 })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("shares its one cooldown with the window-level entry point", () => {
    // The failure Vite reports globally and the rejection the importing code
    // catches are the SAME failure. Two gates would reload twice for it.
    expect(handleStaleChunkFailure(CHROME_CHUNK_404, { now: NOW })).toBe(true);
    expect(recoverFromStaleChunk(new Error(CHROME_CHUNK_404), { now: NOW })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("recovers again once the window has elapsed", () => {
    recoverFromStaleChunk(new Error(CHROME_CHUNK_404), { now: NOW });
    expect(
      recoverFromStaleChunk(new Error(CHROME_CHUNK_404), {
        now: NOW + STALE_CHUNK_RELOAD_WINDOW_MS + 1,
      }),
    ).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});

describe("importOrReload", () => {
  const reload = vi.fn();

  beforeEach(() => {
    reload.mockClear();
    setStaleChunkReload(reload);
  });

  it("passes the module through on success", async () => {
    await expect(importOrReload(async () => "mod")).resolves.toBe("mod");
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads and still rethrows on a stale chunk", async () => {
    // Always rethrows: the caller's own error path still runs, because a
    // reload that the cooldown suppressed must not look like a success.
    const err = new Error(CHROME_CHUNK_404);
    await expect(importOrReload(() => Promise.reject(err))).rejects.toBe(err);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("rethrows an unrelated failure without reloading", async () => {
    const err = new Error("engine init failed");
    await expect(importOrReload(() => Promise.reject(err))).rejects.toBe(err);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("the engine-load path recovers on the original text (FR-005a)", () => {
  const reload = vi.fn();

  beforeEach(() => {
    reload.mockClear();
    setStaleChunkReload(reload);
  });

  it("recovers from the synthetic wrapper useKeyboardArtifact throws", () => {
    // Exactly the value that reaches the engineReadyPromise catch:
    // loadEngine() collapses the rejection to `null` and preserves it, the
    // caller shows the author the friendly string and carries the truth as
    // `cause`. If recovery matched only the outer message this would be false,
    // and the tab would sit on "VFS load failed" until reloaded by hand.
    const thrown = new Error(SYNTHETIC, { cause: new Error(CHROME_CHUNK_404) });
    expect(recoverFromStaleChunk(thrown)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("still lets a genuine engine failure through to filing", () => {
    const thrown = new Error(SYNTHETIC, {
      cause: new Error("WebAssembly.instantiate(): expected magic word"),
    });
    expect(recoverFromStaleChunk(thrown)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
