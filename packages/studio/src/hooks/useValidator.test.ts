// useValidator — regression coverage for #494.
//
// The hook must call validateWithOracle (NOT the synchronous runAllChecks) so
// that KM_WARN_ORACLE_UNAVAILABLE — emitted by the engine when the WASM oracle
// is down — actually reaches the SPA. Before #494 the hook called runAllChecks,
// so WASM-down degradation was silent at the UI.
//
// The engine is mocked so we can drive validateWithOracle's resolution
// deterministically. Real timers + waitFor cover the 300 ms useDebounce cycle.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { LintFinding } from "@keyboard-studio/contracts";

const { validateWithOracleMock } = vi.hoisted(() => ({
  validateWithOracleMock: vi.fn<(source: string) => Promise<LintFinding[]>>(),
}));

vi.mock("@keyboard-studio/engine", () => ({
  validateWithOracle: validateWithOracleMock,
}));

import { useValidator } from "./useValidator.ts";

const ORACLE_DOWN: LintFinding = {
  code: "KM_WARN_ORACLE_UNAVAILABLE",
  severity: "warning",
  layer: "A",
  message: "WASM oracle unavailable — only TS-portable checks ran.",
};

// Slightly longer than DEBOUNCE_MS (300) so a leaked validation would have run.
const DEBOUNCE_GRACE_MS = 400;

describe("useValidator (#494)", () => {
  beforeEach(() => {
    validateWithOracleMock.mockReset();
  });

  it("surfaces KM_WARN_ORACLE_UNAVAILABLE from validateWithOracle", async () => {
    validateWithOracleMock.mockResolvedValue([ORACLE_DOWN]);

    const { result } = renderHook(() => useValidator("c kb\n"));

    await waitFor(() => {
      expect(result.current.findings.map((f) => f.code)).toContain(
        "KM_WARN_ORACLE_UNAVAILABLE",
      );
    });
    // It is validateWithOracle that is called, with the (debounced) source —
    // NOT the synchronous runAllChecks path that swallowed the warning.
    expect(validateWithOracleMock).toHaveBeenCalledWith("c kb\n");
  });

  it("returns no findings and does not call the oracle for a null source", async () => {
    const { result } = renderHook(() => useValidator(null));
    // Give the debounce + any stray microtask a chance to run.
    await new Promise((r) => setTimeout(r, DEBOUNCE_GRACE_MS));
    expect(result.current.findings).toEqual([]);
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
});
