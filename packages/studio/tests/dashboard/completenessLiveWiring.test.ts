// completenessLiveWiring.test.ts — spec-014 US5 T034 live-wiring test.
//
// Proves the store-bridge that carries the SINGLE debounced `useValidator`
// findings from `SurveyView` → `useWorkingCopyStore.validatorFindings` →
// `StudioShell`'s single `runCompleteness` call. The function-level graduation
// (a blocking Layer-A finding strands lock-reaching spine prefixes) is covered
// in src/dashboard/completeness.test.ts; THIS test covers the LIVE path:
//
//   1. `setValidatorFindings` publishes the (already-debounced) findings into
//      the store slice (with a reference-equality guard — no spurious updates).
//   2. Reading that slice and passing it into `runCompleteness` strands the
//      lock-reaching prefixes when the findings carry a BLOCKING finding —
//      i.e. a blocking validator finding now strands the lock-reaching spine
//      prefixes LIVE (not just at the function boundary).
//
// The single 300 ms debounce remains in hooks/useValidator.ts; the store bridge
// adds NO timer / async loop (the Article-IV / V3 invariant is enforced
// structurally by tests/dashboard/articleIVProbe.test.ts).
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/spec.md (US5 AC-3, SC-009)
//   specs/014-mutate-seam-touch-propagation/contracts/flag-and-validator.contract.md (V1/V3)

import { describe, it, expect, beforeEach } from "vitest";
import { useWorkingCopyStore } from "../../src/stores/workingCopyStore.ts";
import { runCompleteness } from "../../src/dashboard/completeness.ts";
import type { Step, EditorStep } from "../../src/steps/types.ts";
import type { LintFinding, LintSeverity } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A Layer-A LintFinding of the given severity (blocking when error/fatal). */
function finding(severity: LintSeverity, origin?: "authored" | "upstream"): LintFinding {
  return {
    code: "KM_ERROR_DUPLICATE_STORE",
    severity,
    layer: "A",
    message: `test ${severity} finding`,
    ...(origin !== undefined ? { origin } : {}),
  };
}

/** Minimal spine EditorStep (no writes/inputs → no data edges). */
function makeSpineStep(id: string): EditorStep {
  return {
    kind: "editor-step",
    id,
    title: id,
    spine: true,
    component: (() => null) as EditorStep["component"],
    inputs: [],
    writes: [],
  };
}

// Manifest: s0 (no lock) → s1 (lock:physical) → s2 (lock:touch). Both locks
// applied so the STRUCTURAL proxy is clean — only the live validator findings
// can strand a prefix here.
const MANIFEST: Step[] = [
  makeSpineStep("s0"),
  { ...makeSpineStep("s1"), lock: "physical" } satisfies Step,
  { ...makeSpineStep("s2"), lock: "touch" } satisfies Step,
];

// Working copy with both lock gates fully applied (structural proxy clean).
const WC_BOTH_LOCKED = { desktopLocked: true, touchLayoutJson: "{}" };

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

describe("T034 live-wiring — SurveyView → store → runCompleteness", () => {
  it("defaults to empty findings (structural proxy / flag-off byte-identical)", () => {
    // No findings published yet → store slice defaults to [].
    expect(useWorkingCopyStore.getState().validatorFindings).toEqual([]);

    const report = runCompleteness(
      MANIFEST,
      WC_BOTH_LOCKED,
      new Set(),
      useWorkingCopyStore.getState().validatorFindings,
    );
    // Both locks applied + no findings ⇒ no prefix stranded (pure proxy).
    expect(report.unshippablePrefixes).toEqual([]);
  });

  it("a BLOCKING finding published to the store live-strands lock-reaching prefixes", () => {
    // Publish a blocking finding the way SurveyView's effect does.
    useWorkingCopyStore.getState().setValidatorFindings([finding("error")]);

    // StudioShell reads the slice and feeds it into the single runCompleteness call.
    const report = runCompleteness(
      MANIFEST,
      WC_BOTH_LOCKED,
      new Set(),
      useWorkingCopyStore.getState().validatorFindings,
    );

    // s1 (index 1, lock:physical) and s2 (index 2, lock:touch) both reached a
    // lock and carry the blocking finding → stranded. s0 (pre-lock) is clean.
    expect(report.unshippablePrefixes).toEqual([1, 2]);
  });

  it("a non-blocking (warning) finding does NOT strand prefixes", () => {
    useWorkingCopyStore.getState().setValidatorFindings([finding("warning")]);
    const report = runCompleteness(
      MANIFEST,
      WC_BOTH_LOCKED,
      new Set(),
      useWorkingCopyStore.getState().validatorFindings,
    );
    expect(report.unshippablePrefixes).toEqual([]);
  });

  it("an upstream-origin blocking finding is muted (does NOT strand)", () => {
    useWorkingCopyStore.getState().setValidatorFindings([finding("error", "upstream")]);
    const report = runCompleteness(
      MANIFEST,
      WC_BOTH_LOCKED,
      new Set(),
      useWorkingCopyStore.getState().validatorFindings,
    );
    expect(report.unshippablePrefixes).toEqual([]);
  });

  it("setValidatorFindings is reference-equality guarded (no spurious state change)", () => {
    const f = [finding("error")];
    const store = useWorkingCopyStore;
    store.getState().setValidatorFindings(f);
    const after1 = store.getState();
    // Re-publishing the SAME array reference must not replace state — guards
    // against an effect re-firing with an unchanged findings reference looping.
    store.getState().setValidatorFindings(f);
    const after2 = store.getState();
    expect(after2).toBe(after1);
    expect(after2.validatorFindings).toBe(f);
  });

  it("reset() clears published findings back to the structural-proxy default", () => {
    useWorkingCopyStore.getState().setValidatorFindings([finding("error")]);
    expect(useWorkingCopyStore.getState().validatorFindings).toHaveLength(1);
    useWorkingCopyStore.getState().reset();
    expect(useWorkingCopyStore.getState().validatorFindings).toEqual([]);
  });
});
