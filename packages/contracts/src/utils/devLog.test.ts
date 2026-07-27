/**
 * Unit tests for devLog — the single sanctioned console sink, gated so that
 * diagnostics print in dev / test / CLI and go inert in a production build.
 *
 * Two levels, because the gate reads one input that is not runtime-variable:
 *
 *   - `isProductionEnv` is the pure decision, tested exhaustively below.
 *     Vite replaces `import.meta.env.PROD` with a literal at build time, so
 *     the production-bundle branch is a compile-time constant inside the
 *     module — a test can vary the decision's *input* but never that read.
 *   - `devLog.*` is tested through the live gate, which under vitest sees
 *     `PROD === false` and therefore defers to `NODE_ENV`. That covers the
 *     wiring (per-call evaluation, argument pass-through, suppression) for
 *     every method.
 */

import { describe, it, expect, vi, afterEach, type MockInstance } from "vitest";
import { devLog, isProductionEnv } from "./devLog.js";

const METHODS = ["log", "info", "warn", "error", "debug"] as const;
type Method = (typeof METHODS)[number];

/** Silence and record every console method devLog fronts. */
function spyConsole(): Record<Method, MockInstance> {
  const spies = {} as Record<Method, MockInstance>;
  for (const m of METHODS) {
    spies[m] = vi.spyOn(console, m).mockImplementation(() => {});
  }
  return spies;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("isProductionEnv", () => {
  it("is production in a Vite production bundle, whatever NODE_ENV says", () => {
    expect(isProductionEnv(true, undefined)).toBe(true);
    expect(isProductionEnv(true, "development")).toBe(true);
    expect(isProductionEnv(true, "test")).toBe(true);
    expect(isProductionEnv(true, "production")).toBe(true);
  });

  it("is not production in a Vite dev/test bundle", () => {
    expect(isProductionEnv(false, undefined)).toBe(false);
    expect(isProductionEnv(false, "development")).toBe(false);
    expect(isProductionEnv(false, "test")).toBe(false);
  });

  it("defers to NODE_ENV outside Vite (Node CLI: no PROD flag)", () => {
    expect(isProductionEnv(undefined, "production")).toBe(true);
    expect(isProductionEnv(undefined, "development")).toBe(false);
    expect(isProductionEnv(undefined, "test")).toBe(false);
  });

  it("treats 'can't tell' as dev, so tooling keeps its logs", () => {
    expect(isProductionEnv(undefined, undefined)).toBe(false);
  });

  it("honours NODE_ENV=production even when Vite reports dev", () => {
    // A Node process started with NODE_ENV=production still suppresses; the
    // Vite flag only ever forces suppression on, never off.
    expect(isProductionEnv(false, "production")).toBe(true);
  });
});

describe("devLog", () => {
  it("exposes exactly the five console methods the codebase uses", () => {
    expect(Object.keys(devLog).sort()).toEqual([...METHODS].sort());
  });

  it("logs every method outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    const spies = spyConsole();
    for (const m of METHODS) devLog[m]("hello", 42);
    for (const m of METHODS) {
      expect(spies[m]).toHaveBeenCalledTimes(1);
      expect(spies[m]).toHaveBeenCalledWith("hello", 42);
    }
  });

  it("suppresses every method when the gate reports production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const spies = spyConsole();
    for (const m of METHODS) devLog[m]("should not appear");
    for (const m of METHODS) expect(spies[m]).not.toHaveBeenCalled();
  });

  it("re-evaluates the gate on every call rather than caching it", () => {
    // Memoizing the gate at module load would make the helper's behaviour
    // depend on import order; this pins the per-call read.
    const spies = spyConsole();

    vi.stubEnv("NODE_ENV", "production");
    devLog.info("suppressed");
    expect(spies.info).not.toHaveBeenCalled();

    vi.stubEnv("NODE_ENV", "development");
    devLog.info("visible");
    expect(spies.info).toHaveBeenCalledTimes(1);
  });

  it("forwards every argument through unchanged", () => {
    vi.stubEnv("NODE_ENV", "development");
    const spies = spyConsole();
    const obj = { a: 1 };
    devLog.warn("a", obj, undefined, null, 0);
    expect(spies.warn).toHaveBeenCalledWith("a", obj, undefined, null, 0);
  });
});
