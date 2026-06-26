// Tests for useValidator — sync-exception surface fix (swallowed-catch bugfix).
//
// Coverage:
//   1. runAllChecks THROWS → findings is exactly [VALIDATOR_ERROR_FINDING], not [].
//   2. runAllChecks returns [] → findings has no KM_WARN_VALIDATOR_ERROR code.
//   3. runAllChecks returns a real finding → it passes through unchanged.
//
// Debounce: useDebounce is mocked to be a pass-through so tests don't need fake
// timers. The hook's synchronous try/catch is exercised directly.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mock useDebounce — identity transform (removes the 300 ms delay)
// ---------------------------------------------------------------------------

vi.mock("./useDebounce.ts", () => ({
  DEBOUNCE_MS: 300,
  useDebounce: <T>(value: T) => value,
}));

// ---------------------------------------------------------------------------
// Mock @keyboard-studio/engine — spy on runAllChecks
// ---------------------------------------------------------------------------

const runAllChecksSpy = vi.fn();

vi.mock("@keyboard-studio/engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("@keyboard-studio/engine")>();
  return { ...original, runAllChecks: runAllChecksSpy };
});

// ---------------------------------------------------------------------------
// Import after mocks are registered
// ---------------------------------------------------------------------------

import { VALIDATOR_ERROR_FINDING } from "../lint/validationErrorFindings.ts";
import type { LintFinding } from "@keyboard-studio/contracts";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. runAllChecks THROWS → VALIDATOR_ERROR_FINDING injected, not []
// ---------------------------------------------------------------------------

describe("useValidator — error surface (AC#3.1)", () => {
  it("injects VALIDATOR_ERROR_FINDING when runAllChecks throws", async () => {
    runAllChecksSpy.mockImplementation(() => {
      throw new Error("validator crashed");
    });

    const { useValidator } = await import("./useValidator.ts");
    const { result } = renderHook(() => useValidator("c test\n"));

    await waitFor(() => {
      expect(result.current.findings).toHaveLength(1);
    });

    const injected = result.current.findings[0]!;
    expect(injected.code).toBe("KM_WARN_VALIDATOR_ERROR");
    expect(injected.severity).toBe("warning");
    expect(injected.layer).toBe("A");
    // Must be the exact constant, not just any finding with the right code.
    expect(result.current.findings).toEqual([VALIDATOR_ERROR_FINDING]);
    // running must be false after the catch
    expect(result.current.running).toBe(false);
  });

  it("does NOT inject VALIDATOR_ERROR_FINDING when runAllChecks returns []", async () => {
    runAllChecksSpy.mockReturnValue([]);

    const { useValidator } = await import("./useValidator.ts");
    const { result } = renderHook(() => useValidator("c test\n"));

    await waitFor(() => {
      // After the effect runs with runAllChecks returning [], findings should be []
      // i.e. no KM_WARN_VALIDATOR_ERROR code present.
      expect(result.current.findings.find((f) => f.code === "KM_WARN_VALIDATOR_ERROR")).toBeUndefined();
    });

    expect(result.current.running).toBe(false);
  });

  it("passes a real finding through unchanged when runAllChecks succeeds", async () => {
    const realFinding: LintFinding = {
      code: "KM_LINT_INVENTORY_UNCOVERED",
      severity: "error",
      layer: "A",
      message: "character not covered",
    };
    runAllChecksSpy.mockReturnValue([realFinding]);

    const { useValidator } = await import("./useValidator.ts");
    const { result } = renderHook(() => useValidator("c test\n"));

    await waitFor(() => {
      expect(result.current.findings).toHaveLength(1);
    });

    expect(result.current.findings[0]).toEqual(realFinding);
    expect(result.current.running).toBe(false);
  });

  it("returns [] findings and running=false when kmnSource is null", async () => {
    const { useValidator } = await import("./useValidator.ts");
    const { result } = renderHook(() => useValidator(null));

    await waitFor(() => {
      expect(result.current.findings).toEqual([]);
      expect(result.current.running).toBe(false);
    });

    expect(runAllChecksSpy).not.toHaveBeenCalled();
  });
});
