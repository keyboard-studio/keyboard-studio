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
//   6. The open-base fetch path passes proxyBase: LOCAL_PROXY_BASE
//      to fetchKeyboardSourceToVfs — dropping it must turn this test red.
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
import type { OnInstantiateCallback, VfsTransform } from "./useKeyboardArtifact";

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
  // parseTouchLayout lets the import path carry a base's shipped touch layout
  // into ir.touchLayout. Returns a minimal one-platform TouchLayoutIR.
  parseTouchLayout: vi.fn((_json: string) => ({
    platforms: [{ id: "phone" as const, layers: [{ id: "default", rows: [] }] }],
    nodeIds: [] as Array<[string, unknown]>,
  })),
  // Preview compile strips dangling packaging-asset stores; the mock is a no-op
  // passthrough (the test .kmn declares no asset stores).
  stripDanglingAssetStores: vi.fn((kmn: string, _fs: VirtualFS) => ({
    kmn,
    stripped: [] as string[],
  })),
  // classifyRemovalCapabilities — returns an empty map (no capabilities needed in this test).
  classifyRemovalCapabilities: vi.fn((_ir: KeyboardIR) => new Map()),
};

// Mock @keyboard-studio/engine so loadEngine() finds compile+fetchKeyboardSourceToVfs+init.
// Spread the real module first via importOriginal() so pure re-exports this
// hook's transitive dependencies rely on (e.g. browserPatternLibrary's
// toPattern/rankPatterns, both node:fs-free) keep working; the mock fields
// below still override the engine surface this test actually exercises.
vi.mock("@keyboard-studio/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@keyboard-studio/engine")>()),
  ...mockEngine,
}));

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
    // classifyRemovalCapabilities wired → removalCapabilities must be a Map
    // reflecting the mock's returned map (the mock returns new Map() each call).
    expect(calledOpts.removalCapabilities).toBeInstanceOf(Map);
  });

  it("carries the base's shipped .keyman-touch-layout into ir.touchLayout", async () => {
    // When the base ships a touch layout, the import path must attach it to the
    // IR so downstream touch authoring edits a COPY of the existing layout
    // (scaffoldTouchLayout Case B) rather than regenerating a default (Case A).
    mockEngine.fetchKeyboardSourceToVfs.mockImplementationOnce(
      (_baseKeyboard: BaseKeyboard, vfs: VirtualFS) => {
        vfs.set("source/test_kb.kmn", "c test\n", false);
        vfs.set(
          "source/test_kb.keyman-touch-layout",
          JSON.stringify({ phone: { layer: [{ id: "default", row: [] }] } }),
          false,
        );
        return Promise.resolve({});
      },
    );

    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");

    const onInstantiate = vi.fn<Parameters<OnInstantiateCallback>, void>();

    renderHook(() => useKeyboardArtifact(baseKb, null, null, onInstantiate));

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(onInstantiate).toHaveBeenCalledTimes(1);
    expect(mockEngine.parseTouchLayout).toHaveBeenCalledTimes(1);
    const [, calledOpts] = onInstantiate.mock.calls[0]!;
    expect(calledOpts.ir).not.toBeNull();
    expect(calledOpts.ir?.touchLayout).toBeDefined();
    expect(calledOpts.ir?.touchLayout?.platforms[0]?.id).toBe("phone");
  });

  it("does not call parseTouchLayout when the base ships no touch layout", async () => {
    // Default fetch seeds only the .kmn — no touch file, so the branch is skipped
    // and the generated default remains the fallback.
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");

    const onInstantiate = vi.fn<Parameters<OnInstantiateCallback>, void>();

    renderHook(() => useKeyboardArtifact(baseKb, null, null, onInstantiate));

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(onInstantiate).toHaveBeenCalledTimes(1);
    expect(mockEngine.parseTouchLayout).not.toHaveBeenCalled();
    const [, calledOpts] = onInstantiate.mock.calls[0]!;
    expect(calledOpts.ir?.touchLayout).toBeUndefined();
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

// ---------------------------------------------------------------------------
// Regression guard: proxyBase pass-through on the open-base path.
//
// A past regression dropped the `{ proxyBase: LOCAL_PROXY_BASE }` option from
// the fetchKeyboardSourceToVfs() call in the open-base fetch path, causing the
// loader to fall back to the default "/kbd-proxy" prefix — which could not
// reach upstream for keyboards whose source lives only under LOCAL_PROXY_BASE.
//
// This test asserts that fetchKeyboardSourceToVfs() is always called with
// proxyBase: LOCAL_PROXY_BASE in the open-base path. Dropping that option from
// the call site must turn this test red.
// ---------------------------------------------------------------------------

describe("useKeyboardArtifact — open-base proxyBase pass-through (regression guard)", () => {
  it("calls fetchKeyboardSourceToVfs with proxyBase: LOCAL_PROXY_BASE", async () => {
    // Pull the constant from the same dynamic import as the hook so the
    // assertion is by reference, without a top-level value import (which would
    // eagerly load the mocked engine and break vi.mock hoisting).
    const { useKeyboardArtifact, LOCAL_PROXY_BASE } = await import(
      "./useKeyboardArtifact"
    );

    renderHook(() => useKeyboardArtifact(baseKb, null, null, null));

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    // The mock spy captures every call including options.
    // The hook's open-base path calls engineRef.current.fetchKeyboardSourceToVfs(kb, vfs, opts).
    expect(mockEngine.fetchKeyboardSourceToVfs).toHaveBeenCalled();

    const [, , opts] =
      mockEngine.fetchKeyboardSourceToVfs.mock.calls[0] as [unknown, unknown, Record<string, string> | undefined];

    // proxyBase must be LOCAL_PROXY_BASE — asserted by reference so a rename of
    // the constant can't let a same-root-cause regression pass a green suite.
    // If the call site drops proxyBase the opts object will be undefined or
    // omit the key, and this assertion will fail — that is the intended signal.
    expect(opts).toBeDefined();
    expect((opts as { proxyBase?: string })?.proxyBase).toBe(LOCAL_PROXY_BASE);
  });
});

// ---------------------------------------------------------------------------
// Regression guard: Track 1 (no scaffoldSpec) identity-rename compile.
//
// projectWorkingCopyVfs's Step 4 id-rename pass renames source/<baseId>.kmn to
// source/<targetId>.kmn inside the VFS when the author changes the keyboard id
// with no scaffoldSpec present. Before this fix, runCompile always compiled
// scaffoldSpec?.keyboardId ?? kb.id — the stale base id — so compile() looked
// for a file that no longer existed and the stage was stuck in "error"
// permanently. The VfsTransform's effectiveKeyboardId return value is how the
// transform tells the hook the rename happened; this suite pins that the hook
// actually uses it.
// ---------------------------------------------------------------------------

describe("useKeyboardArtifact — vfsTransform effectiveKeyboardId (Track 1 id rename)", () => {
  it("compiles with the renamed id when vfsTransform reports effectiveKeyboardId on the initial run", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");

    const renamingTransform: VfsTransform = (vfs, keyboardId) => {
      // Mirror what projectWorkingCopyVfs's rename pass does: move the .kmn to
      // the new id's path inside the VFS.
      const entry = vfs.get(`source/${keyboardId}.kmn`);
      if (entry !== undefined) {
        vfs.delete(`source/${keyboardId}.kmn`);
        vfs.set("source/renamed_kb.kmn", entry.content, entry.isBinary);
      }
      return { warnings: [], effectiveKeyboardId: "renamed_kb" };
    };

    const { result } = renderHook(() =>
      useKeyboardArtifact(baseKb, null, renamingTransform, null),
    );

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.stage.kind).toBe("ready");
    // compile() must have been called with the renamed id, not baseKb.id.
    expect(mockEngine.compile).toHaveBeenCalledWith(expect.anything(), "renamed_kb");
    if (result.current.stage.kind === "ready") {
      expect(result.current.stage.keyboardId).toBe("renamed_kb");
    }
  });

  it("does not override compileId when vfsTransform reports no effectiveKeyboardId", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");

    const noopTransform: VfsTransform = () => ({ warnings: [] });

    const { result } = renderHook(() =>
      useKeyboardArtifact(baseKb, null, noopTransform, null),
    );

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.stage.kind).toBe("ready");
    expect(mockEngine.compile).toHaveBeenCalledWith(expect.anything(), baseKb.id);
    if (result.current.stage.kind === "ready") {
      expect(result.current.stage.keyboardId).toBe(baseKb.id);
    }
  });

  it("carries the renamed id into a subsequent recompile() call (same run, no re-fetch)", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");

    const renamingTransform: VfsTransform = (vfs, keyboardId) => {
      const entry = vfs.get(`source/${keyboardId}.kmn`);
      if (entry !== undefined) {
        vfs.delete(`source/${keyboardId}.kmn`);
        vfs.set("source/renamed_kb.kmn", entry.content, entry.isBinary);
      }
      return { warnings: [], effectiveKeyboardId: "renamed_kb" };
    };

    const { result } = renderHook(() =>
      useKeyboardArtifact(baseKb, null, renamingTransform, null),
    );

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.stage.kind).toBe("ready");
    mockEngine.compile.mockClear();

    // recompile() re-runs runCompile against the already-transformed VFS —
    // it must keep using the renamed id, not fall back to baseKb.id.
    await act(async () => {
      result.current.recompile();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(mockEngine.compile).toHaveBeenCalledWith(expect.anything(), "renamed_kb");
  });
});

// ---------------------------------------------------------------------------
// Regression guard: the transformVersion reapply effect (fires when the
// vfsTransform prop reference changes after the initial fetch — e.g. an
// identity-rename edit while already on the ready stage). This is a distinct
// code path from the initial-run capture above: it restores the clean
// baseVfsRef snapshot, re-invokes the transform, and recompiles WITHOUT a
// re-fetch. effectiveKeyboardIdRef must be re-derived correctly on every
// reapply, including when the transform throws.
// ---------------------------------------------------------------------------

describe("useKeyboardArtifact — vfsTransform effectiveKeyboardId (reapply effect)", () => {
  function makeRenamingTransform(newId: string): VfsTransform {
    return (vfs, keyboardId) => {
      const entry = vfs.get(`source/${keyboardId}.kmn`);
      if (entry !== undefined) {
        vfs.delete(`source/${keyboardId}.kmn`);
        vfs.set(`source/${newId}.kmn`, entry.content, entry.isBinary);
      }
      return { warnings: [], effectiveKeyboardId: newId };
    };
  }

  const noopTransform: VfsTransform = () => ({ warnings: [] });

  it("(a) reapply after a rename carries the renamed id into recompile", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");

    const { result, rerender } = renderHook(
      ({ transform }: { transform: VfsTransform | null }) =>
        useKeyboardArtifact(baseKb, null, transform, null),
      { initialProps: { transform: noopTransform } },
    );

    // Initial full run — no rename yet.
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.stage.kind).toBe("ready");
    expect(mockEngine.compile).toHaveBeenLastCalledWith(expect.anything(), baseKb.id);

    // A NEW transform reference (e.g. the author renamed the id) triggers the
    // transformVersion reapply effect — not a re-fetch.
    mockEngine.fetchKeyboardSourceToVfs.mockClear();
    mockEngine.compile.mockClear();
    rerender({ transform: makeRenamingTransform("renamed_kb") });

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    // No re-fetch — the reapply effect works off the existing VFS.
    expect(mockEngine.fetchKeyboardSourceToVfs).not.toHaveBeenCalled();
    expect(mockEngine.compile).toHaveBeenCalledWith(expect.anything(), "renamed_kb");
    if (result.current.stage.kind === "ready") {
      expect(result.current.stage.keyboardId).toBe("renamed_kb");
    }
  });

  it("(b) rename then revert to the base id in a later transform run clears the ref and compiles with the base id", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");

    const { result, rerender } = renderHook(
      ({ transform }: { transform: VfsTransform | null }) =>
        useKeyboardArtifact(baseKb, null, transform, null),
      { initialProps: { transform: noopTransform } },
    );

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    // Rename.
    rerender({ transform: makeRenamingTransform("renamed_kb") });
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(mockEngine.compile).toHaveBeenLastCalledWith(expect.anything(), "renamed_kb");

    // Revert: a later transform run reports no effectiveKeyboardId. The
    // baseVfsRef snapshot restore means this transform sees the ORIGINAL
    // (un-renamed) VFS again, matching what the author reverting the id
    // field actually does in the real transform.
    mockEngine.compile.mockClear();
    rerender({ transform: noopTransform });
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(mockEngine.compile).toHaveBeenCalledWith(expect.anything(), baseKb.id);
    if (result.current.stage.kind === "ready") {
      expect(result.current.stage.keyboardId).toBe(baseKb.id);
    }
  });

  it("(c) a reapply whose transform throws falls back to the base id against the clean snapshot", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");

    const throwingTransform: VfsTransform = () => {
      throw new Error("transform blew up");
    };

    const { result, rerender } = renderHook(
      ({ transform }: { transform: VfsTransform | null }) =>
        useKeyboardArtifact(baseKb, null, transform, null),
      { initialProps: { transform: noopTransform } },
    );

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    // Establish a rename first, so a stale effectiveKeyboardIdRef value would
    // be observable if the throw path failed to clear it.
    rerender({ transform: makeRenamingTransform("renamed_kb") });
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(mockEngine.compile).toHaveBeenLastCalledWith(expect.anything(), "renamed_kb");

    // Now reapply with a transform that throws.
    mockEngine.compile.mockClear();
    rerender({ transform: throwingTransform });
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    // Must fall back to the base id — NOT the stale "renamed_kb" — because
    // effectiveKeyboardIdRef is reset before the throwing transform runs, and
    // vfsRef.current was restored to the clean un-renamed base snapshot
    // before the (failed) transform call.
    expect(mockEngine.compile).toHaveBeenCalledWith(expect.anything(), baseKb.id);
    if (result.current.stage.kind === "ready") {
      expect(result.current.stage.keyboardId).toBe(baseKb.id);
    }
  });
});
