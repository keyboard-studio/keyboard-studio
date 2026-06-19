// useKeyboardArtifact — focused timing test.
//
// Coverage goals:
//   1. onInstantiate fires exactly once on a full fetch→compile run.
//   2. onInstantiate is NOT fired when recompile() is called (isFullRun=false).
//   3. onInstantiate is NOT called when baseKeyboard is null (idle path).
//   4. onInstantiate receives the base keyboard and a non-null IR on a full run.
//   5. (slice 4) When parseKmn throws but compile succeeds, the hook reaches
//      the "ready" stage (preview not blanked), parsedIr passed to onInstantiate
//      is null, and a parse-gap warning appears in scaffoldWarnings.
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
  // Preview compile strips dangling packaging-asset stores; the mock is a no-op
  // passthrough (the test .kmn declares no asset stores).
  stripDanglingAssetStores: vi.fn((kmn: string, _fs: VirtualFS) => ({
    kmn,
    stripped: [] as string[],
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

  // Guardrail: a fetch that never settles must not strand the overlay on
  // "fetching" forever — it should fall through to a retryable error/fetch
  // stage once FETCH_TIMEOUT_MS (15s) elapses.
  it("a never-settling fetch surfaces a retryable fetch error, not an infinite spinner", async () => {
    vi.useFakeTimers();
    try {
      mockEngine.fetchKeyboardSourceToVfs.mockImplementationOnce(
        () => new Promise(() => undefined), // never resolves
      );

      const { useKeyboardArtifact } = await import("./useKeyboardArtifact");

      const { result } = renderHook(() =>
        useKeyboardArtifact(baseKb, null, null, null),
      );

      // Flush engine load + init and reach the withTimeout() call (which
      // registers the 15s fake timer). Stage should be parked on "fetching".
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.stage.kind).toBe("fetching");

      // Advance past the fetch timeout -> rejection -> error/fetch stage.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(16_000);
      });

      expect(result.current.stage.kind).toBe("error");
      if (result.current.stage.kind === "error") {
        expect(result.current.stage.step).toBe("fetch");
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Slice 4: graceful degradation when parseKmn throws (AC #4)
// ---------------------------------------------------------------------------
// When the codec can't model a real-world .kmn construct, parseKmn() throws.
// The compile() call is independent and must still succeed, leaving the hook
// in the "ready" stage (preview not blanked). The onInstantiate callback must
// receive ir=null (parse gap), and the parse-gap message must appear in
// scaffoldWarnings so the user sees "IR features unavailable: ..." without
// losing the preview or the download path.
// ---------------------------------------------------------------------------

describe("useKeyboardArtifact — parseKmn graceful degradation (slice 4)", () => {
  it("reaches ready stage when parseKmn throws, with ir=null and parse warning", async () => {
    // Override parseKmn on the shared mock for this one test.
    mockEngine.parseKmn.mockImplementationOnce(() => {
      throw new Error("codec gap: unsupported real-world construct");
    });

    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");

    const onInstantiate = vi.fn<Parameters<OnInstantiateCallback>, void>();

    const { result } = renderHook(() =>
      useKeyboardArtifact(baseKb, null, null, onInstantiate),
    );

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    // 1. Hook must reach "ready" — preview not blanked.
    expect(result.current.stage.kind).toBe("ready");

    // 2. onInstantiate must still fire (full run succeeded).
    expect(onInstantiate).toHaveBeenCalledTimes(1);

    // 3. IR must be null — parse gap degrades IR-dependent features gracefully.
    const [, calledOpts] = onInstantiate.mock.calls[0]!;
    expect(calledOpts.ir).toBeNull();

    // 4. Parse-gap message must appear in scaffoldWarnings (non-fatal signal).
    const readyStage = result.current.stage;
    expect(readyStage.kind).toBe("ready");
    if (readyStage.kind === "ready") {
      const parseWarn = readyStage.scaffoldWarnings.find((w) =>
        w.startsWith("IR features unavailable:"),
      );
      expect(parseWarn).toBeDefined();
      expect(parseWarn).toContain("codec gap: unsupported real-world construct");
    }
  });

  it("compile failure still produces an error stage (genuine compile error path intact)", async () => {
    // compile throws — must still reach "error" with step="compile".
    mockEngine.compile.mockImplementationOnce(() =>
      Promise.reject(new Error("kmcmplib: fatal syntax error at line 5")),
    );

    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");

    const { result } = renderHook(() =>
      useKeyboardArtifact(baseKb, null, null, null),
    );

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.stage.kind).toBe("error");
    if (result.current.stage.kind === "error") {
      expect(result.current.stage.step).toBe("compile");
      expect(result.current.stage.message).toContain("kmcmplib: fatal syntax error");
    }
  });
});
