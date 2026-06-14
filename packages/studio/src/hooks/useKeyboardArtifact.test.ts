// useKeyboardArtifact — focused timing test.
//
// Coverage goals:
//   1. onInstantiate fires exactly once on a full fetch→compile run.
//   2. onInstantiate is NOT fired when recompile() is called (isFullRun=false).
//   3. onInstantiate is NOT called when baseKeyboard is null (idle path).
//   4. onInstantiate receives the base keyboard and a non-null IR on a full run.
//
// Approach: mock @keyboard-studio/engine with a minimal synchronous-ish
// implementation so loadEngine() succeeds in jsdom, then use renderHook()
// with act() to drive async state transitions. The engine mock's
// fetchKeyboardSourceToVfs() populates the VFS with a .kmn file so that
// findKmnPath finds it and parseKmn can return a non-null IR.
//
// The "isFullRun gating" invariant — recompile() does not fire onInstantiate —
// lives inside runCompile(). run() calls it with isFullRun=true; recompile()
// calls it with isFullRun=false (the default). We verify this by calling
// recompile() after an initial full run and asserting the spy count stays at 1.

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { BaseKeyboard, VirtualFS, KeyboardIR } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { mixedDiagnosticsResult } from "@keyboard-studio/contracts/fixtures";
import type { OnInstantiateCallback } from "./useKeyboardArtifact";

// ---------------------------------------------------------------------------
// Engine mock — exposes the minimal surface loadEngine() checks for.
// compile() returns a result that has a .js artifact (so the hook reaches
// the "ready" stage and fires onInstantiate).
// fetchKeyboardSourceToVfs() seeds the VFS with a .kmn stub so that
// findKmnPath returns a non-null path, enabling parseKmn to run.
// ---------------------------------------------------------------------------

const mockIr = makeTestIR([]);

const mockEngine = {
  init: vi.fn(() => Promise.resolve()),
  isReady: vi.fn(() => true),
  compile: vi.fn((_vfs: VirtualFS, _keyboardId: string) =>
    Promise.resolve(mixedDiagnosticsResult),
  ),
  fetchKeyboardSourceToVfs: vi.fn(
    (_baseKeyboard: BaseKeyboard, vfs: VirtualFS) => {
      // Seed a .kmn file so findKmnPath and parseKmn work in the hook.
      vfs.set("source/test_kb.kmn", "c test\n", false);
      return Promise.resolve({});
    },
  ),
  // parseKmn and recognizePatterns allow the hook to produce a non-null IR.
  parseKmn: vi.fn((_text: string, _id: string) => ({
    ir: mockIr,
    opaqueFeatures: [] as Array<{ feature: string; count: number }>,
  })),
  recognizePatterns: vi.fn((_ir: KeyboardIR) => ({
    ir: mockIr,
    recognizedRatio: 0,
  })),
};

// Mock @keyboard-studio/engine so loadEngine() finds compile+fetchKeyboardSourceToVfs+init.
vi.mock("@keyboard-studio/engine", () => mockEngine);

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const baseKb: BaseKeyboard = {
  id: "test_kb",
  path: "release/t/test_kb",
  script: "Latn",
  targets: ["windows"],
  displayName: "Test Keyboard",
  version: "1.0",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.clearAllMocks();
});

describe("useKeyboardArtifact — onInstantiate timing", () => {
  it("onInstantiate fires exactly once on a full fetch→compile run", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");

    const onInstantiate = vi.fn<Parameters<OnInstantiateCallback>, void>();

    const { result } = renderHook(() =>
      useKeyboardArtifact(baseKb, null, null, onInstantiate),
    );

    // Drive all microtasks to completion (loadEngine + fetch + compile).
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(onInstantiate).toHaveBeenCalledTimes(1);
    expect(result.current.stage.kind).toBe("ready");
  });

  it("onInstantiate is NOT fired when recompile() is called after a full run", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");

    const onInstantiate = vi.fn<Parameters<OnInstantiateCallback>, void>();

    const { result } = renderHook(() =>
      useKeyboardArtifact(baseKb, null, null, onInstantiate),
    );

    // Wait for the full run to complete.
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(onInstantiate).toHaveBeenCalledTimes(1);

    // recompile() — must NOT fire onInstantiate (isFullRun=false inside runCompile).
    await act(async () => {
      result.current.recompile();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    // Spy count must stay at 1, not increment to 2.
    expect(onInstantiate).toHaveBeenCalledTimes(1);
  });

  it("onInstantiate receives the base keyboard and a non-null IR on a full run", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");

    const onInstantiate = vi.fn<Parameters<OnInstantiateCallback>, void>();

    renderHook(() =>
      useKeyboardArtifact(baseKb, null, null, onInstantiate),
    );

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(onInstantiate).toHaveBeenCalledTimes(1);
    const [calledBase, calledOpts] = onInstantiate.mock.calls[0]!;
    expect(calledBase).toBe(baseKb);
    // parseKmn + recognizePatterns mocked above → IR must be non-null.
    expect(calledOpts.ir).not.toBeNull();
    expect(calledOpts.vfs).not.toBeNull();
  });

  it("onInstantiate is NOT called when baseKeyboard is null (idle path)", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");

    const onInstantiate = vi.fn<Parameters<OnInstantiateCallback>, void>();

    renderHook(() =>
      useKeyboardArtifact(null, null, null, onInstantiate),
    );

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(onInstantiate).not.toHaveBeenCalled();
  });
});
