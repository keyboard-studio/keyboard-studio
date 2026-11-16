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
import { commitDescriptorOnOpen } from "./descriptorOpenCommit.ts";
import { commitStylesheetOnOpen } from "./cssOpenCommit.ts";
import { commitDocPagesThroughSeam } from "./docsOpenCommit.ts";
import { applyDocRegeneration } from "./docRegenerationFix.ts";
import { useDocRegenerationFixes } from "../hooks/useDocRegenerationFixes.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
  getPatternByIdSync: () => undefined,
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

// -- SC-010 / SC-013 with a touch file (phase 16, S4) ---------------------------------

const TOUCH_PATH = `source/${ID}.keyman-touch-layout`;
const TOUCH = '{\r\n\t"phone": {\r\n\t\t"layer": [{"id":"default","row":[{"id":1,"key":[{"id":"K_A","text":"a"},{"id":"K_B","text":"b"},{"id":"K_C","text":"c"}]}]}]\r\n\t}\r\n}\r\n';

function openWithTouch(withTouch: boolean): void {
  const files = [
    { path: KMN_PATH, content: KMN, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
    ...(withTouch ? [{ path: TOUCH_PATH, content: TOUCH, isBinary: false }] : []),
  ];
  const kb = {
    id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"],
    displayName: "Tiny", version: "1.0", languages: ["en"],
  } as StartKeyboard;
  clearOpenSession();
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  wc.instantiateFromExisting(kb, { vfs: createVirtualFS(files), ir: parseKmn(KMN, ID).ir });
  wc.setAttribution({ authorName: "Parity", copyrightHolder: "Parity" });
  wc.setFallbackPolicy("pass-through");
}

describe("SC-010 and SC-013: output on Open with a touch file", () => {
  it("after a key edit, a placement, a delete and a desktop edit the output is the working copy's files apart from version and HISTORY", async () => {
    openWithTouch(true);
    const set = { kind: "set", seq: 1, address: "phone:default:K_A", fields: { text: "ä" } } as const;
    const add = { kind: "add", seq: 1, address: "phone:default:K_B", position: "after", key: { id: "K_ZZNEW", text: "z", sp: 0 } } as const;
    expect(applyOpenChange({ kind: "touch", edit: { ops: [set] }, label: "edit" }).status).toBe("applied");
    expect(applyOpenChange({ kind: "touch", edit: { ops: [add] }, label: "place" }).status).toBe("applied");
    expect(applyOpenChange({ kind: "touch", edit: { removeIds: ["phone:default:K_C"] }, label: "drop" }).status).toBe("applied");
    expect(applyOpenChange({ kind: "remove", itemIds: [ruleOf("K_B").nodeId], chars: ["b"] }).status).toBe("applied");
    // Records the touch editor keeps are never replayed over the files.
    useWorkingCopyStore.setState((s) => ({ keyEditOverlay: { ops: [...s.keyEditOverlay.ops, { ...set, seq: 9 }] } }));

    const wc = useWorkingCopyStore.getState();
    const projected = await projectWorkingCopyForOutput();
    expect(projected).not.toBeNull();
    const touchNow = readVfsText(wc.startVfs!, TOUCH_PATH)!;
    expect(touchNow).toContain("ä");
    expect(touchNow).toContain("K_ZZNEW");
    expect(touchNow).not.toContain('"K_C"');
    for (const entry of wc.startVfs!.entries()) {
      const out = projected!.vfs.get(entry.path)?.content;
      if (entry.path === KMN_PATH) {
        expect(withoutVersion(out as string), entry.path).toBe(withoutVersion(entry.content as string));
      } else if (/HISTORY/i.test(entry.path) || entry.path.endsWith(".kps")) {
        continue;
      } else {
        expect(out, entry.path).toBe(entry.content);
      }
    }
  });

  it("an opened keyboard with no touch file and no generation downloads without one; nothing is held (T087b)", async () => {
    openWithTouch(false);
    const projected = await projectWorkingCopyForOutput();
    expect(projected).not.toBeNull();
    expect(projected!.vfs.get(TOUCH_PATH)).toBeUndefined();
    expect(projected!.vfs.list().some((p) => p.endsWith(".keyman-touch-layout"))).toBe(false);
  });

  it("a layout the store holds is never built into a keyboard that has no touch file (the interim path is gone)", async () => {
    openWithTouch(false);
    useWorkingCopyStore.getState().setTouchLayoutJson('{"phone":{"layer":[{"id":"default","row":[{"id":1,"key":[{"id":"K_A","text":"a"}]}]}]}}');
    const projected = await projectWorkingCopyForOutput();
    expect(projected!.vfs.get(TOUCH_PATH)).toBeUndefined();
  });

  it("a touch layout the store holds is ignored when the keyboard has a touch file", async () => {
    openWithTouch(true);
    useWorkingCopyStore.getState().setTouchLayoutJson('{"phone":{"layer":[]}}');
    const projected = await projectWorkingCopyForOutput();
    expect(projected!.vfs.get(TOUCH_PATH)?.content).toBe(TOUCH);
  });
});

// -- SC-010 for the descriptor, stylesheet and documentation files in one session (phase 17, T092) --

describe("SC-010: a mixed session of live-file edits on Open reads the same on every route", () => {
  const GEN_S = "<!-- ks:generated:start -->";
  const GEN_E = "<!-- ks:generated:end -->";
  const KPS_PATH = `source/${ID}.kps`;
  const CSS_PATH = `source/${ID}.css`;
  const HELP = `source/help/${ID}.php`;
  const HELP_ORIGINAL = `<?php $pagename = 'tiny'; ?>\n<p>Mine.</p>\n${GEN_S}\nstale\n${GEN_E}\n`;
  const KPS = [
    "<Package>\r\n",
    "  <Info>\r\n    <Name URL=\"\">Tiny</Name>\r\n  </Info>\r\n",
    "  <Keyboards>\r\n    <Keyboard>\r\n      <Name>Tiny</Name>\r\n      <Version>1.0</Version>\r\n",
    "      <Languages>\r\n        <Language ID=\"bas\">Basaa</Language>\r\n        <Language ID=\"bkm\">Kom</Language>\r\n      </Languages>\r\n",
    "    </Keyboard>\r\n  </Keyboards>\r\n</Package>\r\n",
  ].join("");
  const kpsNoVersion = (s: string): string => s.replace(/<Version[^>]*>[^<]*<\/Version>/g, "<Version/>");
  const host = (c: Parameters<typeof applyOpenChange>[0]) => Promise.resolve(applyOpenChange(c));

  it("code view, preview and download agree on the .kps, .css, .kmn and the page", async () => {
    const original = [
      { path: KMN_PATH, content: KMN, isBinary: false },
      { path: KPS_PATH, content: KPS, isBinary: false },
      { path: HELP, content: HELP_ORIGINAL, isBinary: false },
    ];
    const kb = {
      id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"],
      displayName: "Tiny", version: "1.0", languages: ["bas"],
    } as StartKeyboard;
    clearOpenSession();
    const wc = useWorkingCopyStore.getState();
    wc.reset();
    wc.instantiateFromExisting(kb, { vfs: createVirtualFS(original), ir: parseKmn(KMN, ID).ir });
    wc.setAttribution({ authorName: "Parity", copyrightHolder: "Parity" });
    wc.setFallbackPolicy("pass-through");
    wc.setStartHelpPhpText(HELP_ORIGINAL);

    expect(await commitDescriptorOnOpen({ languages: [{ tag: "bkm" }, { tag: "bas" }] }, host)).toBe("written");
    expect(await commitStylesheetOnOpen(".kmw-key { color: red; }", host)).toBe("written");
    const s = useWorkingCopyStore.getState();
    const edited = HELP_ORIGINAL.replace("Mine.", "Mine, edited.");
    expect(commitDocPagesThroughSeam({ edits: { "help-php": edited }, keyboardId: ID, startVfs: s.startVfs, convention: s.startWelcomeConvention }).written).toEqual(["help-php"]);
    const fix = renderHook(() => useDocRegenerationFixes()).result.current.find((f) => f.id.startsWith("docs:regenerate:help-php:"));
    expect(fix).toBeDefined();
    expect(await applyDocRegeneration(fix!, host)).toBe(true);
    expect(useOpenUndoStore.getState().records).toHaveLength(4);

    const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: ID }));
    const fetched = createVirtualFS(original);
    result.current!(fetched, ID);
    const projected = await projectWorkingCopyForOutput();
    expect(projected).not.toBeNull();

    const code = useWorkingCopyStore.getState().startVfs!;
    const norm = (p: string, t: string): string => (p === KMN_PATH ? withoutVersion(t) : p === KPS_PATH ? kpsNoVersion(t) : t);
    for (const path of [KPS_PATH, CSS_PATH, KMN_PATH, HELP]) {
      const c = readVfsText(code, path);
      expect(c, `${path} code view`).toBeDefined();
      expect(norm(path, readVfsText(fetched, path)!), `${path} preview`).toBe(norm(path, c!));
      expect(norm(path, projected!.vfs.get(path)?.content as string), `${path} download`).toBe(norm(path, c!));
    }
    // The edits really landed.
    expect(readVfsText(code, KPS_PATH)!.indexOf('ID="bkm"')).toBeLessThan(readVfsText(code, KPS_PATH)!.indexOf('ID="bas"'));
    expect(readVfsText(code, CSS_PATH)).toBe(".kmw-key { color: red; }");
    expect(readVfsText(code, HELP)).toContain("Mine, edited.");
    expect(readVfsText(code, HELP)).not.toContain("stale");
  });
});
