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
import { groupRules } from "../components/rules/ruleFamilies.ts";
import { narrowOverBroadGuardOnOpen } from "../components/rules/narrowGuard.ts";
import { readVfsText } from "./vfsText.ts";
import { useOpenRemovalStore } from "../stores/openRemovalStore.ts";
import { clearOpenSession, useOpenUndoStore } from "../stores/openUndoStore.ts";
import { undoLastOpenApply } from "./openApply.ts";

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

const FILES = {
  welcome: "source/welcome/extra.htm",
  loose: "source/loose.txt",
};

function open(kmn: string = KMN): void {
  const vfs = createVirtualFS([
    { path: KMN_PATH, content: kmn, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
    { path: FILES.loose, content: "loose file", isBinary: false },
  ]);
  const kb = {
    id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"],
    displayName: "Tiny", version: "1.0", languages: ["en"],
  } as StartKeyboard;
  clearOpenSession();
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  wc.instantiateFromExisting(kb, { vfs, ir: parseKmn(kmn, ID).ir });
  wc.setAttribution({ authorName: "Parity", copyrightHolder: "Parity" });
  wc.setFallbackPolicy("pass-through");
}

/** The three routes' view of one file: code view (the working copy), preview projection, download. */
async function routes(path: string, original: string = KMN): Promise<{ code?: string; preview?: string; download?: string }> {
  const s = useWorkingCopyStore.getState();
  const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: ID }));
  // The preview starts from the FETCHED keyboard, as the artifact hook restores it before each re-apply.
  const fetched = createVirtualFS([
    { path: KMN_PATH, content: original, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
    { path: FILES.loose, content: "loose file", isBinary: false },
    { path: FILES.welcome, content: "fetched only", isBinary: false },
  ]);
  result.current!(fetched, ID);
  const projected = await projectWorkingCopyForOutput();
  const dl = projected?.vfs.get(path)?.content;
  return {
    ...(readVfsText(s.startVfs!, path) !== undefined ? { code: readVfsText(s.startVfs!, path)! } : {}),
    ...(readVfsText(fetched, path) !== undefined ? { preview: readVfsText(fetched, path)! } : {}),
    ...(typeof dl === "string" ? { download: dl } : {}),
  };
}

const ruleOf = (key: string) =>
  useWorkingCopyStore.getState().startIr!.groups.flatMap((g) => g.rules).find((r) => r.context.some((c) => c.kind === "vkey" && c.name === key))!;

describe("SC-010 and T082b: a file an applied change removes", () => {
  it("is gone from the preview and the download, and undo restores it in both", async () => {
    open();
    expect(
      applyOpenChange({ kind: "files", files: { [FILES.loose]: null }, label: "Remove a file" }).status,
    ).toBe("applied");
    expect(useOpenUndoStore.getState().removedPaths).toEqual([FILES.loose]);
    let r = await routes(FILES.loose);
    expect(r).toEqual({});
    // A fetched-only file the working copy never held stays in the preview.
    expect((await routes(FILES.welcome)).preview).toBe("fetched only");

    expect(undoLastOpenApply().ok).toBe(true);
    expect(useOpenUndoStore.getState().removedPaths).toEqual([]);
    r = await routes(FILES.loose);
    expect(r.code).toBe("loose file");
    expect(r.preview).toBe("loose file");
    expect(r.download).toBe("loose file");
  });
});

describe("SC-010: a code-view edit on Open reads the same on every route", () => {
  it("code view source, preview projection and download agree", async () => {
    open();
    const edited = KMN.replace("'c'", "'cc'");
    expect(applyOpenChange({ kind: "files", files: { [KMN_PATH]: edited }, label: "Edit" }).status).toBe("applied");
    const r = await routes(KMN_PATH);
    expect(r.code).toBe(edited);
    expect(withoutVersion(r.preview!)).toBe(withoutVersion(r.code!));
    expect(withoutVersion(r.download!)).toBe(withoutVersion(r.code!));
  });
});

describe("SC-010: a restore on Open reads the same on every route", () => {
  it("removing a rule and restoring it leaves code view, preview and download on the original text", async () => {
    open();
    expect(applyOpenChange({ kind: "remove", itemIds: [ruleOf("K_B").nodeId], chars: ["b"] }).status).toBe("applied");
    const entries = [...useOpenRemovalStore.getState().entries];
    expect(applyOpenChange({ kind: "reinsert", entries }).status).toBe("applied");
    const r = await routes(KMN_PATH);
    expect(r.code).toBe(KMN);
    expect(withoutVersion(r.preview!)).toBe(withoutVersion(KMN));
    expect(withoutVersion(r.download!)).toBe(withoutVersion(KMN));
  });
});

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

// Verification's throwaway checks, kept: the three routes after apply AND after undo.
const GUARDED = [
  "c hand-written",
  "store(&NAME) 'Tiny'",
  "store(&VERSION) '10.0'",
  "store(blk) 'x'",
  "",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "any(blk) + [RALT K_E] > context",
  "+ [K_B] > 'b'",
  "",
].join("\n");

async function expectThreeRoutes(expected: string): Promise<void> {
  const r = await routes(KMN_PATH, GUARDED);
  expect(r.code).toBe(expected);
  expect(withoutVersion(r.preview!)).toBe(withoutVersion(expected));
  expect(withoutVersion(r.download!)).toBe(withoutVersion(expected));
}

describe("SC-010: a family off and on, and a Narrow exception, on Open", () => {
  it("family off then on: working copy, preview and download agree after each step and after undo", async () => {
    open(GUARDED);
    const family = groupRules(useWorkingCopyStore.getState().startIr!.groups.flatMap((g) => g.rules))[0]!;
    expect(
      applyOpenChange({
        kind: "remove", itemIds: [], chars: [], disabledRuleIds: [...family.memberIds],
        family: { id: family.id, name: family.name, count: family.count },
      }).status,
    ).toBe("applied");
    const off = (await routes(KMN_PATH, GUARDED)).code!;
    expect(off).not.toBe(GUARDED);
    await expectThreeRoutes(off);

    const entries = [...useOpenRemovalStore.getState().entries];
    expect(applyOpenChange({ kind: "reinsert", entries }).status).toBe("applied");
    await expectThreeRoutes(GUARDED);

    expect(undoLastOpenApply().ok).toBe(true); // the restore is undone: off again
    await expectThreeRoutes(off);
    expect(undoLastOpenApply().ok).toBe(true);
    await expectThreeRoutes(GUARDED);
  });

  it("Narrow exception: the three routes agree after the apply and after undo", async () => {
    open(GUARDED);
    const guardRule = ruleOfNeedle("K_E");
    const outcome = await narrowOverBroadGuardOnOpen(
      { markKey: "K_E", markChar: "\u0301", blockedChar: "e", guardRuleId: guardRule.nodeId, question: "q" },
      async (c) => applyOpenChange(c),
    );
    expect(outcome).not.toBeNull();
    const narrowed = (await routes(KMN_PATH, GUARDED)).code!;
    expect(narrowed).toContain("e + [RALT K_E]");
    await expectThreeRoutes(narrowed);
    expect(undoLastOpenApply().ok).toBe(true);
    await expectThreeRoutes(GUARDED);
  });
});

function ruleOfNeedle(needle: string) {
  return useWorkingCopyStore.getState().startIr!.groups.flatMap((g) => g.rules).find((r) => JSON.stringify(r.context).includes(needle))!;
}
