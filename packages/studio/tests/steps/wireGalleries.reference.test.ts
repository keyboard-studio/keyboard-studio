// Spec 021 — qu-wire-galleries: dedicated REFERENCE-flow don't-regress locks
// (physical R1 / touch R2) + the touch re-propagation add-on stays OFF.
//
// Spec 021 adds NO production code. It confirms the carve / mechanisms / touch
// galleries resolve as first-class manifest map nodes (the map-node assertions
// live in tests/dashboard/wireGalleries.mapNode.test.ts) while each gallery's
// EXISTING write mechanism is preserved byte-for-byte (the per-surface emit-byte
// oracle lives in tests/survey/wireGalleries.emitByteOracle.test.ts).
//
// THIS file pins the two KNOWN-GOOD REFERENCE write paths in the manifest reducer
// (steps/reducer.ts) so neither is destabilised while it gains a map node:
//
//   T007 — physical (R1): the MECHANISMS_STEP_ID branch fires deps.lockDesktop()
//          UNCONDITIONALLY (reducer.ts:222), regardless of the mutate-seam flag,
//          and touches no other store action. REFERENCE — must stay green
//          (FR-006/FR-012/SC-004).
//   T008 — touch (R2): the TOUCH_STEP_ID branch fires deps.buildTouchLayoutJson /
//          deps.setTouchLayoutJson + the `.keyman-touch-layout` side-car
//          UNCONDITIONALLY (reducer.ts:249-277), regardless of the flag, with the
//          same Case-A / Case-B + graceful-degradation behaviour. REFERENCE —
//          must stay green (FR-007/FR-012/SC-004; verified #831 c9f64ba). The
//          emit-BYTE side-car parity lives in the emit-byte oracle file; this
//          file pins the reducer-side R2 write-path invariant.
//   T009 — the flag-gated touch re-propagation ADD-ON (reducer.ts:228-243,
//          guarded on isMutateSeamEnabled()) does NOT run with the flag off; only
//          the unconditional base touch write path fires; the flag-off mechanisms
//          completion is byte-identical to today (FR-008/SC-005).
//
// Plus the reducer-side Phase-1 invariant guards (additive to spec-014's
// reducer.test.ts / reducer.mutateSeam.test.ts, which this file references, not
// re-litigates):
//   T016/T020 — no mutate() / no new write routing executes for the physical or
//          touch surfaces with the flag off; isMutateSeamEnabled() stays the gate.
//
// Test-only: no contracts bump, no write routing, no mutate(), no flag flip in
// production, no re-declaration of any gallery. The reducer code is untouched.
//
// Source of truth:
//   specs/021-qu-wire-galleries/spec.md (US2, FR-006/-007/-008, SC-004/-005)
//   specs/021-qu-wire-galleries/tasks.md (T007/T008/T009/T016/T020)

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  applyStepCompletion,
  MECHANISMS_STEP_ID,
  TOUCH_STEP_ID,
  type ReducerDeps,
  type TouchCompleteResult,
} from "../../src/steps/reducer.ts";
import type { KeyboardIR, VirtualFS } from "@keyboard-studio/contracts";
import { mixedProvenanceIR } from "../fixtures/touchProvenance.ts";

// ---------------------------------------------------------------------------
// A spy-able ReducerDeps. Every dep is a vi.fn() so we can assert which fired.
// The re-propagation deps (getStaleSteps/getWorkingIR/setWorkingIR) are supplied
// so that ONLY the flag — not a missing dep — gates the add-on: a non-empty
// staleness closure over a REAL touch-bearing IR would re-propagate (a base-derived
// + physical-suggested key set) and call setWorkingIR + setTouchLayoutJson if the
// trigger were ungated. This makes the "add-on stays OFF" assertions genuine
// catches: with the flag off, neither setter fires; flip the gate and they would.
// ---------------------------------------------------------------------------

function makeKeyboardIR(): KeyboardIR {
  return {} as unknown as KeyboardIR;
}

function makeVirtualFS(): VirtualFS {
  return new Map() as unknown as VirtualFS;
}

interface Harness {
  deps: ReducerDeps;
  setWorkingIRCalls: KeyboardIR[];
}

function makeHarness(): Harness {
  const setWorkingIRCalls: KeyboardIR[] = [];
  // A real touch-bearing IR with mixed provenance: repropagate() WOULD rewrite the
  // base-derived/physical-suggested keys (and persist the side-car) if it ran.
  let working: KeyboardIR = mixedProvenanceIR();
  const deps: ReducerDeps = {
    lockDesktop: vi.fn(),
    setTouchLayoutJson: vi.fn(),
    instantiateFromBase: vi.fn(),
    instantiateFromExisting: vi.fn(),
    buildTouchLayoutJson: vi.fn().mockReturnValue({ json: '{"built":true}', warnings: [] }),
    resolveBaseTouchJson: vi.fn().mockReturnValue(undefined),
    instantiateFromBaseIfConfirmed: vi.fn().mockReturnValue(true),
    // Re-propagation deps present so the add-on is gated ONLY by the flag.
    getStaleSteps: () => new Set(["touch"]),
    getWorkingIR: () => working,
    setWorkingIR: vi.fn((ir: KeyboardIR) => {
      working = ir;
      setWorkingIRCalls.push(ir);
    }),
  };
  return { deps, setWorkingIRCalls };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// T007 — physical (R1) don't-regress (REFERENCE): lockDesktop() unconditional.
// ---------------------------------------------------------------------------

describe("spec 021 T007 — physical (R1) REFERENCE: lockDesktop() fires unconditionally (FR-006/FR-012/SC-004)", () => {
  it("fires lockDesktop() exactly once at the mechanisms step with the flag OFF", () => {
    vi.stubEnv("VITE_KM_MUTATE_SEAM", "");
    const { deps } = makeHarness();

    applyStepCompletion(MECHANISMS_STEP_ID, undefined, deps);

    expect(deps.lockDesktop).toHaveBeenCalledTimes(1);
  });

  it("fires lockDesktop() exactly once at the mechanisms step with the flag ON (unconditional — flag-independent)", () => {
    // R1 is OUTSIDE the flag gate: the lock runs whatever the flag state. Pinning
    // both flag states proves lockDesktop() is the unconditional base write path.
    vi.stubEnv("VITE_KM_MUTATE_SEAM", "1");
    const { deps } = makeHarness();

    applyStepCompletion(MECHANISMS_STEP_ID, undefined, deps);

    expect(deps.lockDesktop).toHaveBeenCalledTimes(1);
  });

  it("touches NO other store action at the mechanisms step (no touch build, no instantiation) — flag off", () => {
    vi.stubEnv("VITE_KM_MUTATE_SEAM", "");
    const { deps } = makeHarness();

    applyStepCompletion(MECHANISMS_STEP_ID, undefined, deps);

    expect(deps.setTouchLayoutJson).not.toHaveBeenCalled();
    expect(deps.buildTouchLayoutJson).not.toHaveBeenCalled();
    expect(deps.instantiateFromExisting).not.toHaveBeenCalled();
    expect(deps.instantiateFromBaseIfConfirmed).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T008 — touch (R2) don't-regress (REFERENCE): buildTouchLayoutJson /
// setTouchLayoutJson + side-car run unconditionally (reducer.ts:249-277).
// ---------------------------------------------------------------------------

describe("spec 021 T008 — touch (R2) REFERENCE: buildTouchLayoutJson/setTouchLayoutJson run unconditionally (FR-007/FR-012/SC-004)", () => {
  const assignments = [{ key: "a" }] as unknown as TouchCompleteResult["assignments"];

  function runTouch(flag: "" | "1") {
    vi.stubEnv("VITE_KM_MUTATE_SEAM", flag);
    const { deps } = makeHarness();
    const baseIr = makeKeyboardIR();
    const baseVfs = makeVirtualFS();
    const result: TouchCompleteResult = { assignments, baseIr, baseVfs };
    applyStepCompletion(TOUCH_STEP_ID, result, deps);
    return { deps, baseIr };
  }

  it("Case A (no shipped layout): builds from IR and persists via setTouchLayoutJson — flag OFF", () => {
    const { deps, baseIr } = runTouch("");
    // resolveBaseTouchJson → undefined ⇒ Case A: build with undefined baseTouchJson.
    expect(deps.buildTouchLayoutJson).toHaveBeenCalledWith(baseIr, assignments, undefined);
    expect(deps.setTouchLayoutJson).toHaveBeenCalledWith('{"built":true}');
  });

  it("Case A: builds + persists IDENTICALLY with the flag ON (R2 is unconditional — flag-independent)", () => {
    const { deps, baseIr } = runTouch("1");
    expect(deps.buildTouchLayoutJson).toHaveBeenCalledWith(baseIr, assignments, undefined);
    expect(deps.setTouchLayoutJson).toHaveBeenCalledWith('{"built":true}');
  });

  it("Case B (base ships a layout): passes the shipped side-car JSON through to buildTouchLayoutJson", () => {
    vi.stubEnv("VITE_KM_MUTATE_SEAM", "");
    const { deps } = makeHarness();
    const shipped = '{"shipped":true}';
    (deps.resolveBaseTouchJson as ReturnType<typeof vi.fn>).mockReturnValue(shipped);
    const baseIr = makeKeyboardIR();
    const result: TouchCompleteResult = { assignments, baseIr, baseVfs: makeVirtualFS() };

    applyStepCompletion(TOUCH_STEP_ID, result, deps);

    // The #831 side-car is the input the touch build edits faithfully (Case B).
    expect(deps.resolveBaseTouchJson).toHaveBeenCalledTimes(1);
    expect(deps.buildTouchLayoutJson).toHaveBeenCalledWith(baseIr, assignments, shipped);
  });

  it("empty assignments → clears the stored touch layout (setTouchLayoutJson(null)); no build", () => {
    vi.stubEnv("VITE_KM_MUTATE_SEAM", "");
    const { deps } = makeHarness();
    const result: TouchCompleteResult = {
      assignments: [] as unknown as TouchCompleteResult["assignments"],
      baseIr: makeKeyboardIR(),
      baseVfs: makeVirtualFS(),
    };

    applyStepCompletion(TOUCH_STEP_ID, result, deps);

    expect(deps.setTouchLayoutJson).toHaveBeenCalledWith(null);
    expect(deps.buildTouchLayoutJson).not.toHaveBeenCalled();
  });

  it("graceful degradation: a build throw still persists setTouchLayoutJson(null), never throws (advance proceeds)", () => {
    vi.stubEnv("VITE_KM_MUTATE_SEAM", "");
    const { deps } = makeHarness();
    (deps.buildTouchLayoutJson as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("emit pipeline failure");
    });
    const result: TouchCompleteResult = {
      assignments,
      baseIr: makeKeyboardIR(),
      baseVfs: makeVirtualFS(),
    };

    expect(() => applyStepCompletion(TOUCH_STEP_ID, result, deps)).not.toThrow();
    expect(deps.setTouchLayoutJson).toHaveBeenCalledWith(null);
  });
});

// ---------------------------------------------------------------------------
// T009 — the flag-gated touch re-propagation ADD-ON stays OFF (reducer.ts:228-243).
// ---------------------------------------------------------------------------

describe("spec 021 T009 — touch re-propagation add-on stays OFF with the flag off (FR-008/SC-005)", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_KM_MUTATE_SEAM", "");
  });

  it("does NOT run the add-on at the mechanisms step — setWorkingIR is never called (flag off)", () => {
    const { deps, setWorkingIRCalls } = makeHarness();
    // getStaleSteps returns a NON-empty closure; only the flag should gate the add-on.

    applyStepCompletion(MECHANISMS_STEP_ID, undefined, deps);

    // The add-on writes the re-propagated IR via setWorkingIR; with the flag off it
    // never runs, so no IR write occurs — only the unconditional lockDesktop() fires.
    expect(setWorkingIRCalls).toHaveLength(0);
    expect(deps.setWorkingIR).not.toHaveBeenCalled();
    expect(deps.lockDesktop).toHaveBeenCalledTimes(1);
  });

  it("does NOT re-serialise the side-car from the add-on (setTouchLayoutJson untouched at mechanisms) — flag off", () => {
    const { deps } = makeHarness();

    applyStepCompletion(MECHANISMS_STEP_ID, undefined, deps);

    // The add-on (issue #831) would persist a re-propagated side-car via
    // setTouchLayoutJson; with the flag off it never does at the mechanisms step.
    expect(deps.setTouchLayoutJson).not.toHaveBeenCalled();
  });

  it("the flag-off mechanisms completion is byte-identical to today: only lockDesktop() fires", () => {
    const { deps, setWorkingIRCalls } = makeHarness();

    applyStepCompletion(MECHANISMS_STEP_ID, undefined, deps);

    // The complete observable effect set of a flag-off mechanisms completion.
    expect(deps.lockDesktop).toHaveBeenCalledTimes(1);
    expect(setWorkingIRCalls).toHaveLength(0);
    expect(deps.setTouchLayoutJson).not.toHaveBeenCalled();
    expect(deps.buildTouchLayoutJson).not.toHaveBeenCalled();
    expect(deps.instantiateFromExisting).not.toHaveBeenCalled();
    expect(deps.instantiateFromBaseIfConfirmed).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T016 / T020 — reducer-side Phase-1 invariant guards: no mutate() / no new write
// routing executes for the physical or touch surfaces with the flag off.
// (Additive to spec-014's reducer.mutateSeam.test.ts; the flag-gate audit is owned
// there — this confirms the invariant for THIS spec's three surfaces.)
// ---------------------------------------------------------------------------

describe("spec 021 T016/T020 — no mutate() / no new write routing for physical or touch (flag off) (FR-009/FR-015/SC-008)", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_KM_MUTATE_SEAM", "");
  });

  it("physical: the mechanisms completion writes the IR by NO route (setWorkingIR never called)", () => {
    const { deps } = makeHarness();
    applyStepCompletion(MECHANISMS_STEP_ID, undefined, deps);
    expect(deps.setWorkingIR).not.toHaveBeenCalled();
  });

  it("touch: the touch completion writes the IR by NO route — it only persists the side-car via R2", () => {
    const { deps } = makeHarness();
    const result: TouchCompleteResult = {
      assignments: [{ key: "a" }] as unknown as TouchCompleteResult["assignments"],
      baseIr: makeKeyboardIR(),
      baseVfs: makeVirtualFS(),
    };

    applyStepCompletion(TOUCH_STEP_ID, result, deps);

    // R2 persists the touch layout JSON (setTouchLayoutJson); it never routes a
    // KeyboardIR write through the mutate() seam (setWorkingIR) — that is Phase 2.
    expect(deps.setWorkingIR).not.toHaveBeenCalled();
    expect(deps.setTouchLayoutJson).toHaveBeenCalledTimes(1);
  });
});
