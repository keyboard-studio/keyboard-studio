// reducer.test.ts — T027 (P4b foundation).
//
// Asserts R1–R6 from the manifest-reducer contract:
//   R1 — RETIRED at spec 090 T041: the mechanisms lock + re-propagation
//        re-homed to lib/assignLoopCompletion.ts (D-090-38); the R1 block
//        below pins the reducer's no-op at that step, and the behaviour
//        coverage lives in lib/assignLoopCompletion.test.ts.
//   R2 — RETIRED at spec 090 T042: the touch-layout build re-homed to
//        lib/assignLoopCompletion.ts (D-090-38); the R2 block below pins
//        the reducer's no-op at that step, and the behaviour coverage
//        (Case-A/Case-B + error→null graceful degradation) lives in
//        lib/assignLoopCompletion.test.ts.
//   R3 — copy/adapt routes Track 2 → instantiateFromExisting, Track 1/default → instantiateFromBaseIfConfirmed.
//   R4 — editor purity: no editor component calls the reducer (enforced by review; here we
//         test that the reducer is standalone and not called from the adapter files).
//   R5 — unknown step id is a no-op.
//
// The
// question-answer write path is the decision-apply runner now (spec 089:
// steps/applyDecisionEffects.test.ts); touch re-propagation at mechanisms
// is likewise unconditional (pinned in lib/assignLoopCompletion.test.ts).
//
// Source of truth: specs/012-step-model-manifest/contracts/manifest-reducer.contract.md

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  applyStepCompletion,
  MECHANISMS_STEP_ID,
  TOUCH_STEP_ID,
  CHOOSE_BASE_STEP_ID,
  type ReducerDeps,
  type InstantiateResult,
} from "./reducer.ts";
import type { BaseKeyboard, KeyboardIR, VirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
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
  return makeTestIR([]);
}

function makeVirtualFS(): VirtualFS {
  return new Map() as VirtualFS;
}

// ---------------------------------------------------------------------------
// Mock ReducerDeps factory — every dep starts as a vi.fn().
// Call makeDepsMock() fresh for each test so mocks don't leak.
// ---------------------------------------------------------------------------

function makeDepsMock(): ReducerDeps {
  return {
    instantiateFromBase: vi.fn(),
    instantiateFromExisting: vi.fn(),
    instantiateFromBaseIfConfirmed: vi.fn().mockReturnValue(true),
  };
}

// ---------------------------------------------------------------------------
// R1 — lock fires at mechanisms step
// ---------------------------------------------------------------------------

describe("R1 — retired at spec 090 T041: the reducer is a no-op at the mechanisms step", () => {
  let deps: ReducerDeps;
  beforeEach(() => {
    deps = makeDepsMock();
    (mockRepropagate as ReturnType<typeof vi.fn>).mockClear();
  });

  it("calls no dep at the mechanisms step (lock + repropagate live in lib/assignLoopCompletion.ts)", () => {
    applyStepCompletion(MECHANISMS_STEP_ID, undefined, deps);
    expect(deps.instantiateFromExisting).not.toHaveBeenCalled();
    expect(deps.instantiateFromBaseIfConfirmed).not.toHaveBeenCalled();
    expect(deps.instantiateFromBase).not.toHaveBeenCalled();
    expect(mockRepropagate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// R2 — touch-layout build with Case-A / Case-B + graceful degradation
//
// RETIRED at spec 090 T042: the R2 hook re-homed to
// lib/assignLoopCompletion.ts (applyTouchCompletionEffects), where its
// Case-A/Case-B, R11-gate, and graceful-degradation coverage now lives
// (lib/assignLoopCompletion.test.ts). The pin below holds the reducer's
// side of the retirement: the touch step is a no-op here.
// ---------------------------------------------------------------------------

describe("R2 — retired at spec 090 T042: the reducer is a no-op at the touch step", () => {
  it("calls no dep at the touch step", () => {
    const deps = makeDepsMock();
    applyStepCompletion(TOUCH_STEP_ID, { assignments: [], baseIr: null, baseVfs: null }, deps);
    expect(deps.instantiateFromExisting).not.toHaveBeenCalled();
    expect(deps.instantiateFromBaseIfConfirmed).not.toHaveBeenCalled();
    expect(deps.instantiateFromBase).not.toHaveBeenCalled();
  });
});

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
    expect(deps.instantiateFromBaseIfConfirmed).not.toHaveBeenCalled();
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

  // F1 fix: doCommit (StudioShell.tsx) sets skipRebaseConfirm: true once
  // BaseResolutionAdapter.onConfirm has already resolved the rebase question
  // synchronously (confirmRebaseTo) — the reducer must forward that as a
  // third `{ skipConfirm: true }` argument so instantiateFromBaseIfConfirmed
  // does not ask a second time. Absent/false (the default, asserted just
  // above) keeps the original 2-arg call shape for every other caller.
  it("Track 1 with skipRebaseConfirm: true forwards { skipConfirm: true } as a third arg", () => {
    const result: InstantiateResult = { base, ir, vfs, track: null, skipRebaseConfirm: true };
    applyStepCompletion(CHOOSE_BASE_STEP_ID, result, deps);
    expect(deps.instantiateFromBaseIfConfirmed).toHaveBeenCalledWith(base, { vfs, ir }, { skipConfirm: true });
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

  // A `result` of literally `undefined` (not `{}`) previously threw
  // (`payload.base` read off an `undefined`-cast value) — surfaced by the
  // journey-corpus harness (spec 032) driving a step with nothing to report.
  it("does not throw and skips instantiation when result is undefined", () => {
    expect(() => applyStepCompletion(CHOOSE_BASE_STEP_ID, undefined, deps)).not.toThrow();
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
      expect(deps.instantiateFromExisting).not.toHaveBeenCalled();
      expect(deps.instantiateFromBaseIfConfirmed).not.toHaveBeenCalled();
    });
  }
});

// ---------------------------------------------------------------------------
// R4 — editor purity
// ---------------------------------------------------------------------------

describe("R4 — the reducer holds no store state of its own", () => {
  // Editor purity (structural: the reducer does not import from editors/)
  // This is enforced by the boundary rule (steps-layer) and by review.
  // We verify here that applyStepCompletion itself is a standalone function
  // that takes all deps injected — if it imported stores/lib, depcruise would fail.
  it("R4 — reducer is a pure function of its arguments (no captured store references)", () => {
    // Calling with completely independent mock objects that share no reference
    // with any real store confirms the reducer doesn't rely on module-level singletons.
    // (Probe step re-pointed from mechanisms to choose_base at spec 090 T041:
    // the mechanisms case retired, so it exercises no deps at all now.)
    const deps1 = makeDepsMock();
    const deps2 = makeDepsMock();
    const result: InstantiateResult = {
      base: makeBaseKeyboard(),
      ir: makeKeyboardIR(),
      vfs: makeVirtualFS(),
      track: "adapt",
    };
    applyStepCompletion(CHOOSE_BASE_STEP_ID, result, deps1);
    applyStepCompletion(CHOOSE_BASE_STEP_ID, result, deps2);
    expect(deps1.instantiateFromExisting).toHaveBeenCalledTimes(1);
    expect(deps2.instantiateFromExisting).toHaveBeenCalledTimes(1);
    // deps1's dep was not called by the deps2 invocation (no cross-contamination)
    expect(deps1.instantiateFromExisting).not.toBe(deps2.instantiateFromExisting);
  });
});

// ---------------------------------------------------------------------------
// T024 — single-writer rule: the mechanisms-completion repropagate() call
// injects no setTouchLayoutJson (buildTouchLayoutJson is the sole writer
// of the .keyman-touch-layout artifact; repropagate() owns ir.touchLayout
// provenance/merge only). The call site moved with R1 to
// lib/assignLoopCompletion.ts at spec 090 T041 — the pin lives in
// lib/assignLoopCompletion.test.ts now.
// ---------------------------------------------------------------------------

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
  // valid codec-clean shape with no mark-order rules). Instantiation also now
  // derives facets (spec 048), which reads `ir.stores`/`ir.raw` — so a
  // partial cast is no longer sufficient; use the real fixture helper for a
  // fully-shaped (if empty) KeyboardIR.
  const realIr = makeTestIR([]);
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

// ---------------------------------------------------------------------------
// Spec 071 — marks-series completion applies the mark guards: RETIRED here
// (spec 090 T023). The guards moved to the marks-treatment module's apply;
// the assertions live in survey/questions/gallery/marksTreatment.test.tsx.
// ---------------------------------------------------------------------------

