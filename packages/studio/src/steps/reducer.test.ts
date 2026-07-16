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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { repropagate as mockRepropagate } from "./repropagate.ts";

// T024 (single-writer rule): spy on repropagate() to assert the reducer no
// longer injects setTouchLayoutJson into RepropagateDeps.
vi.mock("./repropagate.ts", () => ({ repropagate: vi.fn() }));

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
  } as BaseKeyboard;
}

function makeKeyboardIR(): KeyboardIR {
  return {} as KeyboardIR;
}

function makeVirtualFS(): VirtualFS {
  return new Map() as VirtualFS;
}

function makeTouchAssignments(): TouchCompleteResult["assignments"] {
  return [{ key: "a" }] as TouchCompleteResult["assignments"];
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
//
// Spec 035 R11 update: the reducer no longer gates the build on "assignments
// is empty" — that decision (the R11 emission matrix) moved into the injected
// deps.buildTouchLayoutJson (constructed in StudioShell.tsx, which may import
// lib/touchEmission.ts; this reducer may not). The reducer's own contract is
// now: always call the dep when baseIr is present, passing mods/seedSource
// through unchanged; the dep decides null vs a built json string.
// ---------------------------------------------------------------------------

describe("R2 — touch-layout build at the touch step", () => {
  let deps: ReducerDeps;
  const baseIr = makeKeyboardIR();
  const baseVfs = makeVirtualFS();
  const assignments = makeTouchAssignments();
  const EMPTY_MODS = { removals: [], placements: [] };

  beforeEach(() => { deps = makeDepsMock(); });

  // --- Case A: base ships no touch layout (resolveBaseTouchJson returns undefined) ---

  it("Case A: calls buildTouchLayoutJson with baseTouchJson OMITTED when base has no layout", () => {
    (deps.resolveBaseTouchJson as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    const result: TouchCompleteResult = { assignments, baseIr, baseVfs };
    applyStepCompletion(TOUCH_STEP_ID, result, deps);
    expect(deps.buildTouchLayoutJson).toHaveBeenCalledWith(baseIr, assignments, {
      mods: EMPTY_MODS,
      seedSource: null,
    });
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
    expect(deps.buildTouchLayoutJson).toHaveBeenCalledWith(baseIr, assignments, {
      baseTouchJson: shippedJson,
      mods: EMPTY_MODS,
      seedSource: null,
    });
  });

  // --- mods / seedSource pass through unchanged (R11 gating lives in the dep) ---

  it("passes mods and seedSource through to the dep unchanged", () => {
    const mods = { removals: ["x"], placements: [{ char: "y", hostKey: "K_Y" }] };
    const result: TouchCompleteResult = {
      assignments,
      baseIr,
      baseVfs,
      mods,
      seedSource: "reseed-from-desktop",
    };
    applyStepCompletion(TOUCH_STEP_ID, result, deps);
    expect(deps.buildTouchLayoutJson).toHaveBeenCalledWith(baseIr, assignments, {
      mods,
      seedSource: "reseed-from-desktop",
    });
  });

  // --- Empty assignments no longer short-circuits the reducer itself ---

  it("still calls buildTouchLayoutJson even when assignments is empty (gating moved to the injected dep)", () => {
    const result: TouchCompleteResult = { assignments: [], baseIr, baseVfs };
    applyStepCompletion(TOUCH_STEP_ID, result, deps);
    expect(deps.buildTouchLayoutJson).toHaveBeenCalledWith(baseIr, [], {
      mods: EMPTY_MODS,
      seedSource: null,
    });
    // makeDepsMock's default buildTouchLayoutJson mock returns non-null json,
    // so with empty assignments the reducer still persists whatever the dep
    // decided (here: the mock's default, non-null, json).
    expect(deps.setTouchLayoutJson).toHaveBeenCalledWith('{"k":"v"}');
  });

  it("sets touchLayoutJson to null when baseIr is null — the one gate the reducer still owns", () => {
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
    const removalCapabilities = new Map() as InstantiateResult["removalCapabilities"];
    const result: InstantiateResult = { base, ir, vfs, track: "adapt", removalCapabilities };
    applyStepCompletion(CHOOSE_BASE_STEP_ID, result, deps);
    expect(deps.instantiateFromExisting).toHaveBeenCalledWith(base, { vfs, ir, removalCapabilities });
  });

  it("Track 2: skips instantiation when ir is null (mock-engine path only)", () => {
    const result: InstantiateResult = { base, ir: null, vfs: null, track: "adapt" };
    applyStepCompletion(CHOOSE_BASE_STEP_ID, result, deps);
    expect(deps.instantiateFromExisting).not.toHaveBeenCalled();
  });

  // spec 034 T005 / TI-2: the null-ir adapt path is a mock-only artifact and is
  // unreachable under the real engine. When it IS hit, the reducer must NOT be
  // silent — it logs at error level so the stranded-no-working-copy state is
  // visible, rather than a benign warn that reads as "nothing to do".
  it("Track 2: surfaces a non-silent error (console.error) when ir is null", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result: InstantiateResult = { base, ir: null, vfs: null, track: "adapt" };
      applyStepCompletion(CHOOSE_BASE_STEP_ID, result, deps);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0]?.[0])).toContain("cannot instantiate");
      expect(deps.instantiateFromExisting).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
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

  // Spec 035 R11 superseded the old "assignments.length === 0 → null"
  // short-circuit: the reducer now always calls the injected
  // buildTouchLayoutJson dep when baseIr is present, and the dep (not this
  // reducer) decides null vs a built json string via the R11 emission
  // matrix. The one gate this reducer still owns unconditionally is
  // baseIr === null.
  it("touch step: empty assignments with baseIr present still calls the build dep (gating moved to R11)", () => {
    applyStepCompletion(TOUCH_STEP_ID, { assignments: [], baseIr: makeKeyboardIR(), baseVfs: null }, deps);
    expect(deps.buildTouchLayoutJson).toHaveBeenCalled();
  });

  it("touch step: null baseIr → setTouchLayoutJson(null)", () => {
    applyStepCompletion(TOUCH_STEP_ID, { assignments: [{}], baseIr: null, baseVfs: null }, deps);
    expect(deps.setTouchLayoutJson).toHaveBeenCalledWith(null);
  });

  it("touch step: successful build → setTouchLayoutJson(json)", () => {
    const json = '{"k":1}';
    (deps.buildTouchLayoutJson as ReturnType<typeof vi.fn>).mockReturnValue({ json, warnings: [] });
    applyStepCompletion(TOUCH_STEP_ID, { assignments: [{}], baseIr: makeKeyboardIR(), baseVfs: null }, deps);
    expect(deps.setTouchLayoutJson).toHaveBeenCalledWith(json);
  });

  // Pre-refactor onInstantiate: if track === "adapt" → instantiateFromExisting(...);
  // else → instantiateFromBaseIfConfirmed(...).
  it("choose_base step: track adapt → instantiateFromExisting", () => {
    const base = makeBaseKeyboard();
    const ir = makeKeyboardIR();
    const vfs = makeVirtualFS();
    applyStepCompletion(CHOOSE_BASE_STEP_ID, { base, ir, vfs, track: "adapt" }, deps);
    expect(deps.instantiateFromExisting).toHaveBeenCalledWith(base, { vfs, ir });
  });

  it("choose_base step: track null (default) → instantiateFromBaseIfConfirmed", () => {
    const base = makeBaseKeyboard();
    const ir = makeKeyboardIR();
    const vfs = makeVirtualFS();
    applyStepCompletion(CHOOSE_BASE_STEP_ID, { base, ir, vfs, track: null }, deps);
    expect(deps.instantiateFromBaseIfConfirmed).toHaveBeenCalledWith(base, { vfs, ir });
  });

  // Pre-refactor: Track 2 with null ir → console.warn and return (no instantiation).
  it("choose_base step: Track 2 with null ir → no instantiation (mock engine guard)", () => {
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

// ---------------------------------------------------------------------------
// T024 — single-writer rule: the mechanisms-completion repropagate() call no
// longer injects setTouchLayoutJson (buildTouchLayoutJson is the sole writer
// of the .keyman-touch-layout artifact; repropagate() owns ir.touchLayout
// provenance/merge only).
// ---------------------------------------------------------------------------

describe("T024 — repropagate() call site no longer injects setTouchLayoutJson", () => {
  let deps: ReducerDeps;

  beforeEach(() => {
    deps = makeDepsMock();
    deps.getStaleSteps = vi.fn().mockReturnValue(new Set(["touch"]));
    deps.getWorkingIR = vi.fn().mockReturnValue(makeKeyboardIR());
    deps.setWorkingIR = vi.fn();
    vi.stubEnv("VITE_KM_MUTATE_SEAM", "1");
    (mockRepropagate as ReturnType<typeof vi.fn>).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("calls repropagate() with a deps object that has no setTouchLayoutJson member", () => {
    applyStepCompletion(MECHANISMS_STEP_ID, undefined, deps);
    expect(mockRepropagate).toHaveBeenCalledTimes(1);
    const passedDeps = (mockRepropagate as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect("setTouchLayoutJson" in passedDeps).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// spec 034 T006 (TI-1, TI-2) — integration against the REAL working-copy store
//
// The unit tests above inject mock instantiate actions. Here we wire the REAL
// useWorkingCopyStore actions as the reducer deps and drive a choose_base
// completion with a genuine (non-null) IR + VFS — i.e. what the real engine
// delivers for a codec-clean base. Both tracks must land a live, mutable
// working copy (non-null ir) with the correct instantiationMode, and neither
// must hit the mock-only null-ir skip path (TI-2).
// ---------------------------------------------------------------------------

describe("spec 034 T006 — choose_base yields a live working copy via the real store", () => {
  // A minimal-but-real IR: instantiate seeds axes via detectMarkInputOrderFromImport,
  // which iterates ir.groups — so `groups` must exist (an empty group list is a
  // valid codec-clean shape with no mark-order rules).
  const realIr = { groups: [] } as unknown as KeyboardIR;
  const realVfs = new Map() as VirtualFS;
  const base = makeBaseKeyboard("copy_edit_base");

  /** Reducer deps backed by the real store's instantiate actions. */
  function realStoreDeps(): ReducerDeps {
    const st = useWorkingCopyStore.getState();
    return {
      ...makeDepsMock(),
      instantiateFromBase: st.instantiateFromBase,
      instantiateFromExisting: st.instantiateFromExisting,
      // Mirror the production Track-1 wrapper: only instantiate when the IR/VFS
      // are present (the real-engine invariant), else report "skipped".
      instantiateFromBaseIfConfirmed: (b, opts) => {
        if (opts.ir === null || opts.vfs === null) return false;
        st.instantiateFromBase(b, {
          vfs: opts.vfs,
          ir: opts.ir,
          ...(opts.removalCapabilities !== undefined ? { removalCapabilities: opts.removalCapabilities } : {}),
        });
        return true;
      },
    };
  }

  beforeEach(() => {
    useWorkingCopyStore.getState().reset();
  });

  it("TI-1 Track 1 (copy): instantiateFromBase yields a non-null ir + instantiationMode 'new-from-base'", () => {
    applyStepCompletion(CHOOSE_BASE_STEP_ID, { base, ir: realIr, vfs: realVfs, track: "copy" }, realStoreDeps());
    const st = useWorkingCopyStore.getState();
    expect(st.ir).not.toBeNull();
    expect(st.instantiationMode).toBe("new-from-base");
    expect(st.isInstantiated()).toBe(true);
  });

  it("TI-1 Track 2 (adapt): instantiateFromExisting yields a non-null ir + instantiationMode 'adapt-existing'", () => {
    applyStepCompletion(CHOOSE_BASE_STEP_ID, { base, ir: realIr, vfs: realVfs, track: "adapt" }, realStoreDeps());
    const st = useWorkingCopyStore.getState();
    expect(st.ir).not.toBeNull();
    expect(st.instantiationMode).toBe("adapt-existing");
    expect(st.isInstantiated()).toBe(true);
  });

  it("TI-2 Track 2 (adapt) preserves the loaded keyboard's identity (not reset)", () => {
    applyStepCompletion(CHOOSE_BASE_STEP_ID, { base, ir: realIr, vfs: realVfs, track: "adapt" }, realStoreDeps());
    const st = useWorkingCopyStore.getState();
    // Track 2 keeps identity from the loaded keyboard (Track 1 would null it).
    expect(st.identity?.keyboardId).toBe(base.id);
  });
});
