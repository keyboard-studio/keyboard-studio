// Unit tests for debugPinsStore.
// Uses vitest jsdom environment (configured in packages/studio/vitest.config.ts).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "km-debug-pins";

/** Seed sessionStorage directly (simulates a prior session or reload). */
function seedStorage(data: Record<string, string | string[]>): void {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Read the raw sessionStorage value for inspection. */
function rawStorage(): Record<string, string | string[]> | null {
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  return JSON.parse(raw) as Record<string, string | string[]>;
}

// ---------------------------------------------------------------------------
// Re-import helper — we need to re-evaluate the module after env changes.
// ---------------------------------------------------------------------------

/** Import a fresh instance of the store (bypasses module cache per test). */
async function importStore() {
  // Use a cache-busting query param approach via dynamic import with vi.resetModules
  vi.resetModules();
  const mod = await import("./debugPinsStore.ts");
  return mod.debugPinsStore;
}

// ---------------------------------------------------------------------------
// Tests — debug ENABLED (VITE_KM_DEBUG = "1")
// ---------------------------------------------------------------------------

describe("debugPinsStore — debug enabled via VITE_KM_DEBUG", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_KM_DEBUG", "1");
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    window.sessionStorage.clear();
  });

  it("isDebugEnabled returns true", async () => {
    const store = await importStore();
    expect(store.isDebugEnabled()).toBe(true);
  });

  it("pin then getPinned returns the value", async () => {
    const store = await importStore();
    store.pin("q1", "hello");
    expect(store.getPinned("q1")).toBe("hello");
  });

  it("pin then isPinned returns true", async () => {
    const store = await importStore();
    store.pin("q2", "world");
    expect(store.isPinned("q2")).toBe(true);
  });

  it("pin persists to sessionStorage (simulates reload)", async () => {
    const store = await importStore();
    store.pin("q3", "persisted");
    // Read value directly from storage (as if re-imported after reload)
    const storeB = await importStore();
    expect(storeB.getPinned("q3")).toBe("persisted");
  });

  it("pin with array value round-trips correctly", async () => {
    const store = await importStore();
    store.pin("q4", ["a", "b", "c"]);
    expect(store.getPinned("q4")).toEqual(["a", "b", "c"]);
  });

  it("unpin makes isPinned false and getPinned undefined", async () => {
    const store = await importStore();
    store.pin("q5", "some-value");
    store.unpin("q5");
    expect(store.isPinned("q5")).toBe(false);
    expect(store.getPinned("q5")).toBeUndefined();
  });

  it("pin → unpin → pin different value: latest wins", async () => {
    const store = await importStore();
    store.pin("q6", "first");
    store.unpin("q6");
    store.pin("q6", "second");
    expect(store.getPinned("q6")).toBe("second");
  });

  it("clearAll removes all pins", async () => {
    const store = await importStore();
    store.pin("qA", "v1");
    store.pin("qB", "v2");
    store.clearAll();
    expect(store.isPinned("qA")).toBe(false);
    expect(store.isPinned("qB")).toBe(false);
    expect(rawStorage()).toBeNull();
  });

  it("pin(id, undefined) is equivalent to unpin", async () => {
    const store = await importStore();
    store.pin("q7", "val");
    store.pin("q7", undefined);
    expect(store.isPinned("q7")).toBe(false);
  });

  it("malformed JSON in sessionStorage is recovered without throwing", async () => {
    window.sessionStorage.setItem(STORAGE_KEY, "NOT_VALID_JSON{{{");
    const store = await importStore();
    expect(() => store.getPinned("q1")).not.toThrow();
    expect(store.isPinned("q1")).toBe(false);
    // Storage should have been cleared by recovery
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("non-object JSON in sessionStorage is recovered without throwing", async () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));
    const store = await importStore();
    expect(() => store.getPinned("q1")).not.toThrow();
    expect(store.isPinned("q1")).toBe(false);
  });

  it("getPinned returns undefined for unknown questionId", async () => {
    const store = await importStore();
    expect(store.getPinned("nonexistent")).toBeUndefined();
  });

  it("seeded storage from a prior run is readable on re-import", async () => {
    seedStorage({ "q-seed": "from-prior-run" });
    const store = await importStore();
    expect(store.getPinned("q-seed")).toBe("from-prior-run");
  });
});

// ---------------------------------------------------------------------------
// Tests — debug ENABLED via URL param (?debug=1)
// ---------------------------------------------------------------------------

describe("debugPinsStore — debug enabled via URL ?debug=1", () => {
  beforeEach(() => {
    // Ensure VITE_KM_DEBUG is not set
    vi.stubEnv("VITE_KM_DEBUG", "");
    // Override location.search
    vi.stubGlobal("location", {
      ...window.location,
      search: "?debug=1",
    });
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    window.sessionStorage.clear();
  });

  it("isDebugEnabled returns true when ?debug=1", async () => {
    const store = await importStore();
    expect(store.isDebugEnabled()).toBe(true);
  });

  it("pin and read work via URL debug mode", async () => {
    const store = await importStore();
    store.pin("q-url", "url-val");
    expect(store.getPinned("q-url")).toBe("url-val");
  });
});

// ---------------------------------------------------------------------------
// Tests — debug DISABLED
// ---------------------------------------------------------------------------

describe("debugPinsStore — debug disabled (production)", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_KM_DEBUG", "");
    vi.stubGlobal("location", {
      ...window.location,
      search: "",
    });
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    window.sessionStorage.clear();
  });

  it("isDebugEnabled returns false", async () => {
    const store = await importStore();
    expect(store.isDebugEnabled()).toBe(false);
  });

  it("pin is a no-op — storage remains empty", async () => {
    const store = await importStore();
    store.pin("q1", "should-not-persist");
    expect(rawStorage()).toBeNull();
  });

  it("getPinned returns undefined even after attempted pin", async () => {
    const store = await importStore();
    store.pin("q1", "ignored");
    expect(store.getPinned("q1")).toBeUndefined();
  });

  it("isPinned returns false always", async () => {
    const store = await importStore();
    store.pin("q1", "ignored");
    expect(store.isPinned("q1")).toBe(false);
  });

  it("clearAll is a no-op (does not throw)", async () => {
    seedStorage({ "q-existing": "value" });
    const store = await importStore();
    expect(() => store.clearAll()).not.toThrow();
    // Storage unchanged because debug is off
    expect(rawStorage()).toEqual({ "q-existing": "value" });
  });
});

// ---------------------------------------------------------------------------
// Tests — SSR / window undefined simulation
// ---------------------------------------------------------------------------

describe("debugPinsStore — window undefined (Node CI)", () => {
  let savedWindow: typeof globalThis.window;

  beforeEach(() => {
    vi.stubEnv("VITE_KM_DEBUG", "1");
    savedWindow = globalThis.window;
    // Simulate a non-browser environment by setting window to undefined
    vi.stubGlobal("window", undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
    // Restore window so subsequent tests work
    globalThis.window = savedWindow;
  });

  it("isDebugEnabled does not throw when window is undefined", async () => {
    const store = await importStore();
    expect(() => store.isDebugEnabled()).not.toThrow();
  });

  it("isPinned does not throw when window is undefined", async () => {
    const store = await importStore();
    expect(() => store.isPinned("q1")).not.toThrow();
    expect(store.isPinned("q1")).toBe(false);
  });

  it("getPinned does not throw and returns undefined when window is undefined", async () => {
    const store = await importStore();
    expect(() => store.getPinned("q1")).not.toThrow();
    expect(store.getPinned("q1")).toBeUndefined();
  });

  it("pin does not throw when window is undefined", async () => {
    const store = await importStore();
    expect(() => store.pin("q1", "val")).not.toThrow();
  });

  it("unpin does not throw when window is undefined", async () => {
    const store = await importStore();
    expect(() => store.unpin("q1")).not.toThrow();
  });

  it("clearAll does not throw when window is undefined", async () => {
    const store = await importStore();
    expect(() => store.clearAll()).not.toThrow();
  });
});
