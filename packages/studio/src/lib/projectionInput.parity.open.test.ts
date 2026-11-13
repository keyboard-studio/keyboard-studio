// SC-010 for removals on Open (spec 111 "live files"): after a removal is
// applied, the .kmn the code view shows (the working copy's own file), the
// OSK preview's projection and the download all hold the same text, apart from
// the release version and HISTORY. Real projection on every route.

import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useWorkingCopyTransform } from "../hooks/useWorkingCopyTransform.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { applyOpenChange } from "./openApply.ts";
import { readVfsText } from "./vfsText.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const KMN = [
  "c a hand-written comment",
  "store(&NAME) 'Tiny'",
  "store(&VERSION) '10.0'",
  "",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "+ [K_A] > 'a'   c keep this spacing",
  "+ [K_B] > 'b'",
  "+ [K_C] > 'c'",
  "",
].join("\r\n");

const withoutVersion = (s: string): string =>
  s.split(/(?<=\n)/).filter((l) => !/&KEYBOARDVERSION|&VERSION/i.test(l)).join("");

describe("SC-010: a removal on Open reads the same on every route", () => {
  it("code view source, preview projection and download agree", async () => {
    const vfs = createVirtualFS([
      { path: KMN_PATH, content: KMN, isBinary: false },
      { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
    ]);
    const kb = {
      id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"],
      displayName: "Tiny", version: "1.0", languages: ["en"],
    } as StartKeyboard;
    const wc = useWorkingCopyStore.getState();
    wc.reset();
    wc.instantiateFromExisting(kb, { vfs, ir: parseKmn(KMN, ID).ir });
    wc.setAttribution({ authorName: "Parity", copyrightHolder: "Parity" });
    const ruleB = useWorkingCopyStore.getState().startIr!.groups
      .flatMap((g) => g.rules)
      .find((r) => r.context.some((c) => c.kind === "vkey" && c.name === "K_B"))!;
    expect(applyOpenChange({ kind: "remove", itemIds: [ruleB.nodeId], chars: ["b"] }).status).toBe("applied");

    const s = useWorkingCopyStore.getState();
    const codeView = readVfsText(s.startVfs!, KMN_PATH)!;
    expect(codeView).toContain("+ [K_B] > nul"); // the default fallback policy blocks a removed key

    const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: ID }));
    const previewVfs = createVirtualFS(s.startVfs!.entries());
    result.current!(previewVfs, ID);
    const preview = readVfsText(previewVfs, KMN_PATH)!;

    const projected = await projectWorkingCopyForOutput();
    expect(projected).not.toBeNull();
    const download = [...projected!.vfs.entries()].find((e) => e.path === KMN_PATH)!.content as string;

    expect(withoutVersion(preview)).toBe(withoutVersion(codeView));
    expect(withoutVersion(download)).toBe(withoutVersion(codeView));
  });
});
