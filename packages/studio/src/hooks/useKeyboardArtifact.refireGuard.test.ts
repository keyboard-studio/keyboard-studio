// useKeyboardArtifact — full-run refire guard (regression).
//
// Bug (union-tree CI run 37754110396): the full fetch→compile effect keyed
// on OBJECT identity of its deps. Callers re-derive scaffoldSpec on every
// render (identitySelectors, called bare in StudioShell) and hosts re-render
// on the hook's own stage transitions, so the effect restarted the full run
// continuously: each restart fetched the whole base package and then aborted
// at its runId checkpoint. One 240 s e2e walk issued ~5,800 base-package
// fetches (~26/s sustained) and starved every step into the 240 s cap.
//
// The guard compares the run target by VALUE (base id + scaffold keyboardId
// + displayName). These tests pin:
//   1. Re-renders with fresh object identities but equal values do NOT
//      re-fetch (open-base path; fetch spy stays at 1).
//   2. Same for the scaffold (Track 1) path with fresh scaffoldSpec objects
//      (scaffold spy stays at 1).
//   3. A VALUE change (different scaffold keyboardId) starts a new run.
//   4. retry() bypasses the guard and re-runs for the same value key.
//
// #2044: the transformVersion effect had NO such guard. Once a vfsTransform
// change armed the version, every host re-render carrying a fresh
// scaffoldSpec identity refired the re-apply+recompile effect, and each
// compile's stage transitions re-rendered the host — a self-sustaining loop
// (~6–8 full compiles/second) that froze the tab on carve → Continue. The
// "transform re-apply refire guard" describe block below pins the value-key
// guard added there (lastTransformRunKeyRef):
//   5. Identity churn with equal values does NOT re-apply or recompile.
//   6. A genuine transform change still re-applies (the guard keys on
//      transformVersion, so it cannot latch shut).

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { StartKeyboard, VirtualFS, KeyboardIR } from "@keyboard-studio/contracts";
import { makeTestIR, mixedDiagnosticsResult } from "@keyboard-studio/contracts/fixtures";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { OnInstantiateCallback, VfsTransform } from "./useKeyboardArtifact";

const mockIr = makeTestIR([]);

const mockEngine = {
  init: vi.fn(() => Promise.resolve()),
  isReady: vi.fn(() => true),
  compile: vi.fn((_vfs: VirtualFS, _keyboardId: string) =>
    Promise.resolve(mixedDiagnosticsResult),
  ),
  fetchKeyboardSourceToVfs: vi.fn(
    (_startKeyboard: StartKeyboard, vfs: VirtualFS) => {
      vfs.set("source/test_kb.kmn", "c test\n", false);
      return Promise.resolve({});
    },
  ),
  parseKmn: vi.fn((_text: string, _id: string) => ({
    ir: mockIr,
    opaqueFeatures: [] as Array<{ feature: string; count: number }>,
  })),
  recognizePatterns: vi.fn((_ir: KeyboardIR) => ({
    ir: mockIr,
    recognizedRatio: 0,
  })),
  parseTouchLayout: vi.fn((_json: string) => ({
    platforms: [{ id: "phone" as const, layers: [{ id: "default", rows: [] }] }],
    nodeIds: [] as Array<[string, unknown]>,
  })),
  stripDanglingAssetStores: vi.fn((kmn: string, _fs: VirtualFS) => ({
    kmn,
    stripped: [] as string[],
  })),
  classifyRemovalCapabilities: vi.fn((_ir: KeyboardIR) => new Map()),
};

vi.mock("@keyboard-studio/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@keyboard-studio/engine")>()),
  ...mockEngine,
}));

// Scaffold-path stub: seeds a VFS the same way the engine fetch mock does and
// returns a complete minimal ScaffoldResult. Only the two names the hook
// imports from services.ts are provided.
const scaffoldSpy = vi.fn(
  (_kb: StartKeyboard, keyboardId: string, _displayName: string, _opts?: unknown) => {
    const vfs = createVirtualFS();
    vfs.set(`source/${keyboardId}.kmn`, "c test\n", false);
    return Promise.resolve({
      vfs,
      warnings: [] as string[],
      fonts: [],
      stylesheets: [],
      attributionMissing: false,
      inheritedHolderCount: 0,
    });
  },
);
vi.mock("../lib/services.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/services.ts")>()),
  getScaffolderService: () => Promise.resolve({ scaffold: scaffoldSpy }),
}));

const baseKb: StartKeyboard = {
  id: "test_kb",
  path: "release/t/test_kb",
  script: "Latn",
  targets: ["windows"],
  displayName: "Test Keyboard",
  version: "1.0",
};

async function settle() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useKeyboardArtifact — full-run refire guard", () => {
  it("does not re-fetch when re-rendered with fresh identities but equal values (open-base)", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");
    const onInstantiate = vi.fn<Parameters<OnInstantiateCallback>, void>();

    const { result, rerender } = renderHook(
      (props: { kb: StartKeyboard }) =>
        useKeyboardArtifact(props.kb, null, null, onInstantiate),
      { initialProps: { kb: baseKb } },
    );
    await settle();
    expect(mockEngine.fetchKeyboardSourceToVfs).toHaveBeenCalledTimes(1);
    expect(result.current.stage.kind).toBe("ready");

    // Fresh object identity, same id — the churn the live wiring produces.
    rerender({ kb: { ...baseKb } });
    await settle();
    rerender({ kb: { ...baseKb, displayName: "Test Keyboard" } });
    await settle();

    expect(mockEngine.fetchKeyboardSourceToVfs).toHaveBeenCalledTimes(1);
    expect(onInstantiate).toHaveBeenCalledTimes(1);
  });

  it("does not re-scaffold when re-rendered with fresh scaffoldSpec objects of equal value (Track 1)", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");
    const onInstantiate = vi.fn<Parameters<OnInstantiateCallback>, void>();
    const spec = { keyboardId: "test_kb_copy", displayName: "Test Copy" };

    const { rerender } = renderHook(
      (props: { spec: { keyboardId: string; displayName: string } }) =>
        useKeyboardArtifact(baseKb, props.spec, null, onInstantiate),
      { initialProps: { spec } },
    );
    await settle();
    expect(scaffoldSpy).toHaveBeenCalledTimes(1);

    rerender({ spec: { ...spec } });
    await settle();
    rerender({ spec: { keyboardId: "test_kb_copy", displayName: "Test Copy" } });
    await settle();

    expect(scaffoldSpy).toHaveBeenCalledTimes(1);
    expect(onInstantiate).toHaveBeenCalledTimes(1);
  });

  it("starts a new run when the scaffold target VALUE changes", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");
    const onInstantiate = vi.fn<Parameters<OnInstantiateCallback>, void>();

    const { rerender } = renderHook(
      (props: { spec: { keyboardId: string; displayName: string } }) =>
        useKeyboardArtifact(baseKb, props.spec, null, onInstantiate),
      { initialProps: { spec: { keyboardId: "copy_a", displayName: "Copy A" } } },
    );
    await settle();
    expect(scaffoldSpy).toHaveBeenCalledTimes(1);

    rerender({ spec: { keyboardId: "copy_b", displayName: "Copy B" } });
    await settle();
    expect(scaffoldSpy).toHaveBeenCalledTimes(2);
  });

  it("retry() bypasses the guard and re-runs for the same value key", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");
    const onInstantiate = vi.fn<Parameters<OnInstantiateCallback>, void>();

    const { result } = renderHook(() =>
      useKeyboardArtifact(baseKb, null, null, onInstantiate),
    );
    await settle();
    expect(mockEngine.fetchKeyboardSourceToVfs).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.retry();
    });
    await settle();
    expect(mockEngine.fetchKeyboardSourceToVfs).toHaveBeenCalledTimes(2);
  });
});

describe("useKeyboardArtifact — transform re-apply refire guard (#2044)", () => {
  const makeTransform = () =>
    vi.fn<Parameters<VfsTransform>, ReturnType<VfsTransform>>(() => ({
      warnings: [] as string[],
    }));

  it("does not re-apply or recompile when re-rendered with fresh scaffoldSpec identities but equal values", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");
    const onInstantiate = vi.fn<Parameters<OnInstantiateCallback>, void>();
    const spec = { keyboardId: "test_kb_copy", displayName: "Test Copy" };
    const transformA = makeTransform();
    const transformB = makeTransform();

    const { result, rerender } = renderHook(
      (props: {
        spec: { keyboardId: string; displayName: string };
        transform: VfsTransform;
      }) => useKeyboardArtifact(baseKb, props.spec, props.transform, onInstantiate),
      { initialProps: { spec, transform: transformA as VfsTransform } },
    );
    await settle();
    expect(result.current.stage.kind).toBe("ready");
    // Full run: scaffolded once, transform applied once, compiled once.
    expect(scaffoldSpy).toHaveBeenCalledTimes(1);
    expect(transformA).toHaveBeenCalledTimes(1);
    expect(mockEngine.compile).toHaveBeenCalledTimes(1);

    // A genuine transform change after the fetch arms transformVersion:
    // the new transform is re-applied and the keyboard recompiled, once.
    rerender({ spec, transform: transformB as VfsTransform });
    await settle();
    expect(transformB).toHaveBeenCalledTimes(1);
    expect(mockEngine.compile).toHaveBeenCalledTimes(2);

    // Identity churn with equal values — the host's per-render
    // re-derivation of scaffoldSpec. Pre-fix, each of these rerenders
    // refired the transform effect: another re-apply and another compile,
    // and in the live wiring each compile's stage transitions re-rendered
    // the host, sustaining the loop with no further input. The value-key
    // guard must hold both counts flat.
    rerender({ spec: { ...spec }, transform: transformB as VfsTransform });
    await settle();
    rerender({
      spec: { keyboardId: "test_kb_copy", displayName: "Test Copy" },
      transform: transformB as VfsTransform,
    });
    await settle();
    rerender({ spec: { ...spec }, transform: transformB as VfsTransform });
    await settle();

    expect(transformB).toHaveBeenCalledTimes(1);
    expect(mockEngine.compile).toHaveBeenCalledTimes(2);
    expect(scaffoldSpy).toHaveBeenCalledTimes(1);
    expect(onInstantiate).toHaveBeenCalledTimes(1);
  });

  it("still re-applies when the transform changes again after identity churn (guard keys on transformVersion)", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");
    const onInstantiate = vi.fn<Parameters<OnInstantiateCallback>, void>();
    const spec = { keyboardId: "test_kb_copy", displayName: "Test Copy" };
    const transformA = makeTransform();
    const transformB = makeTransform();
    const transformC = makeTransform();

    const { rerender } = renderHook(
      (props: {
        spec: { keyboardId: string; displayName: string };
        transform: VfsTransform;
      }) => useKeyboardArtifact(baseKb, props.spec, props.transform, onInstantiate),
      { initialProps: { spec, transform: transformA as VfsTransform } },
    );
    await settle();
    expect(mockEngine.compile).toHaveBeenCalledTimes(1);

    rerender({ spec, transform: transformB as VfsTransform });
    await settle();
    expect(transformB).toHaveBeenCalledTimes(1);
    expect(mockEngine.compile).toHaveBeenCalledTimes(2);

    // Churn (skipped by the guard), then a genuine transform change: the
    // version bump changes the guard key, so the re-apply still happens.
    rerender({ spec: { ...spec }, transform: transformB as VfsTransform });
    await settle();
    rerender({ spec: { ...spec }, transform: transformC as VfsTransform });
    await settle();

    expect(transformC).toHaveBeenCalledTimes(1);
    expect(mockEngine.compile).toHaveBeenCalledTimes(3);
  });
});
