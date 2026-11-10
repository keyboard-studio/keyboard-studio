// An opened keyboard's preview passes openMode, so the preview and the download
// splice the author's text identically (the author's layout survives in both).

import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useWorkingCopyTransform } from "../hooks/useWorkingCopyTransform.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

const KMN_PATH = `source/${basicKbdus.id}.kmn`;
// Deliberately irregular spacing and a comment: a full re-emit would normalise them.
const AUTHOR_KMN = [
  "store(&VERSION) '10.0'",
  "store(&NAME) 'Open Preview'",
  "begin Unicode > use(main)",
  "",
  "c author comment that a re-emit would drop",
  "group(main) using keys",
  "+   [K_A]   >   'a'",
  "+ [K_B] > 'b'",
  "",
].join("\n");

describe("opened keyboard: preview agrees with download", () => {
  it("keeps the author's text in both when a rule is carved", async () => {
    const { ir } = parseKmn(AUTHOR_KMN, basicKbdus.id);
    const vfs = createVirtualFS([
      { path: KMN_PATH, content: AUTHOR_KMN, isBinary: false },
      { path: `source/${basicKbdus.id}.kps`, content: "<Package></Package>\n", isBinary: false },
    ]);
    const wc = useWorkingCopyStore.getState();
    wc.instantiateFromExisting(basicKbdus, { vfs, ir });
    wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
    const carved = ir.groups.flatMap((g) => g.rules)[0]!;
    wc.deleteNode(carved.nodeId);

    const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: basicKbdus.id }));
    const previewVfs = createVirtualFS(vfs.entries());
    result.current!(previewVfs, basicKbdus.id);
    const preview = previewVfs.get(KMN_PATH)!.content as string;

    const projected = await projectWorkingCopyForOutput();
    const download = [...projected!.vfs.entries()].find((e) => e.path === KMN_PATH)!.content as string;

    expect(preview).toContain("author comment that a re-emit would drop");
    // The download alone stamps the release version; nothing else may differ.
    const stripVersion = (t: string): string =>
      t.split(/\r?\n/).filter((l) => !l.startsWith("store(&KEYBOARDVERSION)")).join("\n");
    expect(stripVersion(download)).toBe(stripVersion(preview));
  });
});
