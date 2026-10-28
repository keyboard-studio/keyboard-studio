// useKeyboardArtifact — which instances may write the starting point's
// documentation slices into the working-copy store (KeyboardArtifactOptions
// .startDocs).
//
// The regression: a copy (Track 1) clears the prose slices at scaffold time,
// but every later screen that re-previews the copy's starting keyboard on the
// open-base branch (Output/Criteria via usePreviewArtifact, Compare) wrote the
// base's welcome/help text back — and the shipped copy carried the base's
// prose. Only the instance that instantiates the working copy may write.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { StartKeyboard, VirtualFS, KeyboardIR } from "@keyboard-studio/contracts";
import { makeTestIR, mixedDiagnosticsResult } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardArtifactOptions } from "./useKeyboardArtifact";

const mockIr = makeTestIR([]);

const BASE_WELCOME = "<html><body><p>Base welcome prose.</p></body></html>";
const BASE_HELP = "<?php require_once('header.php'); ?>\n<p>Base help prose.</p>";
const BASE_IMAGES = [{ path: "welcome/chart.png", bytes: new Uint8Array([1]) }];

const mockEngine = {
  init: vi.fn(() => Promise.resolve()),
  isReady: vi.fn(() => true),
  compile: vi.fn((_vfs: VirtualFS, _keyboardId: string) => Promise.resolve(mixedDiagnosticsResult)),
  fetchKeyboardSourceToVfs: vi.fn((_startKeyboard: StartKeyboard, vfs: VirtualFS) => {
    vfs.set("source/test_kb.kmn", "c test\n", false);
    return Promise.resolve({
      startWelcomeHtmText: BASE_WELCOME,
      startHelpPhpText: BASE_HELP,
      startWelcomeImages: BASE_IMAGES,
      startWelcomeConvention: "folder",
    });
  }),
  parseKmn: vi.fn((_text: string, _id: string) => ({
    ir: mockIr,
    opaqueFeatures: [] as Array<{ feature: string; count: number }>,
  })),
  recognizePatterns: vi.fn((_ir: KeyboardIR) => ({ ir: mockIr, recognizedRatio: 0 })),
  parseTouchLayout: vi.fn(),
  stripDanglingAssetStores: vi.fn((kmn: string, _fs: VirtualFS) => ({ kmn, stripped: [] as string[] })),
  classifyRemovalCapabilities: vi.fn((_ir: KeyboardIR) => new Map()),
};

vi.mock("@keyboard-studio/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@keyboard-studio/engine")>()),
  ...mockEngine,
}));

const baseKb: StartKeyboard = {
  id: "test_kb",
  path: "release/t/test_kb",
  script: "Latn",
  targets: ["windows"],
  displayName: "Test Keyboard",
  version: "1.0",
};

const otherKb: StartKeyboard = { ...baseKb, id: "other_kb", path: "release/o/other_kb" };

async function store() {
  const { useWorkingCopyStore } = await import("../stores/workingCopyStore");
  return useWorkingCopyStore;
}

/** A Track 1 copy of baseKb, its prose slices cleared as the scaffold left them. */
async function instantiateCopyOfBase(): Promise<void> {
  const s = (await store()).getState();
  s.instantiateFromStart(baseKb, {
    vfs: createVirtualFS([{ path: "source/test_kb.kmn", content: "c test\n", isBinary: false }]),
    ir: mockIr,
  });
  s.setStartWelcomeHtmText(null);
  s.setStartHelpPhpText(null);
  s.setStartWelcomeImages(null);
}

async function runOpenBase(kb: StartKeyboard, options?: KeyboardArtifactOptions): Promise<void> {
  const { useKeyboardArtifact } = await import("./useKeyboardArtifact");
  renderHook(() => useKeyboardArtifact(kb, null, null, null, options));
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
  expect(mockEngine.fetchKeyboardSourceToVfs).toHaveBeenCalled();
}

beforeEach(async () => {
  (await store()).getState().reset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useKeyboardArtifact — start docs ownership", () => {
  it("a view-only run (no startDocs) leaves a copy's cleared prose slices alone", async () => {
    await instantiateCopyOfBase();
    await runOpenBase(baseKb);

    const s = (await store()).getState();
    expect(s.startWelcomeHtmText).toBeNull();
    expect(s.startHelpPhpText).toBeNull();
    expect(s.startWelcomeImages).toBeNull();
  });

  it('"copy-on-switch" re-previewing the copy\'s own starting keyboard writes nothing', async () => {
    await instantiateCopyOfBase();
    await runOpenBase(baseKb, { startDocs: "copy-on-switch" });

    const s = (await store()).getState();
    expect(s.startWelcomeHtmText).toBeNull();
    expect(s.startHelpPhpText).toBeNull();
    expect(s.startWelcomeImages).toBeNull();
  });

  it('"copy-on-switch" to another keyboard writes the copy\'s slices: images, never prose', async () => {
    await instantiateCopyOfBase();
    await runOpenBase(otherKb, { startDocs: "copy-on-switch" });

    const s = (await store()).getState();
    expect(s.startWelcomeHtmText).toBeNull();
    expect(s.startHelpPhpText).toBeNull();
    expect(s.startWelcomeImages).toEqual(BASE_IMAGES);
    expect(s.baselineDocFindings).toEqual([]);
  });

  it('"by-branch" on the open-base branch retains the base prose for an adaptation', async () => {
    await runOpenBase(baseKb, { startDocs: "by-branch" });

    const s = (await store()).getState();
    expect(s.startWelcomeHtmText).toBe(BASE_WELCOME);
    expect(s.startHelpPhpText).toBe(BASE_HELP);
    expect(s.startWelcomeImages).toEqual(BASE_IMAGES);
  });
});
