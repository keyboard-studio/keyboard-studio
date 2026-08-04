// Output-only scaffold-stub completion (serializeWorkingCopy step 5b).
//
// A Track 1 (new-from-base) working copy is instantiated from
// fetchKeyboardSourceToVfs, which deliberately never writes the base's .kps
// into the VFS (it references compiled ../build/* artifacts) — and whether
// the SCAFFOLDED artifact (which carries a generated .kps) ever replaces the
// open-base VFS in the store is a compile-settle race the commit seam runs
// only once per base id (StudioShell's instantiatedForBaseIdRef). The output
// projection therefore completes the keyboard directory itself via the
// scaffolder's generateStubs (only-fills-missing), so the downloaded zip is a
// submittable keyboard directory regardless of which artifact won.
//
// Real engine (generateStubs) runs; services.ts is mocked to avoid WASM /
// network I/O, same as serializeWorkingCopy.fragmentBearing.carve.test.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { readVfsText } from "./vfsText.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

const KMN_TEXT = "store(&NAME) 'Stub Test'\nbegin Unicode > use(main)\ngroup(main) using keys\n";

/** Mirrors what fetchKeyboardSourceToVfs actually loads: the .kmn and .kvks,
 * but never the .kps. */
function makeFetchedVfs(keyboardId: string) {
  return createVirtualFS([
    { path: `source/${keyboardId}.kmn`, content: KMN_TEXT, isBinary: false },
    { path: `source/${keyboardId}.kvks`, content: "<KeyboardVisualKeyboard/>", isBinary: false },
  ]);
}

function resetStore() {
  useWorkingCopyStore.getState().reset();
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

afterEach(() => {
  resetStore();
});

describe("output projection completes the scaffold stubs (Track 1)", () => {
  it("generates a non-empty .kps (and welcome.htm) when the working copy has none", async () => {
    const keyboardId = basicKbdus.id;
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: makeFetchedVfs(keyboardId), ir: makeTestIR([]) });

    const projected = await projectWorkingCopyForOutput();
    expect(projected).not.toBeNull();

    const kps = readVfsText(projected!.vfs, `source/${keyboardId}.kps`);
    expect(kps).toBeDefined();
    expect(kps!.length).toBeGreaterThan(0);
    // The minimum-buildable shape buildKpsContent guarantees.
    expect(kps).toContain("<Keyboards>");
    expect(kps).toContain(`<ID>${keyboardId}</ID>`);

    const welcome = readVfsText(projected!.vfs, "source/welcome.htm");
    expect(welcome).toBeDefined();
    expect(welcome!.length).toBeGreaterThan(0);
  });

  it("never overwrites files the working copy already has", async () => {
    const keyboardId = basicKbdus.id;
    const vfs = makeFetchedVfs(keyboardId);
    vfs.set(`source/${keyboardId}.kps`, "<Package>real</Package>", false);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir: makeTestIR([]) });

    const projected = await projectWorkingCopyForOutput();
    expect(readVfsText(projected!.vfs, `source/${keyboardId}.kps`)).toBe("<Package>real</Package>");
    // The fetched .kvks survives untouched too.
    expect(readVfsText(projected!.vfs, `source/${keyboardId}.kvks`)).toBe("<KeyboardVisualKeyboard/>");
  });

  it("does NOT generate stubs for a Track 2 (adapt-existing) working copy", async () => {
    const keyboardId = basicKbdus.id;
    useWorkingCopyStore
      .getState()
      .instantiateFromExisting(basicKbdus, { vfs: makeFetchedVfs(keyboardId), ir: makeTestIR([]) });

    const projected = await projectWorkingCopyForOutput();
    expect(projected).not.toBeNull();
    // Track 2's package fidelity is its own concern — a freshly generated
    // stub .kps would silently mask the imported package's metadata.
    expect(readVfsText(projected!.vfs, `source/${keyboardId}.kps`)).toBeUndefined();
  });
});
