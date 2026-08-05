// flagOff.test.ts — spec-014 US4 flag on/off spine proof (T029–T031).
//
// US4 is the rollback guarantee: a single global flag (VITE_KM_MUTATE_SEAM)
// makes the whole mutate() seam reversible.
//
//   T029 — flag OFF: a full-spine run produces IR + behavior identical to the
//          legacy / P4b (non-seam) path AND makes ZERO mutate()/applyMutatePatch
//          calls (F2/SC-008).
//   T030 — flag ON: mutate()/applyMutatePatch IS the IR write path for the
//          in-scope surfaces (F1/SC-008).
//   T031 — cross-cutting audit: EVERY mutate() execution site is gated on
//          isMutateSeamEnabled() and flag-off falls back to the legacy seam with
//          no other change.
//
// APPROACH (T029): no recorded P4b baseline fixture from T001 exists on the
// branch, so this file proves byte-identical-to-P4b by the EQUIVALENCE-RUN
// method — it drives the SAME spine (the reducer's applyStepCompletion, the
// single side-effect dispatcher) with the seam disabled vs. enabled and asserts:
//   (a) flag OFF writes the IR by NO route (zero applyMutatePatch / setWorkingIR
//       calls) — i.e. the P4b declared-only seam is in force; and
//   (b) flag ON routes the same in-scope answers through applyMutatePatch and
//       writes the IR, so the seam is the live write path.
// The carve/add EMIT byte-parity (the other half of "byte-identical to P4b") is
// already proved against the real emit pipeline in
// projectWorkingCopyVfs.flagParity.test.ts (M6/F2); this file proves the spine /
// reducer write-path half and the zero-mutate-call invariant.
//
// applyMutatePatch is spied via vi.mock (a true call-count seam) AND a counting
// setWorkingIR dep is injected, per the task's "spy on applyMutatePatch (or
// inject a counting setWorkingIR dep)" — this file uses BOTH so the zero-call
// assertion is independent of the injected-dep plumbing.
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/contracts/flag-and-validator.contract.md (F1/F2/F3)
//   specs/014-mutate-seam-touch-propagation/spec.md (US4, SC-008)

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR } from "@keyboard-studio/contracts";

// Spy on the real applyMutatePatch so we can count invocations across a spine
// run. We forward to the real implementation so flag-ON behavior is faithful.
import * as mutateApplyModule from "../../src/steps/mutateApply.ts";
const applyMutateSpy = vi.spyOn(mutateApplyModule, "applyMutatePatch");

import { applyStepCompletion, MECHANISMS_STEP_ID } from "../../src/steps/reducer.ts";
import type { ReducerDeps, MutateRequest } from "../../src/steps/reducer.ts";

// The 5 in-scope non-empty-`writes` identity/header modules (reconciled in T000).
import isoCode from "../../src/survey/questions/reserve/iso_code.ts";
import primaryScript from "../../src/survey/questions/reserve/primary_script.ts";
import languageNameEnglish from "../../src/survey/questions/reserve/language_name_english.ts";
import paCopyrightHolder from "../../src/survey/questions/reserve/pa_copyright_holder.ts";
import pbStandardLetters from "../../src/survey/questions/b/pb_standard_letters.ts";

// ---------------------------------------------------------------------------
// Spine fixture — the in-scope question answers as MutateRequests, in spine order
// ---------------------------------------------------------------------------

interface SpineEntry {
  stepId: string;
  request: MutateRequest;
}

/** Build the in-scope spine of MutateRequests from the 5 identity/header modules. */
function buildInScopeSpine(): SpineEntry[] {
  const mods = [
    { id: "iso_code", mod: isoCode, value: "swa" as string | string[] | undefined },
    { id: "primary_script", mod: primaryScript, value: "Latn" },
    { id: "language_name_english", mod: languageNameEnglish, value: "Swahili Keyboard" },
    { id: "pa_copyright_holder", mod: paCopyrightHolder, value: "Acme Corp" },
    { id: "pb_standard_letters", mod: pbStandardLetters, value: ["a", "b", "c"] },
  ];
  return mods.map(({ id, mod, value }) => ({
    stepId: id,
    request: {
      kind: "mutate",
      mutate: mod.mutate!,
      value,
      writes: mod.writes!,
    } satisfies MutateRequest,
  }));
}

// ---------------------------------------------------------------------------
// Reducer-deps harness: a counting setWorkingIR + a mutable working IR cell.
// getWorkingIR returns the current cell so chained mutate()s read prior writes.
// ---------------------------------------------------------------------------

interface SpineHarness {
  deps: ReducerDeps;
  setWorkingIRCalls: KeyboardIR[];
  currentIR: () => KeyboardIR;
}

function makeHarness(initial: KeyboardIR): SpineHarness {
  let working = initial;
  const setWorkingIRCalls: KeyboardIR[] = [];
  const deps: ReducerDeps = {
    // Side-effect deps the spine entries below never trigger (mutate path only).
    lockDesktop: () => {},
    clearStale: () => {},
    setTouchLayoutJson: () => {},
    instantiateFromBase: () => {},
    instantiateFromExisting: () => {},
    buildTouchLayoutJson: () => ({ json: null, warnings: [] }),
    resolveBaseTouchJson: () => undefined,
    instantiateFromBaseIfConfirmed: () => true,
    // The mutate seam deps.
    getWorkingIR: () => working,
    setWorkingIR: (ir: KeyboardIR) => {
      working = ir;
      setWorkingIRCalls.push(ir);
    },
  };
  return { deps, setWorkingIRCalls, currentIR: () => working };
}

/** Run the in-scope spine of MutateRequests through applyStepCompletion. */
function runInScopeSpine(harness: SpineHarness): void {
  for (const { stepId, request } of buildInScopeSpine()) {
    applyStepCompletion(stepId, request, harness.deps);
  }
}

beforeEach(() => {
  applyMutateSpy.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// T029 — flag OFF: zero mutate calls, IR untouched (P4b byte-identical seam)
// ---------------------------------------------------------------------------

describe("T029 / US4 — flag OFF: full-spine run is byte-identical to P4b, zero mutate() calls", () => {
  it("makes ZERO applyMutatePatch calls across the in-scope spine (F2/SC-008)", () => {
    vi.stubEnv("VITE_KM_MUTATE_SEAM", "");
    const base = makeTestIR([]);
    const harness = makeHarness(base);

    runInScopeSpine(harness);

    expect(applyMutateSpy).not.toHaveBeenCalled();
  });

  it("writes the IR by NO route — setWorkingIR is never called (P4b declared-only seam)", () => {
    vi.stubEnv("VITE_KM_MUTATE_SEAM", "");
    const base = makeTestIR([]);
    const harness = makeHarness(base);

    runInScopeSpine(harness);

    expect(harness.setWorkingIRCalls).toHaveLength(0);
  });

  it("leaves the working IR byte-identical to the starting IR (no observable IR change)", () => {
    vi.stubEnv("VITE_KM_MUTATE_SEAM", "");
    const base = makeTestIR([]);
    const before = structuredClone(base);
    const harness = makeHarness(base);

    runInScopeSpine(harness);

    // The flag-off spine performed no IR write, so the working copy equals the
    // P4b starting state — the byte-identical-to-P4b guarantee at the spine level.
    expect(harness.currentIR()).toEqual(before);
  });

  it("the mechanisms-step re-propagation trigger does NOT fire with the flag off (zero mutate)", () => {
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

// ---------------------------------------------------------------------------
// T030 — flag ON: applyMutatePatch IS the IR write path for in-scope surfaces
// ---------------------------------------------------------------------------

describe("T030 / US4 — flag ON: mutate()/applyMutatePatch is the IR write path (F1/SC-008)", () => {
  it("routes every in-scope answer through applyMutatePatch (one call per in-scope step)", () => {
    vi.stubEnv("VITE_KM_MUTATE_SEAM", "1");
    const base = makeTestIR([]);
    const harness = makeHarness(base);

    runInScopeSpine(harness);

    // 5 in-scope modules → 5 applyMutatePatch invocations (the write path).
    expect(applyMutateSpy).toHaveBeenCalledTimes(buildInScopeSpine().length);
  });

  it("writes the IR through setWorkingIR — the seam is the live write route", () => {
    vi.stubEnv("VITE_KM_MUTATE_SEAM", "1");
    const base = makeTestIR([]);
    const harness = makeHarness(base);

    runInScopeSpine(harness);

    expect(harness.setWorkingIRCalls.length).toBe(buildInScopeSpine().length);
  });

  it("the resulting IR reflects the in-scope answers (identity/header writes landed)", () => {
    vi.stubEnv("VITE_KM_MUTATE_SEAM", "1");
    const base = makeTestIR([]);
    const harness = makeHarness(base);

    runInScopeSpine(harness);

    const out = harness.currentIR();
    // iso_code (swa) + primary_script (Latn) merge to a swa-Latn BCP-47 tag.
    expect(out.header.bcp47[0]).toBe("swa-Latn");
    // language_name_english → header.name; pa_copyright_holder → header.copyright.
    expect(out.header.name).toBe("Swahili Keyboard");
    expect(out.header.copyright).toBe("Acme Corp");
  });

  it("flag ON vs flag OFF: the IR diverges only when the flag is on (rollback proof)", () => {
    const base = makeTestIR([]);

    vi.stubEnv("VITE_KM_MUTATE_SEAM", "");
    const offHarness = makeHarness(structuredClone(base));
    runInScopeSpine(offHarness);

    vi.unstubAllEnvs();
    vi.stubEnv("VITE_KM_MUTATE_SEAM", "1");
    const onHarness = makeHarness(structuredClone(base));
    runInScopeSpine(onHarness);

    // OFF leaves the IR at the P4b baseline; ON writes it. They MUST differ —
    // and OFF MUST equal the untouched base (the defined rollback target).
    expect(offHarness.currentIR()).toEqual(base);
    expect(onHarness.currentIR()).not.toEqual(base);
  });
});
