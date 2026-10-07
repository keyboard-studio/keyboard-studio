// assignLoopCompletion.test.ts — spec 090 T041.
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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { repropagate as mockRepropagate } from "../steps/repropagate.ts";
import { applyPhysicalCompletionEffects } from "./assignLoopCompletion.ts";

vi.mock("../steps/repropagate.ts", () => ({ repropagate: vi.fn() }));

const mockReprop = mockRepropagate as ReturnType<typeof vi.fn>;

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
  mockReprop.mockClear();
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
