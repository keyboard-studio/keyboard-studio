// Open (spec 111 FR-043): a file the author's tools write into the working
// copy re-runs the preview end to end. useWorkingCopyTransform hands
// useKeyboardArtifact a new transform, the artifact hook re-applies it onto
// the fetched files and recompiles, and the compile sees the edited file.

import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { StartKeyboard, VirtualFS } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, mixedDiagnosticsResult } from "@keyboard-studio/contracts/fixtures";

const KVKS_PATH = "source/test_kb.kvks";
const KMN = "store(&NAME) 'T'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > 'a'\n";
const mockIr = makeTestIR([]);
const compiledKvks = vi.hoisted(() => [] as Array<string | undefined>);

const mockEngine = vi.hoisted(() => ({
  init: vi.fn(() => Promise.resolve()),
  isReady: vi.fn(() => true),
  compile: vi.fn((vfs: VirtualFS, _keyboardId: string) => {
    const c = vfs.get(KVKS_PATH)?.content;
    compiledKvks.push(typeof c === "string" ? c : undefined);
    return Promise.resolve(mixedDiagnosticsResult);
  }),
  fetchKeyboardSourceToVfs: vi.fn((_kb: StartKeyboard, vfs: VirtualFS) => {
    vfs.set("source/test_kb.kmn", KMN, false);
    vfs.set(KVKS_PATH, "<fetched/>", false);
    return Promise.resolve({});
  }),
  recognizePatterns: vi.fn(() => ({ ir: mockIr, recognizedRatio: 0 })),
  stripDanglingAssetStores: vi.fn((kmn: string) => ({ kmn, stripped: [] as string[] })),
  classifyRemovalCapabilities: vi.fn(() => new Map()),
}));

vi.mock("@keyboard-studio/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@keyboard-studio/engine")>()),
  ...mockEngine,
}));

vi.mock("../lib/services.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/services.ts")>()),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

const kb: StartKeyboard = {
  id: "test_kb",
  path: "release/t/test_kb",
  script: "Latn",
  targets: ["windows"],
  displayName: "T",
  version: "1.0",
};

async function settle() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

describe("Open: a working-copy file change reaches the compile", () => {
  it("re-applies the transform and recompiles with the edited file", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact.ts");
    const { useWorkingCopyStore } = await import("../stores/workingCopyStore.ts");
    const { parseKmn } = await import("@keyboard-studio/engine");
    const { useWorkingCopyTransform } = await import("./useWorkingCopyTransform.ts");
    useWorkingCopyStore.getState().reset();
    const seedVfs = createVirtualFS([
      { path: "source/test_kb.kmn", content: KMN, isBinary: false },
      { path: KVKS_PATH, content: "<fetched/>", isBinary: false },
    ]);
    useWorkingCopyStore.getState().instantiateFromExisting(kb, { vfs: seedVfs, ir: parseKmn(KMN, "test_kb").ir });

    const { result } = renderHook(() => {
      const transform = useWorkingCopyTransform({ previewedStartId: "test_kb" });
      return useKeyboardArtifact(kb, null, transform, vi.fn());
    });
    await settle();
    expect(result.current.stage.kind).toBe("ready");
    const before = mockEngine.compile.mock.calls.length;
    // The first compile already ran on the (still unedited) working copy.
    expect(compiledKvks.at(-1)).toBe("<fetched/>");

    act(() => {
      useWorkingCopyStore.getState().replaceStartingPointFromText(KVKS_PATH, "<edited/>");
    });
    await settle();

    expect(mockEngine.compile.mock.calls.length).toBeGreaterThan(before);
    expect(compiledKvks.at(-1)).toBe("<edited/>");
  });
});
