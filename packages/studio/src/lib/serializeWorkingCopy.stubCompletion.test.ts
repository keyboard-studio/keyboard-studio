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
    // welcome.htm is the stub-only artifact: step 5b writes it, nothing else
    // does, so its absence is what "generateStubs did not run" looks like from
    // the delivered tree.
    expect(readVfsText(projected!.vfs, "source/welcome.htm")).toBeUndefined();
    // The .kps is NOT a counter-example. Step 5b still skips this track; the
    // descriptor here comes from step 3.6, which runs on BOTH tracks
    // (spec 059 FR-006). It cannot mask imported package metadata — the
    // fear the earlier assertion here encoded — because
    // fetchKeyboardSourceToVfs never fetches the base's .kps in the first
    // place (it references compiled ../build/* artifacts), so before 3.6 the
    // adapt track shipped no descriptor at all. serializeWorkingCopy.descriptor.test.ts
    // owns what it declares; this only pins which step produced it.
    const kps = readVfsText(projected!.vfs, `source/${keyboardId}.kps`);
    expect(kps).toBeDefined();
    expect(kps).toContain(`<ID>${keyboardId}</ID>`);
  });
});
