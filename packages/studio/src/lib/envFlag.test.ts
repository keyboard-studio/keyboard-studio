// Unit tests for the shared readEnvFlag helper.
// Uses vitest jsdom environment (configured in packages/studio/vitest.config.ts).
//
// See packages/studio/src/stores/debugPinsStore.test.ts for the precedent on
// stubbing "location" and "window" globals in this test environment.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { readEnvFlag } from "./envFlag.ts";

const ENV_KEY = "VITE_KM_TEST_FLAG";
const URL_PARAM = "testParam";

/** Override window.location.search for the duration of a test. */
function stubLocationSearch(search: string): void {
  vi.stubGlobal("location", {
    ...window.location,
    search,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Env-var precedence (rows 1, 2, 5)
// ---------------------------------------------------------------------------

describe("readEnvFlag — env var precedence", () => {
  it("env === '1', no urlParam -> true", () => {
    vi.stubEnv(ENV_KEY, "1");
    expect(readEnvFlag(ENV_KEY)).toBe(true);
  });

  it("env === '1', urlParam given -> true (env short-circuits before URL is read)", () => {
    vi.stubEnv(ENV_KEY, "1");
    stubLocationSearch("");
    expect(readEnvFlag(ENV_KEY, URL_PARAM)).toBe(true);
  });

  it("env unset, no urlParam -> false", () => {
    vi.stubEnv(ENV_KEY, "");
    expect(readEnvFlag(ENV_KEY)).toBe(false);
  });

  it("env set to a non-'1' value, no urlParam -> false", () => {
    vi.stubEnv(ENV_KEY, "0");
    expect(readEnvFlag(ENV_KEY)).toBe(false);
  });

  it("env === '1' wins even when the URL param is '0'", () => {
    vi.stubEnv(ENV_KEY, "1");
    stubLocationSearch(`?${URL_PARAM}=0`);
    expect(readEnvFlag(ENV_KEY, URL_PARAM)).toBe(true);
  });

  it("env === '1' wins even when the URL param is absent", () => {
    vi.stubEnv(ENV_KEY, "1");
    stubLocationSearch("");
    expect(readEnvFlag(ENV_KEY, URL_PARAM)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// URL fallback, only reached when env is not "1" and urlParam is given
// (rows 3, 4)
// ---------------------------------------------------------------------------

describe("readEnvFlag — URL fallback", () => {
  beforeEach(() => {
    vi.stubEnv(ENV_KEY, "");
  });

  it("urlParam given, env unset, URL has ?param=1 -> true", () => {
    stubLocationSearch(`?${URL_PARAM}=1`);
    expect(readEnvFlag(ENV_KEY, URL_PARAM)).toBe(true);
  });

  it("urlParam given, env unset, URL has ?param=0 -> false", () => {
    stubLocationSearch(`?${URL_PARAM}=0`);
    expect(readEnvFlag(ENV_KEY, URL_PARAM)).toBe(false);
  });

  it("urlParam given, env unset, URL param absent -> false", () => {
    stubLocationSearch("");
    expect(readEnvFlag(ENV_KEY, URL_PARAM)).toBe(false);
  });

  it("urlParam given, env unset, URL has an unrelated query string -> false", () => {
    stubLocationSearch("?other=1");
    expect(readEnvFlag(ENV_KEY, URL_PARAM)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// urlParam omitted -> env-only mode (mutateFlag shape); URL must be ignored
// (row 6)
// ---------------------------------------------------------------------------

describe("readEnvFlag — urlParam omitted (env-only mode)", () => {
  it("URL param present in location is ignored when urlParam is omitted", () => {
    vi.stubEnv(ENV_KEY, "");
    // Same key coincidentally present in the URL query string — must not
    // leak into the result because no urlParam was requested.
    stubLocationSearch(`?${ENV_KEY}=1`);
    expect(readEnvFlag(ENV_KEY)).toBe(false);
  });

  it("env '1' still returns true when urlParam is omitted", () => {
    vi.stubEnv(ENV_KEY, "1");
    stubLocationSearch("");
    expect(readEnvFlag(ENV_KEY)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SSR/window-guard by arity (row 7)
//
// debugPinsStore.test.ts establishes that vi.stubGlobal("window", undefined)
// is supported cleanly in this jsdom-based test environment, so both arity
// branches are exercised directly rather than skipped.
// ---------------------------------------------------------------------------

describe("readEnvFlag — SSR/window-guard by arity", () => {
  let savedWindow: typeof globalThis.window;

  beforeEach(() => {
    savedWindow = globalThis.window;
  });

  afterEach(() => {
    // vi.unstubAllGlobals() (in the top-level afterEach) also restores this,
    // but restore explicitly too in case stubGlobal was bypassed.
    globalThis.window = savedWindow;
  });

  it("urlParam PROVIDED + window undefined -> false, without reading env", () => {
    // Env is "1" here specifically to prove the window guard short-circuits
    // *before* the env check runs — if env were read first this would
    // incorrectly return true.
    vi.stubEnv(ENV_KEY, "1");
    vi.stubGlobal("window", undefined);
    expect(readEnvFlag(ENV_KEY, URL_PARAM)).toBe(false);
  });

  it("urlParam OMITTED + window undefined -> env check still runs (true)", () => {
    vi.stubEnv(ENV_KEY, "1");
    vi.stubGlobal("window", undefined);
    expect(readEnvFlag(ENV_KEY)).toBe(true);
  });

  it("urlParam OMITTED + window undefined + env not '1' -> false", () => {
    vi.stubEnv(ENV_KEY, "");
    vi.stubGlobal("window", undefined);
    expect(readEnvFlag(ENV_KEY)).toBe(false);
  });
});
