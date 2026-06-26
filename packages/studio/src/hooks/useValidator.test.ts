// useValidator — merged regression coverage for #494 and #606.
//
// #494: The hook must call validateWithOracle (NOT the synchronous runAllChecks)
// so that KM_WARN_ORACLE_UNAVAILABLE — emitted by the engine when the WASM oracle
// is down — actually reaches the SPA. Before #494 the hook called runAllChecks,
// so WASM-down degradation was silent at the UI.
//
// #606: An unexpected rejection from validateWithOracle must surface as
// [VALIDATOR_ERROR_FINDING] rather than silently clearing to [].
//
// useDebounce is mocked to an identity pass-through so tests do not need
// fake timers. The engine is mocked to expose only validateWithOracle.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { LintFinding } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Mock useDebounce — identity transform (removes the 300 ms delay)
// ---------------------------------------------------------------------------

vi.mock("./useDebounce.ts", () => ({
  DEBOUNCE_MS: 300,
  useDebounce: <T,>(v: T) => v,
}));

// ---------------------------------------------------------------------------
// Mock @keyboard-studio/engine — expose only validateWithOracle
// ---------------------------------------------------------------------------

const { validateWithOracleMock } = vi.hoisted(() => ({
  validateWithOracleMock: vi.fn<(source: string) => Promise<LintFinding[]>>(),
}));

vi.mock("@keyboard-studio/engine", () => ({
  validateWithOracle: validateWithOracleMock,
}));

// ---------------------------------------------------------------------------
// Import after mocks are registered
// ---------------------------------------------------------------------------

import { useValidator } from "./useValidator.ts";
import { VALIDATOR_ERROR_FINDING } from "../lint/validationErrorFindings.ts";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const ORACLE_DOWN: LintFinding = {
  code: "KM_WARN_ORACLE_UNAVAILABLE",
  severity: "warning",
  layer: "A",
  message: "WASM oracle unavailable — only TS-portable checks ran.",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useValidator (merged #494 + #606)", () => {
  beforeEach(() => {
    validateWithOracleMock.mockReset();
  });

  it("surfaces KM_WARN_ORACLE_UNAVAILABLE when validateWithOracle resolves it", async () => {
    validateWithOracleMock.mockResolvedValue([ORACLE_DOWN]);

    const { result } = renderHook(() => useValidator("c kb\n"));

    await waitFor(() => {
      expect(result.current.findings.map((f) => f.code)).toContain(
        "KM_WARN_ORACLE_UNAVAILABLE",
      );
    });
    // Confirms the hook routes through validateWithOracle, not runAllChecks.
    expect(validateWithOracleMock).toHaveBeenCalledWith("c kb\n");
  });

  it("returns no findings and does not call the oracle for a null source", async () => {
    const { result } = renderHook(() => useValidator(null));

    await waitFor(() => {
      expect(result.current.findings).toEqual([]);
    });
    expect(validateWithOracleMock).not.toHaveBeenCalled();
  });

  it("clears stale findings when the source becomes null", async () => {
    validateWithOracleMock.mockResolvedValue([ORACLE_DOWN]);
    const { result, rerender } = renderHook(
      ({ src }: { src: string | null }) => useValidator(src),
      { initialProps: { src: "c kb\n" as string | null } },
    );

    await waitFor(() => {
      expect(result.current.findings).toHaveLength(1);
    });

    rerender({ src: null });
    await waitFor(() => {
      expect(result.current.findings).toEqual([]);
    });
  });

  it("injects VALIDATOR_ERROR_FINDING when validateWithOracle rejects (#606)", async () => {
    validateWithOracleMock.mockRejectedValue(new Error("validator crashed"));

    const { result } = renderHook(() => useValidator("c test\n"));

    await waitFor(() => {
      expect(result.current.findings).toEqual([VALIDATOR_ERROR_FINDING]);
    });
    expect(result.current.running).toBe(false);
  });

  it("does NOT inject VALIDATOR_ERROR_FINDING when validateWithOracle resolves [] (#606)", async () => {
    validateWithOracleMock.mockResolvedValue([]);

    const { result } = renderHook(() => useValidator("c test\n"));

    await waitFor(() => {
      expect(result.current.findings.find((f) => f.code === "KM_WARN_VALIDATOR_ERROR")).toBeUndefined();
    });
    expect(result.current.running).toBe(false);
  });

  it("passes a real finding through unchanged when validateWithOracle resolves it (#606)", async () => {
    const realFinding: LintFinding = {
      code: "KM_LINT_INVENTORY_UNCOVERED",
      severity: "error",
      layer: "A",
      message: "character not covered",
    };
    validateWithOracleMock.mockResolvedValue([realFinding]);

    const { result } = renderHook(() => useValidator("c test\n"));

    await waitFor(() => {
      expect(result.current.findings).toHaveLength(1);
    });
    expect(result.current.findings[0]).toEqual(realFinding);
    expect(result.current.running).toBe(false);
  });

  // P1: in-flight running guard — a regression that omits setRunning(true) would
  // not be caught by any of the six cases above (they only assert the settled
  // state). This case uses a manually-controlled deferred promise so the
  // in-flight state is observable before the promise resolves.
  it("sets running:true while validation is in flight, then false after it settles", async () => {
    let resolveValidation!: (f: LintFinding[]) => void;
    validateWithOracleMock.mockReturnValue(
      new Promise<LintFinding[]>((r) => {
        resolveValidation = r;
      }),
    );

    const { result } = renderHook(() => useValidator("c kb\n"));

    // The effect fires synchronously after render (identity debounce), so
    // setRunning(true) must have been called by now.
    await waitFor(() => expect(result.current.running).toBe(true));

    // Settle the promise — running must drop back to false.
    resolveValidation([]);
    await waitFor(() => expect(result.current.running).toBe(false));
  });

  // P2: superseded-cycle stale guard — the `cancelled` flag in `.then` and
  // `.finally` must prevent a resolved-but-superseded cycle from overwriting
  // the live cycle's state. The identity-debounce mock makes the rerender
  // sequencing deterministic: the effect cleanup (cancelled=true for pA) runs
  // synchronously before the new effect (setRunning(true) for pB) fires.
  it("a superseded cycle's stale resolution neither overwrites findings nor clears running", async () => {
    const findingA: LintFinding = {
      code: "KM_WARN_ORACLE_UNAVAILABLE",
      severity: "warning",
      layer: "A",
      message: "cycle A finding",
    };
    const findingB: LintFinding = {
      code: "KM_LINT_INVENTORY_UNCOVERED",
      severity: "error",
      layer: "A",
      message: "cycle B finding",
    };

    let resolveA!: (f: LintFinding[]) => void;
    let resolveB!: (f: LintFinding[]) => void;
    const promiseA = new Promise<LintFinding[]>((r) => { resolveA = r; });
    const promiseB = new Promise<LintFinding[]>((r) => { resolveB = r; });

    validateWithOracleMock.mockReturnValueOnce(promiseA);
    validateWithOracleMock.mockReturnValueOnce(promiseB);

    const { result, rerender } = renderHook(
      ({ src }: { src: string }) => useValidator(src),
      { initialProps: { src: "A" } },
    );

    // Cycle A is in flight.
    await waitFor(() => expect(result.current.running).toBe(true));

    // Start cycle B — cleanup cancels A, new effect fires for B.
    rerender({ src: "B" });

    // Resolve the stale cycle A AFTER B has started.
    resolveA([findingA]);

    // The stale resolution must not land: findings should not contain findingA,
    // and running must still be true (B is still in flight).
    await waitFor(() => expect(result.current.running).toBe(true));
    expect(result.current.findings).not.toContainEqual(findingA);

    // Now settle cycle B — findings become B's, running drops to false.
    resolveB([findingB]);
    await waitFor(() => expect(result.current.running).toBe(false));
    expect(result.current.findings).toEqual([findingB]);
  });
});
