// Tests for useTouchLint — async-exception surface fix (swallowed-catch bugfix).
//
// Coverage:
//   1. engine.lint REJECTS → touchFindings is [LINT_ERROR_FINDING], touchLintRunning=false.
//   2. Cancelled guard: unmount before rejection settles → LINT_ERROR_FINDING NOT injected.
//   3. engine.lint resolves [] → no LINT_ERROR_FINDING.
//
// Debounce: useDebounce is mocked as an identity transform to bypass the 300 ms delay.
// Stable VFS: renderHook wraps the hook call in a closure that uses a pre-created VFS
// so the identity mock doesn't trigger re-fires from a new object each render.
// The cancelled-guard test uses a deferred promise (resolve/reject held outside).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { VirtualFS } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Mock useDebounce — identity transform (removes the 300 ms delay)
// ---------------------------------------------------------------------------

vi.mock("./useDebounce.ts", () => ({
  DEBOUNCE_MS: 300,
  useDebounce: <T>(value: T) => value,
}));

// ---------------------------------------------------------------------------
// Deferred helper — lets tests control when the lint promise settles
// ---------------------------------------------------------------------------

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ---------------------------------------------------------------------------
// Mock @keymanapp/keyboard-lint
// ---------------------------------------------------------------------------

const lintSpy = vi.fn<() => Promise<unknown>>();

vi.mock("@keymanapp/keyboard-lint", () => ({
  KeyboardLintEngine: class {
    lint(..._args: unknown[]) {
      return lintSpy();
    }
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { LINT_ERROR_FINDING } from "../lint/validationErrorFindings.ts";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Shared fixture — stable VFS reference (avoids re-fires from new object each render)
// ---------------------------------------------------------------------------

function makeStableFs(): VirtualFS {
  return createVirtualFS([
    { path: "source/test.kmn", content: "c test\n", isBinary: false },
  ]);
}

// ---------------------------------------------------------------------------
// 1. lint REJECTS → LINT_ERROR_FINDING injected, touchLintRunning=false
// ---------------------------------------------------------------------------

describe("useTouchLint — error surface (AC#3.1)", () => {
  it("injects LINT_ERROR_FINDING when engine.lint rejects", async () => {
    lintSpy.mockRejectedValue(new Error("lint engine crashed"));

    const { useTouchLint } = await import("./useTouchLint.ts");
    const fs = makeStableFs();
    const { result } = renderHook(() => useTouchLint(fs, "test"));

    await waitFor(() => {
      // Wait for both states to settle (React batches them together in the catch handler)
      expect(result.current.touchFindings).toHaveLength(1);
      expect(result.current.touchLintRunning).toBe(false);
    });

    const injected = result.current.touchFindings[0]!;
    expect(injected.code).toBe("KM_WARN_LINT_ERROR");
    expect(injected.severity).toBe("warning");
    expect(injected.layer).toBe("C");
    expect(result.current.touchFindings).toEqual([LINT_ERROR_FINDING]);
    expect(result.current.touchLintRunning).toBe(false);
  });

  it("does NOT inject LINT_ERROR_FINDING when engine.lint resolves []", async () => {
    lintSpy.mockResolvedValue([]);

    const { useTouchLint } = await import("./useTouchLint.ts");
    const fs = makeStableFs();
    const { result } = renderHook(() => useTouchLint(fs, "test"));

    await waitFor(() => {
      expect(result.current.touchLintRunning).toBe(false);
    });

    expect(result.current.touchFindings.find((f) => f.code === "KM_WARN_LINT_ERROR")).toBeUndefined();
  });

  it("returns [] findings and touchLintRunning=false when fs is null", async () => {
    const { useTouchLint } = await import("./useTouchLint.ts");
    const { result } = renderHook(() => useTouchLint(null, "test"));

    // With null fs, the effect sets touchFindings=[] and touchLintRunning=false immediately
    // (synchronously in the effect body before the early return). No lint call expected.
    await waitFor(() => {
      expect(result.current.touchLintRunning).toBe(false);
    });

    expect(result.current.touchFindings).toEqual([]);
    expect(lintSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. Cancelled guard: unmount before rejection settles → LINT_ERROR_FINDING NOT set
// ---------------------------------------------------------------------------

describe("useTouchLint — cancelled guard", () => {
  it("does NOT inject LINT_ERROR_FINDING when the hook unmounts before rejection settles", async () => {
    const d = deferred<unknown>();
    lintSpy.mockReturnValue(d.promise);

    const { useTouchLint } = await import("./useTouchLint.ts");
    const fs = makeStableFs();
    const { result, unmount } = renderHook(() => useTouchLint(fs, "test"));

    // Confirm lint started running.
    await waitFor(() => {
      expect(result.current.touchLintRunning).toBe(true);
    });

    // Unmount — this triggers the cleanup function which sets cancelled=true.
    unmount();

    // Now reject the deferred promise.
    await act(async () => {
      d.reject(new Error("lint crashed after unmount"));
      // Let promise microtasks flush.
      await Promise.resolve();
      await Promise.resolve();
    });

    // After unmount the cancelled guard (if (!cancelled)) must have suppressed the catch.
    // The result is frozen at unmount-time; touchFindings must still be [] (the initial state).
    expect(result.current.touchFindings).toEqual([]);
    expect(result.current.touchFindings.find((f) => f.code === "KM_WARN_LINT_ERROR")).toBeUndefined();
  });
});
