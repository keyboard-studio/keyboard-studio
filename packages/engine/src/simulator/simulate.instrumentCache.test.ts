/**
 * simulate() instrumented-script cache tests (#2313).
 *
 * `instrumentFiredRuleTracking` is a pure function of the compiled script,
 * but an expensive one (full regex/brace scan of the script). Corpus
 * callers — the I2 round-trip above all — call `simulate()` thousands of
 * times with the same one or two compiled scripts; re-instrumenting on
 * every call saturated the browser main thread for minutes after base
 * selection and stalled the authoring walks (#2302). `simulate()` now
 * memoizes the instrumentation by script source.
 *
 * These tests count REAL parser invocations through a module spy: before
 * the fix, N simulate() calls on one script instrument N times; after,
 * exactly once per distinct script. Behaviour (outputs, firedRule) must be
 * identical with a warm cache, including when two scripts alternate — the
 * round-trip's original/emitted pattern.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { CompileResult, SimKeyInput } from "@keyboard-studio/contracts";

vi.mock("./firedRuleTracker.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./firedRuleTracker.js")>();
  return {
    ...orig,
    instrumentFiredRuleTracking: vi.fn(orig.instrumentFiredRuleTracking),
  };
});

import { compile } from "../compiler/index.js";
import { simulate } from "./index.js";
import { instrumentFiredRuleTracking } from "./firedRuleTracker.js";

const instrumentSpy = vi.mocked(instrumentFiredRuleTracking);

const here = dirname(fileURLToPath(import.meta.url));
const firedruleKmn = readFileSync(resolve(here, "__fixtures__", "firedrule.kmn"), "utf8");
const deadkeyKmn = readFileSync(resolve(here, "__fixtures__", "deadkey_acute.kmn"), "utf8");

function key(vkey: string): SimKeyInput {
  return { vkey, modifiers: [], caps: false };
}

describe("simulate() — instrumented-script cache (#2313)", () => {
  let firedrule: CompileResult;
  let deadkey: CompileResult;

  beforeAll(async () => {
    firedrule = await compile(
      createVirtualFS([{ path: "source/firedrule.kmn", content: firedruleKmn, isBinary: false }]),
      "firedrule",
    );
    expect(firedrule.success, "firedrule.kmn must compile").toBe(true);
    deadkey = await compile(
      createVirtualFS([{ path: "source/deadkey_acute.kmn", content: deadkeyKmn, isBinary: false }]),
      "deadkey_acute",
    );
    expect(deadkey.success, "deadkey_acute.kmn must compile").toBe(true);
  }, 60_000);

  it("instruments a given script once, not once per simulate() call", () => {
    const before = instrumentSpy.mock.calls.length;
    const r1 = simulate(firedrule, [key("K_A")]);
    const r2 = simulate(firedrule, [key("K_A"), key("K_B")]);
    const r3 = simulate(firedrule, [key("K_C")]);
    expect(instrumentSpy.mock.calls.length - before).toBe(1);
    // Warm-cache results are the real results.
    expect(r1.finalOutput).toBe("a");
    expect(r2.trace[1]!.firedRule).toMatchObject({ group: "main", ruleIndex: 1 });
    expect(r3.trace[0]!.firedRule).toMatchObject({ group: "main", ruleIndex: 2 });
  });

  it("keeps both scripts correct when two compiled keyboards alternate (round-trip pattern)", () => {
    const before = instrumentSpy.mock.calls.length;
    const dk1 = simulate(deadkey, [key("K_QUOTE"), key("K_A")]);
    const fr1 = simulate(firedrule, [key("K_F")]);
    const dk2 = simulate(deadkey, [key("K_QUOTE"), key("K_E")]);
    const fr2 = simulate(firedrule, [key("K_A")]);
    // At most one NEW instrumentation across the four calls (deadkey_acute's
    // first use); the firedrule script is already warm from the test above,
    // and alternation must not evict-and-reinstrument either script.
    expect(instrumentSpy.mock.calls.length - before).toBeLessThanOrEqual(1);
    expect(dk1.finalOutput).toBe("á");
    expect(dk2.finalOutput).toBe("é");
    expect(fr1.trace[0]!.firedRule).toMatchObject({ group: "second", ruleIndex: 0 });
    expect(fr2.trace[0]!.firedRule).toMatchObject({ group: "main", ruleIndex: 0 });
  });
});
