// commitDescriptorOnOpen: the language list on Open is a live write into the keyboard's own .kps
// (spec 111 FR-041/FR-012, SC-010 for the descriptor): one undo record per
// commit, identity follows the file, preview and download read the same text.

import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useWorkingCopyTransform } from "../hooks/useWorkingCopyTransform.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { applyOpenChange, undoLastOpenApply } from "./openApply.ts";
import { readVfsText } from "./vfsText.ts";
import { clearOpenSession, useOpenUndoStore } from "../stores/openUndoStore.ts";
import { commitDescriptorOnOpen } from "./descriptorOpenCommit.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const KPS_PATH = `source/${ID}.kps`;
const KMN = ["store(&NAME) 'Tiny'", "store(&VERSION) '10.0'", "", "begin Unicode > use(main)", "", "group(main) using keys", "+ [K_A] > 'a'", ""].join("\r\n");
const KPS = [
  "﻿<Package>\r\n",
  "  <Info>\r\n    <Name URL=\"\">Tiny</Name>\r\n    <Description URL=\"\">Mine.</Description>\r\n  </Info>\r\n",
  "  <Keyboards>\r\n    <Keyboard>\r\n      <Name>Tiny</Name>\r\n      <Version>1.0</Version>\r\n",
  "      <Languages>\r\n        <Language ID=\"bas\">Basaa</Language>\r\n        <Language ID=\"bkm\">Kom</Language>\r\n      </Languages>\r\n",
  "    </Keyboard>\r\n  </Keyboards>\r\n</Package>\r\n",
].join("");

const withoutVersion = (s: string): string =>
  s.replace(/<Version[^>]*>[^<]*<\/Version>/g, "<Version/>").split(/(?<=\n)/).filter((l) => !/&KEYBOARDVERSION|&VERSION/i.test(l)).join("");

function open(mode: "open" | "copy" = "open"): void {
  const vfs = createVirtualFS([
    { path: KMN_PATH, content: KMN, isBinary: false },
    { path: KPS_PATH, content: KPS, isBinary: false },
  ]);
  const kb = {
    id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"],
    displayName: "Tiny", version: "1.0", languages: ["bas"],
  } as StartKeyboard;
  clearOpenSession();
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  const seed = { vfs, ir: parseKmn(KMN, ID).ir };
  if (mode === "open") wc.instantiateFromExisting(kb, seed);
  else wc.instantiateFromStart(kb, seed);
  wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
  wc.setFallbackPolicy("pass-through");
}

const host = (c: Parameters<typeof applyOpenChange>[0]) => Promise.resolve(applyOpenChange(c));
const commit = (languages: { tag: string; name?: string }[]) => commitDescriptorOnOpen({ languages }, host);
const kpsNow = (): string => readVfsText(useWorkingCopyStore.getState().startVfs!, KPS_PATH)!;
const tags = (): string[] => (useWorkingCopyStore.getState().identity?.languages ?? []).map((l) => l.tag);

describe("language list on Open writes the .kps now", () => {
  it("a no-op commit changes nothing and records no undo step", async () => {
    open();
    expect(await commit([{ tag: "bas" }, { tag: "bkm" }])).toBe("written");
    expect(kpsNow()).toBe(KPS);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });

  it("a reorder writes the file, follows into identity, and undo is byte-identical", async () => {
    open();
    expect(tags()).toEqual(["bas", "bkm"]);
    expect(await commit([{ tag: "bkm" }, { tag: "bas" }])).toBe("written");
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    expect(useOpenUndoStore.getState().records[0]?.labelKey).toBe("languages");
    expect(kpsNow()).not.toBe(KPS);
    expect(tags()).toEqual(["bkm", "bas"]);
    expect(undoLastOpenApply().ok).toBe(true);
    expect(kpsNow()).toBe(KPS);
    expect(tags()).toEqual(["bas", "bkm"]);
  });

  it("removing a language (the MissingLetters path) writes the same way", async () => {
    open();
    expect(await commit([{ tag: "bas" }])).toBe("written");
    expect(kpsNow()).not.toContain("bkm");
    expect(tags()).toEqual(["bas"]);
    expect(undoLastOpenApply().ok).toBe(true);
    expect(kpsNow()).toBe(KPS);
  });

  it("preview and download read the written .kps, apart from <Version>", async () => {
    open();
    await commit([{ tag: "bkm" }, { tag: "ewo", name: "Ewondo" }]);
    const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: ID }));
    const fetched = createVirtualFS([
      { path: KMN_PATH, content: KMN, isBinary: false },
      { path: KPS_PATH, content: KPS, isBinary: false },
    ]);
    result.current!(fetched, ID);
    const projected = await projectWorkingCopyForOutput();
    const code = kpsNow();
    const dl = projected?.vfs.get(KPS_PATH)?.content;
    expect(withoutVersion(readVfsText(fetched, KPS_PATH)!)).toBe(withoutVersion(code));
    expect(withoutVersion(String(dl))).toBe(withoutVersion(code));
  });

  it("off Open it is not handled here (Copy keeps its identity path)", async () => {
    open("copy");
    expect(await commit([{ tag: "bkm" }])).toBe("off-open");
    expect(kpsNow()).toBe(KPS);
  });

  it("on Open with no readable .kps it is no-descriptor: nothing written, identity untouched", async () => {
    open();
    const vfs = createVirtualFS([
      { path: KMN_PATH, content: KMN, isBinary: false },
      { path: KPS_PATH, content: new Uint8Array([1, 2, 3]), isBinary: true },
    ]);
    useWorkingCopyStore.setState({ startVfs: vfs });
    expect(await commit([{ tag: "bkm" }])).toBe("no-descriptor");
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
    expect(tags()).toEqual(["bas", "bkm"]);
  });

  it("a failed apply is not-applied and leaves the file and identity as they were", async () => {
    open();
    const failed = () => Promise.resolve({ status: "failed" as const, reason: "no" });
    expect(await commitDescriptorOnOpen({ languages: [{ tag: "bkm" }] }, failed)).toBe("not-applied");
    expect(kpsNow()).toBe(KPS);
    expect(tags()).toEqual(["bas", "bkm"]);
  });

  it("removing the last language empties the block, follows into identity, and undoes", async () => {
    open();
    expect(await commit([])).toBe("written");
    expect(tags()).toEqual([]);
    expect(kpsNow()).not.toContain("<Language ");
    expect(undoLastOpenApply().ok).toBe(true);
    expect(kpsNow()).toBe(KPS);
  });

  it("a new language's markup characters are escaped in the file", async () => {
    open();
    await commit([{ tag: "bas" }, { tag: "bkm" }, { tag: "xx", name: "A&B <x>" }]);
    expect(kpsNow()).toContain("A&amp;B &lt;x&gt;");
  });

  it("seeds identity from the .kps when the working copy has none", async () => {
    open();
    useWorkingCopyStore.setState({ identity: null });
    await commit([{ tag: "bkm" }]);
    expect(tags()).toEqual(["bkm"]);
  });
});
