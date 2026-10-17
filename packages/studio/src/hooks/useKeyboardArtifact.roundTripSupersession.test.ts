// useKeyboardArtifact — functional I2 supersession across hook instances.
//
// #2249 (Output frontier): the I2 cancellation token used to be per hook
// instance, but a walk runs several instances at once (SurveyView's preview
// plus the Mechanism/Touch gallery previews) and they share one main
// thread. A sibling instance's new compile could not retire the pass in
// flight, and unmounting the owning instance retired nothing — so a
// gallery-era pass kept simulating while the author waited at Output,
// whose own fresh pipeline then had to share the main thread with it and
// did not reach `ready` inside the e2e driver's wait window (CI run
// 39045148284: emit-download stuck on the NOT_READY blocker, the sole
// blocker, with the poll starved to 8 evaluations in 60 s).
//
// This file pins the app-wide discipline:
//   1. A second instance's compile retires the first instance's pass
//      (its shouldAbort flips true), and the second instance's own pass
//      then runs un-aborted.
//   2. Unmounting the owning instance retires its pass.
//   3. A same-instance recompile still retires the instance's own pass
//      (the original 6ee418c1 behaviour, generalised).
//
// The round-trip check is a controllable stub: each call captures its
// deps (including shouldAbort) and stays in flight until the test
// resolves it, so "in flight" is a state the test owns, not a race.
// Hygiene: every mounted hook is unmounted in afterEach and each test
// indexes passes from its own offset, so a deferred I2 start from a
// previous test can never be mistaken for this test's pass.

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type {
  StartKeyboard,
  VirtualFS,
  KeyboardIR,
  LintFinding,
} from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { mixedDiagnosticsResult } from "@keyboard-studio/contracts/fixtures";
import type { RoundTripDeps } from "@keyboard-studio/engine";

// ---------------------------------------------------------------------------
// Engine mock — transport + parse surface (mirrors useKeyboardArtifact.test.ts),
// plus the fidelity stages the hook needs to capture a round-trip input on a
// full run. The round-trip check itself is the controllable stub below.
// ---------------------------------------------------------------------------

const mockIr = makeTestIR([]);

interface CapturedPass {
  deps: RoundTripDeps | undefined;
  resolve: (findings: LintFinding[]) => void;
}
const passes: CapturedPass[] = [];
const mounted: Array<{ unmount: () => void }> = [];

const roundTripCheck = vi.fn(
  (_ir: KeyboardIR, deps?: RoundTripDeps) =>
    new Promise<LintFinding[]>((resolve) => {
      passes.push({ deps, resolve });
    }),
);

const mockEngine = {
  init: vi.fn(() => Promise.resolve()),
  isReady: vi.fn(() => true),
  compile: vi.fn((_vfs: VirtualFS, _keyboardId: string) =>
    Promise.resolve(mixedDiagnosticsResult),
  ),
  fetchKeyboardSourceToVfs: vi.fn(
    (startKeyboard: StartKeyboard, vfs: VirtualFS) => {
      vfs.set(`source/${startKeyboard.id}.kmn`, "c test\n", false);
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
  emitKmn: vi.fn((_ir: KeyboardIR) => "c emitted\n"),
  runImportFidelityParseChecks: vi.fn(() => [] as LintFinding[]),
  runImportFidelityEmitChecksSync: vi.fn(() => [] as LintFinding[]),
  runImportFidelityRoundTripCheck: roundTripCheck,
};

vi.mock("@keyboard-studio/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@keyboard-studio/engine")>()),
  ...mockEngine,
}));

// The I2 harness loads KeymanWeb's simulate through this loader; stub it
// with an immediately-resolving no-op so deps (and shouldAbort) are real.
vi.mock("../components/rules/demoSimulation.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../components/rules/demoSimulation.ts")>()),
  loadDemoSimulate: () => Promise.resolve(() => ({ finalOutput: "", trace: [] })),
}));

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

function kb(id: string): StartKeyboard {
  return {
    id,
    path: `release/t/${id}`,
    script: "Latn",
    targets: ["windows"],
    displayName: `Keyboard ${id}`,
    version: "1.0",
  };
}

const flush = () =>
  act(async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  });

/** Wait until `n` passes have started since `offset` (I2 starts deferred). */
async function waitForPasses(n: number, offset: number): Promise<void> {
  await vi.waitFor(
    () => {
      expect(passes.length - offset).toBeGreaterThanOrEqual(n);
    },
    { timeout: 25_000, interval: 50 },
  );
  await flush();
}

function mount(id: string) {
  return import("./useKeyboardArtifact").then(({ useKeyboardArtifact }) => {
    const h = renderHook(() => useKeyboardArtifact(kb(id), null, null, null));
    mounted.push(h);
    return h;
  });
}

afterEach(async () => {
  for (const h of mounted.splice(0)) {
    try {
      h.unmount();
    } catch {
      /* already unmounted by the test */
    }
  }
  for (const p of passes) p.resolve([]);
  passes.length = 0;
  await flush();
  vi.clearAllMocks();
});

describe("useKeyboardArtifact — I2 supersession across instances (#2249)", () => {
  it("a second instance's compile retires the first instance's in-flight pass", async () => {
    const offset = passes.length;
    const a = await mount("kb_a1");
    await waitForPasses(1, offset);
    expect(a.result.current.stage.kind).toBe("ready");
    const depsA = passes[offset]!.deps;
    expect(depsA).toBeDefined();
    expect(depsA!.shouldAbort!()).toBe(false);

    // A sibling instance (the Output screen's own pipeline) mounts and
    // compiles — the first instance's pass is superseded app-wide.
    const b = await mount("kb_b1");
    await waitForPasses(2, offset);
    expect(b.result.current.stage.kind).toBe("ready");
    expect(depsA!.shouldAbort!()).toBe(true);
    expect(passes[offset + 1]!.deps!.shouldAbort!()).toBe(false);
  });

  it("unmounting the owning instance retires its in-flight pass", async () => {
    const offset = passes.length;
    const a = await mount("kb_a2");
    await waitForPasses(1, offset);
    const depsA = passes[offset]!.deps;
    expect(depsA!.shouldAbort!()).toBe(false);

    a.unmount();
    expect(depsA!.shouldAbort!()).toBe(true);
  });

  it("a same-instance recompile retires its own in-flight pass", async () => {
    const offset = passes.length;
    const a = await mount("kb_a3");
    await waitForPasses(1, offset);
    const depsA = passes[offset]!.deps;
    expect(depsA!.shouldAbort!()).toBe(false);

    await act(async () => {
      a.result.current.recompile();
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    expect(depsA!.shouldAbort!()).toBe(true);
  });
});
