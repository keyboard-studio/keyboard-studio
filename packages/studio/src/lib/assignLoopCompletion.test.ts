// assignLoopCompletion.test.ts — spec 090 T041/T042.
//
// Pins for the physical completion effects (R1, re-homed from
// steps/reducer.ts — D-090-38):
//   - the desktop locks on the real working-copy store;
//   - repropagate runs exactly once, fed by the store's staleness
//     closure and IR accessors;
//   - T024 single-writer rule, carried over from reducer.test.ts:
//     the repropagate deps object carries NO setTouchLayoutJson
//     member (buildTouchLayoutJson is the sole writer of the
//     .keyman-touch-layout artifact; repropagate owns ir.touchLayout
//     provenance/merge only).
//
// And for the touch completion effects (R2, re-homed at T042 with
// its Case-A/Case-B + graceful-degradation coverage from
// reducer.test.ts): the lib build/resolve modules are mocked; the
// R11 emission matrix (lib/touchEmission.ts) and the working-copy
// store are real.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { TouchAssignment } from "@keyboard-studio/contracts";
import {
  bindManifest,
  useWorkingCopyStore,
} from "../stores/workingCopyStore.ts";
import { manifest } from "../steps/manifest.ts";
import { repropagate as mockRepropagate } from "../steps/repropagate.ts";
import { buildTouchLayoutJson } from "./buildTouchLayoutJson.ts";
import { resolveBaseTouchJson } from "./resolveBaseTouchJson.ts";
import {
  applyPhysicalCompletionEffects,
  applyTouchCompletionEffects,
} from "./assignLoopCompletion.ts";

vi.mock("../steps/repropagate.ts", () => ({ repropagate: vi.fn() }));
vi.mock("./buildTouchLayoutJson.ts", () => ({ buildTouchLayoutJson: vi.fn() }));
vi.mock("./resolveBaseTouchJson.ts", () => ({ resolveBaseTouchJson: vi.fn() }));

const mockReprop = mockRepropagate as ReturnType<typeof vi.fn>;
const mockBuild = buildTouchLayoutJson as ReturnType<typeof vi.fn>;
const mockResolve = resolveBaseTouchJson as ReturnType<typeof vi.fn>;

beforeEach(() => {
  bindManifest(manifest);
  useWorkingCopyStore.getState().reset();
  mockReprop.mockClear();
  mockBuild.mockReset();
  mockResolve.mockReset();
});

describe("applyPhysicalCompletionEffects (R1 re-homed)", () => {
  it("locks the desktop on the real store", () => {
    expect(useWorkingCopyStore.getState().desktopLocked).toBe(false);
    applyPhysicalCompletionEffects();
    expect(useWorkingCopyStore.getState().desktopLocked).toBe(true);
  });

  it("calls repropagate once with the store's staleness closure and no setTouchLayoutJson member (T024)", () => {
    const closure = new Set(["touch"]);
    useWorkingCopyStore.setState({ staleSteps: closure });

    applyPhysicalCompletionEffects();

    expect(mockReprop).toHaveBeenCalledTimes(1);
    const passedDeps = mockReprop.mock.calls[0]![0] as Record<string, unknown>;
    expect("setTouchLayoutJson" in passedDeps).toBe(false);
    expect(Object.keys(passedDeps).sort()).toEqual([
      "getWorkingIR",
      "setWorkingIR",
      "staleSteps",
    ]);
    expect(passedDeps.staleSteps).toBe(closure);
  });

  it("the injected IR accessors read and write the real store", () => {
    applyPhysicalCompletionEffects();
    const passedDeps = mockReprop.mock.calls[0]![0] as {
      getWorkingIR: () => unknown;
      setWorkingIR: (ir: unknown) => void;
    };
    expect(passedDeps.getWorkingIR()).toBe(useWorkingCopyStore.getState().ir);
    const next = makeTestIR([]);
    passedDeps.setWorkingIR(next);
    expect(useWorkingCopyStore.getState().ir).toBe(next);
  });
});

describe("applyTouchCompletionEffects (R2 re-homed)", () => {
  const baseIr = makeTestIR([]);
  const assignments = [{ key: "a" }] as unknown as TouchAssignment[];
  const EMPTY_MODS = { removals: [], placements: [] };

  function seedStaleTouch() {
    useWorkingCopyStore.getState().markStale("touch");
    expect(useWorkingCopyStore.getState().staleSteps.has("touch")).toBe(true);
  }

  it("baseIr null: clears the stored layout, builds nothing, clears the stale flag", () => {
    seedStaleTouch();
    useWorkingCopyStore.getState().setTouchLayoutJson("{\"prev\":true}");
    applyTouchCompletionEffects({ assignments, baseIr: null, baseVfs: null, mods: EMPTY_MODS, seedSource: "import-adapt" });
    expect(mockBuild).not.toHaveBeenCalled();
    expect(useWorkingCopyStore.getState().touchLayoutJson).toBeNull();
    expect(useWorkingCopyStore.getState().staleSteps.has("touch")).toBe(false);
  });

  it("Case A (no shipped layout): builds without baseTouchJson and stores the json", () => {
    mockResolve.mockReturnValue(undefined);
    mockBuild.mockReturnValue({ json: "{\"built\":true}", warnings: [] });
    applyTouchCompletionEffects({ assignments, baseIr, baseVfs: null, mods: EMPTY_MODS, seedSource: "import-adapt" });
    expect(mockBuild).toHaveBeenCalledTimes(1);
    const opts = mockBuild.mock.calls[0]![2] as Record<string, unknown>;
    expect("baseTouchJson" in opts).toBe(false);
    expect(opts.seedSource).toBe("import-adapt");
    expect(useWorkingCopyStore.getState().touchLayoutJson).toBe("{\"built\":true}");
  });

  it("Case B (shipped layout, import-adapt): passes baseTouchJson through", () => {
    mockResolve.mockReturnValue("{\"shipped\":true}");
    mockBuild.mockReturnValue({ json: "{\"adapted\":true}", warnings: [] });
    applyTouchCompletionEffects({ assignments, baseIr, baseVfs: null, mods: EMPTY_MODS, seedSource: "import-adapt" });
    const opts = mockBuild.mock.calls[0]![2] as Record<string, unknown>;
    expect(opts.baseTouchJson).toBe("{\"shipped\":true}");
    expect(useWorkingCopyStore.getState().touchLayoutJson).toBe("{\"adapted\":true}");
  });

  it("reseed (R10): never passes the shipped layout through, even when present", () => {
    mockResolve.mockReturnValue("{\"shipped\":true}");
    mockBuild.mockReturnValue({ json: "{\"reseeded\":true}", warnings: [] });
    applyTouchCompletionEffects({ assignments, baseIr, baseVfs: null, mods: EMPTY_MODS, seedSource: "reseed-from-desktop" });
    const opts = mockBuild.mock.calls[0]![2] as Record<string, unknown>;
    expect("baseTouchJson" in opts).toBe(false);
    expect(opts.seedSource).toBe("reseed-from-desktop");
  });

  it("R11 don't-emit (no edits, no mods, import-adapt): builds nothing, stores null", () => {
    mockResolve.mockReturnValue("{\"shipped\":true}");
    applyTouchCompletionEffects({ assignments: [], baseIr, baseVfs: null, mods: EMPTY_MODS, seedSource: "import-adapt" });
    expect(mockBuild).not.toHaveBeenCalled();
    expect(useWorkingCopyStore.getState().touchLayoutJson).toBeNull();
  });

  it("build throws: degrades to no layout, does not throw, clears the stale flag", () => {
    seedStaleTouch();
    mockResolve.mockReturnValue(undefined);
    mockBuild.mockImplementation(() => {
      throw new Error("emit blew up");
    });
    expect(() =>
      applyTouchCompletionEffects({ assignments, baseIr, baseVfs: null, mods: EMPTY_MODS, seedSource: "import-adapt" }),
    ).not.toThrow();
    expect(useWorkingCopyStore.getState().touchLayoutJson).toBeNull();
    expect(useWorkingCopyStore.getState().staleSteps.has("touch")).toBe(false);
  });

  it("absent result: defaults apply — no build, layout cleared, no throw", () => {
    expect(() => applyTouchCompletionEffects(undefined)).not.toThrow();
    expect(mockBuild).not.toHaveBeenCalled();
    expect(useWorkingCopyStore.getState().touchLayoutJson).toBeNull();
  });
});
