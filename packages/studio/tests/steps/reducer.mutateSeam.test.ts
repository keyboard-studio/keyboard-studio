// T014 / T012 (US1) — applyStepCompletion routes in-scope question answers
// through mutate() when the flag is on, and is a no-op when off / for
// display-only (empty-writes) modules.
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/contracts/mutate-seam.contract.md (M3/M6)
//   specs/014-mutate-seam-touch-propagation/contracts/flag-and-validator.contract.md (F1/F2)

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { applyStepCompletion, type MutateRequest, type ReducerDeps } from "../../src/steps/reducer.ts";
import langNameMod from "../../src/survey/questions/a/language_name_english.ts";
import desktopFirstNotice from "../../src/survey/questions/a/desktop_first_notice.ts";

function makeDeps(initialIr: KeyboardIR | null): {
  deps: ReducerDeps;
  getIr: () => KeyboardIR | null;
} {
  let ir = initialIr;
  const deps: ReducerDeps = {
    lockDesktop: vi.fn(),
    setTouchLayoutJson: vi.fn(),
    instantiateFromBase: vi.fn(),
    instantiateFromExisting: vi.fn(),
    buildTouchLayoutJson: vi.fn().mockReturnValue({ json: null, warnings: [] }),
    resolveBaseTouchJson: vi.fn().mockReturnValue(undefined),
    instantiateFromBaseIfConfirmed: vi.fn().mockReturnValue(true),
    getWorkingIR: () => ir,
    setWorkingIR: vi.fn((next: KeyboardIR) => { ir = next; }),
  };
  return { deps, getIr: () => ir };
}

function mutateReq(value: string | string[] | undefined): MutateRequest {
  return {
    kind: "mutate",
    mutate: langNameMod.mutate!,
    value,
    writes: langNameMod.writes!,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("applyStepCompletion — mutate seam OFF (F2/SC-008)", () => {
  beforeEach(() => { vi.stubEnv("VITE_KM_MUTATE_SEAM", ""); });

  it("does not call setWorkingIR and leaves the IR unchanged when the flag is off", () => {
    const base = makeTestIR([]);
    const { deps, getIr } = makeDeps(base);
    applyStepCompletion("language_name_english", mutateReq("Bafut"), deps);
    expect(deps.setWorkingIR).not.toHaveBeenCalled();
    expect(getIr()!.header.name).toBe(base.header.name); // unchanged
  });
});

describe("applyStepCompletion — mutate seam ON (M6/F1)", () => {
  beforeEach(() => { vi.stubEnv("VITE_KM_MUTATE_SEAM", "1"); });

  it("applies the question's mutate() patch to the working IR", () => {
    const base = makeTestIR([]);
    const { deps, getIr } = makeDeps(base);
    applyStepCompletion("language_name_english", mutateReq("Bafut"), deps);
    expect(deps.setWorkingIR).toHaveBeenCalledTimes(1);
    expect(getIr()!.header.name).toBe("Bafut");
    // base untouched (purity)
    expect(base.header.name).toBe("Test");
  });

  it("is a no-op (no setWorkingIR) when no working copy exists yet", () => {
    const { deps } = makeDeps(null);
    applyStepCompletion("language_name_english", mutateReq("Bafut"), deps);
    expect(deps.setWorkingIR).not.toHaveBeenCalled();
  });

  it("an empty answer applies an empty patch (no observable IR change) — M5", () => {
    const base = makeTestIR([]);
    const { deps, getIr } = makeDeps(base);
    applyStepCompletion("language_name_english", mutateReq(""), deps);
    // setWorkingIR is still called with the structural copy, but value is unchanged.
    expect(getIr()!.header.name).toBe(base.header.name);
  });

  // T012 — display-only / answer-store-only module: empty writes ⇒ no IR change.
  it("a display-only module (empty writes, no mutate) performs no IR change (AC US1-3)", () => {
    const base = makeTestIR([]);
    const { deps, getIr } = makeDeps(base);
    // desktop_first_notice is a notice — writes: [], mutate absent.
    expect(desktopFirstNotice.writes).toEqual([]);
    expect(desktopFirstNotice.mutate).toBeUndefined();
    // Completing it as a normal (non-mutate) step is a reducer no-op (R5).
    applyStepCompletion("desktop_first_notice", undefined, deps);
    expect(deps.setWorkingIR).not.toHaveBeenCalled();
    expect(getIr()).toEqual(base);
  });
});
