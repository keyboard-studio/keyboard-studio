// Identity edits on Open (spec 111 Edge Cases: the display name may change, the
// keyboard id may not). They do not rewrite the files when applied: they are
// carried in the identity overlay and written at OUTPUT (projection steps 3 and
// 3.6), by design, with the preview and the download reading the same overlay.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { createVirtualFS, irPath, type StartKeyboard } from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useOpenUndoStore } from "../stores/openUndoStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useWorkingCopyTransform } from "../hooks/useWorkingCopyTransform.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { applyPatchToWorkingCopy } from "./applyPatchToWorkingCopy.ts";
import { readVfsText } from "./vfsText.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
  getPatternByIdSync: () => undefined,
}));

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const KMN = ["store(&NAME) 'Tiny'", "store(&COPYRIGHT) '(c) Old'", "store(&VERSION) '10.0'", "", "begin Unicode > use(main)", "", "group(main) using keys", "+ [K_A] > 'a'", ""].join("\r\n");
const KB = { id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"], displayName: "Tiny", version: "1.0", languages: ["en"] } as StartKeyboard;

beforeEach(() => {
  useOpenUndoStore.getState().clear();
  useDecisionStore.getState().reset();
  const vfs = createVirtualFS([
    { path: KMN_PATH, content: KMN, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
  ]);
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  wc.instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, ID).ir });
  wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const fileText = (): string => readVfsText(useWorkingCopyStore.getState().startVfs!, KMN_PATH)!;
const noVersion = (t: string): string =>
  t.split(/(?<=\n)/).filter((l) => !/&KEYBOARDVERSION|&VERSION/i.test(l)).join("");

async function previewAndDownload(): Promise<{ preview: string; download: string }> {
  const s = useWorkingCopyStore.getState();
  const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: ID }));
  const vfs = createVirtualFS(s.startVfs!.entries());
  result.current!(vfs, ID);
  const projected = await projectWorkingCopyForOutput();
  return { preview: readVfsText(vfs, KMN_PATH)!, download: projected!.vfs.get(KMN_PATH)!.content as string };
}

describe("identity edits on Open reach the output, and preview and download agree", () => {
  it("the identity channel's display name", async () => {
    applyPatchToWorkingCopy({ identity: { displayName: "Renamed" } } as never, []);
    expect(fileText()).toBe(KMN); // carried in the overlay; written at output (step 3)
    const { preview, download } = await previewAndDownload();
    expect(download).toContain("store(&NAME) 'Renamed'");
    expect(noVersion(preview)).toBe(noVersion(download));
  });

  it("a header.name write in an ir patch is carried into the same overlay, with no warning", async () => {
    const warn = vi.spyOn(devLog, "warn").mockImplementation(() => {});
    applyPatchToWorkingCopy({ ir: { header: { name: "Renamed" } } } as never, [irPath("header", "name")]);
    expect(useWorkingCopyStore.getState().identity?.displayName).toBe("Renamed");
    expect(warn).not.toHaveBeenCalled();
    const { preview, download } = await previewAndDownload();
    expect(download).toContain("store(&NAME) 'Renamed'");
    expect(noVersion(preview)).toBe(noVersion(download));
  });

  it("header.copyright is not edited on Open: nothing is written, and it is reported", async () => {
    const warn = vi.spyOn(devLog, "warn").mockImplementation(() => {});
    applyPatchToWorkingCopy({ ir: { header: { copyright: "(c) New" } } } as never, [irPath("header", "copyright")]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("header.copyright"));
    expect(fileText()).toBe(KMN);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
    const { download } = await previewAndDownload();
    expect(download).toContain("store(&COPYRIGHT) '(c) Old'");
  });
});
