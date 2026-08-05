import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isStaleChunkError,
  recoverFromStaleChunk,
  importOrReload,
  installStaleChunkRecovery,
  RELOAD_COOLDOWN_MS,
  STALE_CHUNK_RELOAD_KEY,
} from "./staleChunkReload.ts";

// Stands in for the draft flush main.tsx registers (registered, not imported —
// a direct import would close a dependency cycle; see the module docstring).
const flushActiveDraft = vi.fn();
let uninstallRecovery: (() => void) | null = null;

// jsdom's location.reload is non-configurable on the real Location object, so
// swap in a plain stand-in for the duration of each test.
const reload = vi.fn();
const realLocation = window.location;

beforeEach(() => {
  reload.mockClear();
  flushActiveDraft.mockClear();
  uninstallRecovery = installStaleChunkRecovery({ beforeReload: flushActiveDraft });
  window.sessionStorage.clear();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { ...realLocation, reload },
  });
});

afterEach(() => {
  uninstallRecovery?.();
  uninstallRecovery = null;
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: realLocation,
  });
});

/** The message Chrome produces for a chunk a redeploy removed. */
const CHROME_DYNAMIC =
  "Failed to fetch dynamically imported module: https://kbstudio.langtech.cloud/assets/main-DLGH1X0S.js";

describe("isStaleChunkError", () => {
  it.each([
    ["Chrome dynamic import", CHROME_DYNAMIC],
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
    // What the studio actually receives: the engine re-reports the failure as
    // `kmc-kmn load failed: <original>` rather than rethrowing it verbatim.
    expect(
      isStaleChunkError(new Error(`kmc-kmn load failed: ${CHROME_DYNAMIC}`)),
    ).toBe(true);
  });

  it("sees through a cause chain", () => {
    const wrapped = new Error("VFS load failed", {
      cause: new Error(CHROME_DYNAMIC),
    });
    expect(isStaleChunkError(wrapped)).toBe(true);
  });

  it("does not match unrelated failures", () => {
    expect(isStaleChunkError(new Error("compile failed: syntax error"))).toBe(false);
    expect(isStaleChunkError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });
});

describe("recoverFromStaleChunk", () => {
  it("flushes the draft and reloads on a stale-chunk error", () => {
    expect(recoverFromStaleChunk(new Error(CHROME_DYNAMIC))).toBe(true);
    expect(flushActiveDraft).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("leaves unrelated errors alone", () => {
    expect(recoverFromStaleChunk(new Error("network offline"))).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads at most once per cooldown so a broken deploy cannot loop", () => {
    expect(recoverFromStaleChunk(new Error(CHROME_DYNAMIC))).toBe(true);
    expect(recoverFromStaleChunk(new Error(CHROME_DYNAMIC))).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("recovers again once the cooldown has elapsed", () => {
    window.sessionStorage.setItem(
      STALE_CHUNK_RELOAD_KEY,
      String(Date.now() - RELOAD_COOLDOWN_MS - 1),
    );
    expect(recoverFromStaleChunk(new Error(CHROME_DYNAMIC))).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("still reloads when the draft flush throws", () => {
    flushActiveDraft.mockImplementationOnce(() => {
      throw new Error("quota exceeded");
    });
    expect(recoverFromStaleChunk(new Error(CHROME_DYNAMIC))).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("importOrReload", () => {
  it("passes the module through on success", async () => {
    await expect(importOrReload(async () => "mod")).resolves.toBe("mod");
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads and still rethrows on a stale chunk", async () => {
    const err = new Error(CHROME_DYNAMIC);
    await expect(
      importOrReload(() => Promise.reject(err)),
    ).rejects.toBe(err);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("rethrows an unrelated failure without reloading", async () => {
    const err = new Error("engine init failed");
    await expect(importOrReload(() => Promise.reject(err))).rejects.toBe(err);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("installStaleChunkRecovery", () => {
  // These exercise the listener lifecycle itself, so they start from a clean
  // window rather than the shared installation beforeEach sets up.
  beforeEach(() => {
    uninstallRecovery?.();
    uninstallRecovery = null;
  });

  it("recovers from a vite:preloadError and cancels the rethrow", () => {
    const uninstall = installStaleChunkRecovery({ beforeReload: flushActiveDraft });
    const event = new Event("vite:preloadError", { cancelable: true });
    (event as Event & { payload?: unknown }).payload = new Error(CHROME_DYNAMIC);

    window.dispatchEvent(event);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    uninstall();
  });

  it("stops listening after uninstall", () => {
    const uninstall = installStaleChunkRecovery({ beforeReload: flushActiveDraft });
    uninstall();
    const event = new Event("vite:preloadError", { cancelable: true });
    (event as Event & { payload?: unknown }).payload = new Error(CHROME_DYNAMIC);

    window.dispatchEvent(event);

    expect(reload).not.toHaveBeenCalled();
  });
});
