// flagOff.test.ts — spec-014 US4 flag on/off spine proof (T029–T031),
// reduced by spec 089 T007/T009 to the one assertion whose subject still
// exists.
//
// The T029/T030 spine describes drove `MutateRequest`s through
// applyStepCompletion to prove the question-answer seam was flag-gated.
// Spec 089 deleted that route: question answers now run through
// `applyDecisionEffects` UNCONDITIONALLY (contracts/apply-contract.md A1),
// and its behaviour is pinned in src/steps/applyDecisionEffects.test.ts.
// The reserve-module spine those describes drove has no apply() and no
// route left to exercise.
//
// What remains here is the mechanisms-step re-propagation gate — the one
// flag reader inside the reducer that survives until spec 089 T021 deletes
// the flag globally (US2). When T021 lands, this file's last test goes
// with it; T023 owns the final flag-test sweep.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR } from "@keyboard-studio/contracts";

// Spy on the real applyMutatePatch so we can count invocations. We forward
// to the real implementation so flag-ON behavior is faithful.
import * as mutateApplyModule from "../../src/steps/mutateApply.ts";
const applyMutateSpy = vi.spyOn(mutateApplyModule, "applyMutatePatch");

import { applyStepCompletion, MECHANISMS_STEP_ID } from "../../src/steps/reducer.ts";
import type { ReducerDeps } from "../../src/steps/reducer.ts";

interface Harness {
  deps: ReducerDeps;
  setWorkingIRCalls: KeyboardIR[];
}

function makeHarness(initial: KeyboardIR): Harness {
  let working = initial;
  const setWorkingIRCalls: KeyboardIR[] = [];
  const deps: ReducerDeps = {
    lockDesktop: () => {},
    clearStale: () => {},
    setTouchLayoutJson: () => {},
    instantiateFromBase: () => {},
    instantiateFromExisting: () => {},
    buildTouchLayoutJson: () => ({ json: null, warnings: [] }),
    resolveBaseTouchJson: () => undefined,
    instantiateFromBaseIfConfirmed: () => true,
    getWorkingIR: () => working,
    setWorkingIR: (ir: KeyboardIR) => {
      working = ir;
      setWorkingIRCalls.push(ir);
    },
  };
  return { deps, setWorkingIRCalls };
}

beforeEach(() => {
  applyMutateSpy.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("flag OFF: the mechanisms-step re-propagation trigger stays gated (until spec 089 T021)", () => {
  it("the mechanisms-step re-propagation trigger does NOT fire with the flag off", () => {
    vi.stubEnv("VITE_KM_MUTATE_SEAM", "");
    const base = makeTestIR([]);
    const harness = makeHarness(base);
    // Provide the re-propagation deps so only the flag — not a missing dep —
    // gates the trigger. A non-empty stale closure would re-propagate if ungated.
    const deps: ReducerDeps = {
      ...harness.deps,
      getStaleSteps: () => new Set(["touch"]),
    };

    applyStepCompletion(MECHANISMS_STEP_ID, undefined, deps);

    expect(applyMutateSpy).not.toHaveBeenCalled();
    expect(harness.setWorkingIRCalls).toHaveLength(0);
  });
});
