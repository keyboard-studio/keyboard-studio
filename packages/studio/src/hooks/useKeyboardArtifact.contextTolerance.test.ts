// useKeyboardArtifact — context-tolerance follow-on task (spec 078 T016).
//
// The analysis must never delay the preview (FR-001): the stage reaches
// `ready` while the analysis is still pending, a superseded run's result is
// discarded, a thrown analysis records `failed`, and without the option no
// analysis runs at all. The analysis itself is mocked with a controllable
// promise; the engine mock is the one useKeyboardArtifact.test.ts uses.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { BaseKeyboard, VirtualFS, KeyboardIR } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { mixedDiagnosticsResult } from "@keyboard-studio/contracts/fixtures";
import type { ContextToleranceResult } from "../lib/contextToleranceAnalysis.ts";

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

vi.mock("@keyboard-studio/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@keyboard-studio/engine")>()),
  ...mockEngine,
}));

interface Deferred {
  resolve: (r: ContextToleranceResult | null) => void;
  reject: (e: unknown) => void;
}
const pending: Deferred[] = [];
const analyse = vi.fn(
  (_ir: KeyboardIR, _isCurrent: () => boolean) =>
    new Promise<ContextToleranceResult | null>((resolve, reject) => {
      pending.push({ resolve, reject });
    }),
);
vi.mock("../lib/contextToleranceAnalysis.ts", () => ({
  analyseContextTolerance: (ir: KeyboardIR, isCurrent: () => boolean) => analyse(ir, isCurrent),
}));

const baseKb: BaseKeyboard = {
  id: "test_kb",
  path: "release/t/test_kb",
  script: "Latn",
  targets: ["windows"],
  displayName: "Test Keyboard",
  version: "1.0",
};

function result(fingerprint: string): ContextToleranceResult {
  return {
    report: { findings: [], notAnalysedCount: 0 },
    findings: [],
    classification: {},
    proposal: { ir: mockIr, variants: [], disclosures: {} },
    analysedIr: mockIr,
    fixableRuleIds: [],
    siteKeys: {},
    fingerprint,
  };
}

// Imported lazily: a static import would evaluate the store (and through it
// the mocked engine) before the hoisted vi.mock factories' variables exist.
async function store() {
  return (await import("../stores/workingCopyStore.ts")).useWorkingCopyStore.getState;
}

const flush = () => act(async () => { await new Promise<void>((r) => setTimeout(r, 0)); });

beforeEach(async () => {
  pending.length = 0;
  (await store())().setContextTolerance({ status: "idle" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useKeyboardArtifact — context-tolerance analysis (spec 078)", () => {
  it("reaches ready before the analysis finishes, then publishes the result", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");
    const { result: hook } = renderHook(() =>
      useKeyboardArtifact(baseKb, null, null, null, { analyseContextTolerance: true }),
    );
    await flush();

    expect(hook.current.stage.kind).toBe("ready");
    expect((await store())().contextTolerance.status).toBe("analysing");
    expect(analyse).toHaveBeenCalledTimes(1);

    await act(async () => { pending[0]!.resolve(result("aaaa")); });
    const state = (await store())().contextTolerance;
    expect(state.status).toBe("ready");
    expect(state.status === "ready" && state.fingerprint).toBe("aaaa");
  });

  it("discards a superseded run's result", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");
    const { result: hook } = renderHook(() =>
      useKeyboardArtifact(baseKb, null, null, null, { analyseContextTolerance: true }),
    );
    await flush();
    await act(async () => { hook.current.recompile(); });
    await flush();
    expect(analyse).toHaveBeenCalledTimes(2);

    // The first run's isCurrent() is now false, and its late result is dropped.
    expect(analyse.mock.calls[0]![1]()).toBe(false);
    await act(async () => { pending[0]!.resolve(result("stale")); });
    expect((await store())().contextTolerance.status).toBe("analysing");

    await act(async () => { pending[1]!.resolve(result("fresh")); });
    const state = (await store())().contextTolerance;
    expect(state.status === "ready" && state.fingerprint).toBe("fresh");
  });

  it("records failed when the analysis throws", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");
    renderHook(() => useKeyboardArtifact(baseKb, null, null, null, { analyseContextTolerance: true }));
    await flush();

    await act(async () => { pending[0]!.reject(new Error("compile worker crashed")); });
    const state = (await store())().contextTolerance;
    expect(state.status).toBe("failed");
    expect(state.status === "failed" && state.reason).toBe("compile worker crashed");
  });

  it("runs no analysis without the option", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");
    const { result: hook } = renderHook(() => useKeyboardArtifact(baseKb, null, null, null));
    await flush();

    expect(hook.current.stage.kind).toBe("ready");
    expect(analyse).not.toHaveBeenCalled();
    expect((await store())().contextTolerance.status).toBe("idle");
  });

  it("runs no analysis when the option is false (flag off)", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");
    renderHook(() => useKeyboardArtifact(baseKb, null, null, null, { analyseContextTolerance: false }));
    await flush();
    expect(analyse).not.toHaveBeenCalled();
  });
});
