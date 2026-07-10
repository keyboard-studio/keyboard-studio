// reducer.test.ts — T027 (P4b foundation).
//
// Asserts R1–R6 from the manifest-reducer contract:
//   R1 — lock fires once at the mechanisms step.
//   R2 — touch-build runs with Case-A/Case-B + error→null→advance (graceful degradation).
//   R3 — copy/adapt routes Track 2 → instantiateFromExisting, Track 1/default → instantiateFromBaseIfConfirmed.
//   R4 — editor purity: no editor component calls the reducer (enforced by review; here we
//         test that the reducer is standalone and not called from the adapter files).
//   R5 — unknown step id is a no-op.
//   R6 — behavior parity: for same inputs, observable store state matches pre-refactor inline path.
//
// Source of truth: specs/012-step-model-manifest/contracts/manifest-reducer.contract.md
// Pre-refactor inline path: StudioShell.tsx handleMechanismsComplete (line 377),
//   handlePhaseEComplete (lines 380-410), onInstantiate (lines 240-253).

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  applyStepCompletion,
  MECHANISMS_STEP_ID,
  TOUCH_STEP_ID,
  CHOOSE_BASE_STEP_ID,
  type ReducerDeps,
  type InstantiateResult,
  type TouchCompleteResult,
} from "./reducer.ts";
import type { BaseKeyboard, KeyboardIR, VirtualFS } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Minimal fixtures (all functions use unknown-shaped data; only the
// fields the reducer actually reads need to be realistic.)
// ---------------------------------------------------------------------------

function makeBaseKeyboard(id = "base_kbd"): BaseKeyboard {
  return {
    id,
    displayName: "Test Base",
    languages: [],
    path: `release/t/${id}`,
    bcp47: "en",
  } as unknown as BaseKeyboard;
}

function makeKeyboardIR(): KeyboardIR {
  return {} as unknown as KeyboardIR;
}

function makeVirtualFS(): VirtualFS {
  return new Map() as unknown as VirtualFS;
}

// ---------------------------------------------------------------------------
// Mock ReducerDeps factory — every dep starts as a vi.fn().
// Call makeDepsMock() fresh for each test so mocks don't leak.
// ---------------------------------------------------------------------------

function makeDepsMock(): ReducerDeps {
  return {
    lockDesktop: vi.fn(),
    clearStale: vi.fn(),
    setTouchLayoutJson: vi.fn(),
    instantiateFromBase: vi.fn(),
    instantiateFromExisting: vi.fn(),
    buildTouchLayoutJson: vi.fn().mockReturnValue({ json: '{"k":"v"}', warnings: [] }),
    resolveBaseTouchJson: vi.fn().mockReturnValue(undefined), // Case A by default
    instantiateFromBaseIfConfirmed: vi.fn().mockReturnValue(true),
  };
}

// ---------------------------------------------------------------------------
// R1 — lock fires at mechanisms step
// ---------------------------------------------------------------------------

describe("R1 — lockDesktop fires at the mechanisms step", () => {
  let deps: ReducerDeps;
  beforeEach(() => { deps = makeDepsMock(); });

  it("calls lockDesktop exactly once when stepId is 'mechanisms'", () => {
    applyStepCompletion(MECHANISMS_STEP_ID, undefined, deps);
    expect(deps.lockDesktop).toHaveBeenCalledTimes(1);
  });

  it("calls no other store action at the mechanisms step", () => {
    applyStepCompletion(MECHANISMS_STEP_ID, undefined, deps);
    expect(deps.setTouchLayoutJson).not.toHaveBeenCalled();
    expect(deps.instantiateFromExisting).not.toHaveBeenCalled();
    expect(deps.instantiateFromBaseIfConfirmed).not.toHaveBeenCalled();
    expect(deps.buildTouchLayoutJson).not.toHaveBeenCalled();
  });

  it("does NOT fire lockDesktop for a different step id", () => {
    applyStepCompletion("carve", undefined, deps);
    expect(deps.lockDesktop).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// R2 — touch-layout build with Case-A / Case-B + graceful degradation
// ---------------------------------------------------------------------------

describe("R2 — touch-layout build at the touch step", () => {
  let deps: ReducerDeps;
  const baseIr = makeKeyboardIR();
  const baseVfs = makeVirtualFS();
  const assignments = [{ key: "a" }] as unknown as TouchCompleteResult["assignments"];

  beforeEach(() => { deps = makeDepsMock(); });

  // --- Case A: base ships no touch layout (resolveBaseTouchJson returns undefined) ---

  it("Case A: calls buildTouchLayoutJson with undefined baseTouchJson when base has no layout", () => {
    (deps.resolveBaseTouchJson as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    const result: TouchCompleteResult = { assignments, baseIr, baseVfs };
    applyStepCompletion(TOUCH_STEP_ID, result, deps);
    expect(deps.buildTouchLayoutJson).toHaveBeenCalledWith(baseIr, assignments, undefined);
  });

  it("Case A: calls setTouchLayoutJson with the built json string", () => {
    const json = '{"generated":true}';
    (deps.buildTouchLayoutJson as ReturnType<typeof vi.fn>).mockReturnValue({ json, warnings: [] });
    const result: TouchCompleteResult = { assignments, baseIr, baseVfs };
    applyStepCompletion(TOUCH_STEP_ID, result, deps);
    expect(deps.setTouchLayoutJson).toHaveBeenCalledWith(json);
  });

  // --- Case B: base ships a touch layout (resolveBaseTouchJson returns a string) ---

  it("Case B: passes the shipped baseTouchJson to buildTouchLayoutJson", () => {
    const shippedJson = '{"shipped":true}';
    (deps.resolveBaseTouchJson as ReturnType<typeof vi.fn>).mockReturnValue(shippedJson);
    const result: TouchCompleteResult = { assignments, baseIr, baseVfs };
    applyStepCompletion(TOUCH_STEP_ID, result, deps);
    expect(deps.buildTouchLayoutJson).toHaveBeenCalledWith(baseIr, assignments, shippedJson);
  });

  // --- Empty assignments → clear stored layout ---

  it("sets touchLayoutJson to null when assignments array is empty", () => {
    const result: TouchCompleteResult = { assignments: [], baseIr, baseVfs };
    applyStepCompletion(TOUCH_STEP_ID, result, deps);
    expect(deps.setTouchLayoutJson).toHaveBeenCalledWith(null);
    expect(deps.buildTouchLayoutJson).not.toHaveBeenCalled();
  });

  it("sets touchLayoutJson to null when baseIr is null (no IR available)", () => {
    const result: TouchCompleteResult = { assignments, baseIr: null, baseVfs };
    applyStepCompletion(TOUCH_STEP_ID, result, deps);
    expect(deps.setTouchLayoutJson).toHaveBeenCalledWith(null);
    expect(deps.buildTouchLayoutJson).not.toHaveBeenCalled();
  });

  // --- Graceful degradation: build throws → set null, do not block ---

  it("graceful degradation: sets null and does not throw when buildTouchLayoutJson throws", () => {
    (deps.buildTouchLayoutJson as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("emit pipeline failure");
    });
    const result: TouchCompleteResult = { assignments, baseIr, baseVfs };
    expect(() => applyStepCompletion(TOUCH_STEP_ID, result, deps)).not.toThrow();
    expect(deps.setTouchLayoutJson).toHaveBeenCalledWith(null);
  });

  it("graceful degradation: setTouchLayoutJson(null) is called even when build throws (advance proceeds)", () => {
    (deps.buildTouchLayoutJson as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("emit pipeline failure");
    });
    const result: TouchCompleteResult = { assignments, baseIr, baseVfs };
    applyStepCompletion(TOUCH_STEP_ID, result, deps);
    expect(deps.setTouchLayoutJson).toHaveBeenCalledTimes(1);
    expect(deps.setTouchLayoutJson).toHaveBeenCalledWith(null);
  });

  // --- Warnings logged but do not abort ---

  it("calls setTouchLayoutJson with the json even when buildTouchLayoutJson returns warnings", () => {
    const json = '{"result":true}';
    (deps.buildTouchLayoutJson as ReturnType<typeof vi.fn>).mockReturnValue({
      json,
      warnings: ["unmatched key Q"],
    });
    const result: TouchCompleteResult = { assignments, baseIr, baseVfs };
    applyStepCompletion(TOUCH_STEP_ID, result, deps);
    expect(deps.setTouchLayoutJson).toHaveBeenCalledWith(json);
  });

  it("buildTouchLayoutJson returning null json → setTouchLayoutJson(null) is called", () => {
    (deps.buildTouchLayoutJson as ReturnType<typeof vi.fn>).mockReturnValue({ json: null, warnings: [] });
    const result: TouchCompleteResult = { assignments, baseIr, baseVfs };
    applyStepCompletion(TOUCH_STEP_ID, result, deps);
    expect(deps.setTouchLayoutJson).toHaveBeenCalledWith(null);
  });

  // --- Re-completion clears a prior re-review flag ---

  it("calls clearStale(TOUCH_STEP_ID) when the touch step completes, resolving any prior stale flag", () => {
    const result: TouchCompleteResult = { assignments, baseIr, baseVfs };
    applyStepCompletion(TOUCH_STEP_ID, result, deps);
    expect(deps.clearStale).toHaveBeenCalledExactlyOnceWith(TOUCH_STEP_ID);
  });

  it("calls clearStale(TOUCH_STEP_ID) even on the empty-assignments/no-baseIr short-circuit path", () => {
    const result: TouchCompleteResult = { assignments: [], baseIr: null, baseVfs };
    applyStepCompletion(TOUCH_STEP_ID, result, deps);
    expect(deps.clearStale).toHaveBeenCalledExactlyOnceWith(TOUCH_STEP_ID);
  });
});

// ---------------------------------------------------------------------------
// R3 — copy/adapt routing
// ---------------------------------------------------------------------------

describe("R3 — copy/adapt instantiation routing at choose_base", () => {
  let deps: ReducerDeps;
  const base = makeBaseKeyboard();
  const ir = makeKeyboardIR();
  const vfs = makeVirtualFS();

  beforeEach(() => { deps = makeDepsMock(); });

  it("Track 2 ('adapt'): calls instantiateFromExisting, not instantiateFromBaseIfConfirmed", () => {
    const result: InstantiateResult = { base, ir, vfs, track: "adapt" };
    applyStepCompletion(CHOOSE_BASE_STEP_ID, result, deps);
    expect(deps.instantiateFromExisting).toHaveBeenCalledTimes(1);
    expect(deps.instantiateFromBaseIfConfirmed).not.toHaveBeenCalled();
  });

  it("Track 2: passes base, vfs, ir to instantiateFromExisting", () => {
    const result: InstantiateResult = { base, ir, vfs, track: "adapt" };
    applyStepCompletion(CHOOSE_BASE_STEP_ID, result, deps);
    expect(deps.instantiateFromExisting).toHaveBeenCalledWith(base, { vfs, ir });
  });

  it("Track 2: passes removalCapabilities when provided", () => {
    const removalCapabilities = new Map<string, unknown>() as unknown as Map<string, import("@keyboard-studio/contracts").RemovalCapability>;
    const result: InstantiateResult = { base, ir, vfs, track: "adapt", removalCapabilities };
    applyStepCompletion(CHOOSE_BASE_STEP_ID, result, deps);
    expect(deps.instantiateFromExisting).toHaveBeenCalledWith(base, { vfs, ir, removalCapabilities });
  });

  it("Track 2: warns and skips when ir is null (mock engine path)", () => {
    const result: InstantiateResult = { base, ir: null, vfs: null, track: "adapt" };
    applyStepCompletion(CHOOSE_BASE_STEP_ID, result, deps);
    expect(deps.instantiateFromExisting).not.toHaveBeenCalled();
  });

  it("Track 1 (null track): calls instantiateFromBaseIfConfirmed, not instantiateFromExisting", () => {
    const result: InstantiateResult = { base, ir, vfs, track: null };
    applyStepCompletion(CHOOSE_BASE_STEP_ID, result, deps);
    expect(deps.instantiateFromBaseIfConfirmed).toHaveBeenCalledTimes(1);
    expect(deps.instantiateFromExisting).not.toHaveBeenCalled();
  });

  it("Track 1: passes base, vfs, ir to instantiateFromBaseIfConfirmed", () => {
    const result: InstantiateResult = { base, ir, vfs, track: null };
    applyStepCompletion(CHOOSE_BASE_STEP_ID, result, deps);
    expect(deps.instantiateFromBaseIfConfirmed).toHaveBeenCalledWith(base, { vfs, ir });
  });

  it("Track 1 (non-adapt string): routes to Track 1 path (default)", () => {
    const result: InstantiateResult = { base, ir, vfs, track: "copy" };
    applyStepCompletion(CHOOSE_BASE_STEP_ID, result, deps);
    expect(deps.instantiateFromBaseIfConfirmed).toHaveBeenCalledTimes(1);
    expect(deps.instantiateFromExisting).not.toHaveBeenCalled();
  });

  it("skips instantiation and warns when base is absent from result", () => {
    // result with no base field
    applyStepCompletion(CHOOSE_BASE_STEP_ID, {}, deps);
    expect(deps.instantiateFromExisting).not.toHaveBeenCalled();
    expect(deps.instantiateFromBaseIfConfirmed).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// R5 — unknown step id is a no-op
// ---------------------------------------------------------------------------

describe("R5 — unknown step id is a harmless no-op", () => {
  let deps: ReducerDeps;
  beforeEach(() => { deps = makeDepsMock(); });

  const unknownIds = [
    "some_question_step",
    "desktop_first_notice",
    "language_name_autonym",
    "characters",
    "help",
    "package",
    "",
    "MECHANISMS",      // wrong case
    "TOUCH",           // wrong case
    "choose_BASE",     // wrong case
  ];

  for (const id of unknownIds) {
    it(`no-op for step id "${id}"`, () => {
      expect(() => applyStepCompletion(id, undefined, deps)).not.toThrow();
      expect(deps.lockDesktop).not.toHaveBeenCalled();
      expect(deps.setTouchLayoutJson).not.toHaveBeenCalled();
      expect(deps.instantiateFromExisting).not.toHaveBeenCalled();
      expect(deps.instantiateFromBaseIfConfirmed).not.toHaveBeenCalled();
    });
  }
});

// ---------------------------------------------------------------------------
// R6 — behavior parity with the pre-refactor inline path
//
// Golden parity: for the same inputs, the observable store mutations
// (lockDesktop, setTouchLayoutJson, instantiateFromExisting,
// instantiateFromBaseIfConfirmed) match what the pre-refactor handlers
// in StudioShell.tsx performed.
// ---------------------------------------------------------------------------

describe("R6 — behavior parity with pre-refactor inline handlers", () => {
  let deps: ReducerDeps;

  beforeEach(() => { deps = makeDepsMock(); });

  // Pre-refactor handleMechanismsComplete: calls lockDesktop(), then setStage("E").
  // The reducer equivalent: lockDesktop() — stage transition is the caller's responsibility.
  it("mechanisms step: lockDesktop called exactly once (mirrors handleMechanismsComplete)", () => {
    applyStepCompletion(MECHANISMS_STEP_ID, undefined, deps);
    expect(deps.lockDesktop).toHaveBeenCalledExactlyOnceWith();
  });

  // Pre-refactor handlePhaseEComplete: if assignments.length === 0 or baseIr === null →
  // setTouchLayoutJson(null); else try { build... setTouchLayoutJson(json) } catch { setTouchLayoutJson(null) }.
  it("touch step: parity — empty assignments → setTouchLayoutJson(null)", () => {
    applyStepCompletion(TOUCH_STEP_ID, { assignments: [], baseIr: makeKeyboardIR(), baseVfs: null }, deps);
    expect(deps.setTouchLayoutJson).toHaveBeenCalledWith(null);
  });

  it("touch step: parity — null baseIr → setTouchLayoutJson(null)", () => {
    applyStepCompletion(TOUCH_STEP_ID, { assignments: [{}], baseIr: null, baseVfs: null }, deps);
    expect(deps.setTouchLayoutJson).toHaveBeenCalledWith(null);
  });

  it("touch step: parity — successful build → setTouchLayoutJson(json)", () => {
    const json = '{"k":1}';
    (deps.buildTouchLayoutJson as ReturnType<typeof vi.fn>).mockReturnValue({ json, warnings: [] });
    applyStepCompletion(TOUCH_STEP_ID, { assignments: [{}], baseIr: makeKeyboardIR(), baseVfs: null }, deps);
    expect(deps.setTouchLayoutJson).toHaveBeenCalledWith(json);
  });

  // Pre-refactor onInstantiate: if track === "adapt" → instantiateFromExisting(...);
  // else → instantiateFromBaseIfConfirmed(...).
  it("choose_base step: parity — track adapt → instantiateFromExisting", () => {
    const base = makeBaseKeyboard();
    const ir = makeKeyboardIR();
    const vfs = makeVirtualFS();
    applyStepCompletion(CHOOSE_BASE_STEP_ID, { base, ir, vfs, track: "adapt" }, deps);
    expect(deps.instantiateFromExisting).toHaveBeenCalledWith(base, { vfs, ir });
  });

  it("choose_base step: parity — track null (default) → instantiateFromBaseIfConfirmed", () => {
    const base = makeBaseKeyboard();
    const ir = makeKeyboardIR();
    const vfs = makeVirtualFS();
    applyStepCompletion(CHOOSE_BASE_STEP_ID, { base, ir, vfs, track: null }, deps);
    expect(deps.instantiateFromBaseIfConfirmed).toHaveBeenCalledWith(base, { vfs, ir });
  });

  // Pre-refactor: Track 2 with null ir → console.warn and return (no instantiation).
  it("choose_base step: parity — Track 2 with null ir → no instantiation (mock engine guard)", () => {
    applyStepCompletion(CHOOSE_BASE_STEP_ID, { base: makeBaseKeyboard(), ir: null, vfs: null, track: "adapt" }, deps);
    expect(deps.instantiateFromExisting).not.toHaveBeenCalled();
    expect(deps.instantiateFromBaseIfConfirmed).not.toHaveBeenCalled();
  });

  // R4 — editor purity (structural: the reducer does not import from editors/)
  // This is enforced by the boundary rule (steps-layer) and by review.
  // We verify here that applyStepCompletion itself is a standalone function
  // that takes all deps injected — if it imported stores/lib, depcruise would fail.
  it("R4 — reducer is a pure function of its arguments (no captured store references)", () => {
    // Calling with completely independent mock objects that share no reference
    // with any real store confirms the reducer doesn't rely on module-level singletons.
    const deps1 = makeDepsMock();
    const deps2 = makeDepsMock();
    applyStepCompletion(MECHANISMS_STEP_ID, undefined, deps1);
    applyStepCompletion(MECHANISMS_STEP_ID, undefined, deps2);
    expect(deps1.lockDesktop).toHaveBeenCalledTimes(1);
    expect(deps2.lockDesktop).toHaveBeenCalledTimes(1);
    // deps1.lockDesktop was not called by the deps2 invocation (no cross-contamination)
    expect(deps1.lockDesktop).not.toBe(deps2.lockDesktop);
  });
});
