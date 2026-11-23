// "Reseed touch from desktop" and touch generation on Open (spec 111 phase 16,
// T087b; owner rulings 2026-11-14). One `files` change, asked first (FR-009),
// undoable (FR-045), the layout Copy builds; the same change creates the file when
// the keyboard has none (FR-017). No timers.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS, touchKeyAddress, type StartKeyboard } from "@keyboard-studio/contracts";
import {
  conformTouchLayoutToKeymanSchema,
  fetchKeyboardSourceToVfs,
  parseKmn,
  parseKps,
  type FetchFn,
  type KeyEditOperation,
} from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useOpenUndoStore } from "../stores/openUndoStore.ts";
import { useOpenRemovalStore } from "../stores/openRemovalStore.ts";
import { useOpenAssignStore } from "../stores/openAssignStore.ts";
import { useWorkingCopyTransform } from "../hooks/useWorkingCopyTransform.ts";
import { applyOpenChange, undoLastOpenApply } from "./openApply.ts";
import { buildTouchReseedChange, summarizeTouchReplacement } from "./openApply/touchReseed.ts";
import { buildTouchLayoutJson } from "./buildTouchLayoutJson.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { findTouchLayoutPath } from "./findTouchLayoutPath.ts";
import { readVfsText } from "./vfsText.ts";
import { sampleKeyboardRelativePath } from "../test/openSampleKeyboards.ts";

vi.mock("./services.ts", async () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
  getPatternByIdSync: () => undefined,
}));

const HERE = dirname(fileURLToPath(import.meta.url));
const KEYBOARDS_ROOT = resolve(HERE, "../../../../../keyboards");
const RELEASE = join(KEYBOARDS_ROOT, "release");
const PROXY = "http://corpus.invalid";
const folderOf = (id: string): string => join(RELEASE, sampleKeyboardRelativePath(id));

const corpusFetch: FetchFn = async (url) => {
  const file = join(KEYBOARDS_ROOT, url.slice(PROXY.length + 1));
  if (!existsSync(file) || !statSync(file).isFile()) {
    return { ok: false, status: 404, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
  }
  const bytes = readFileSync(file);
  return {
    ok: true,
    status: 200,
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
};

function resetStores(): void {
  useOpenRemovalStore.getState().clear();
  useOpenUndoStore.getState().clear();
  useOpenAssignStore.getState().clear();
  useDecisionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
}

async function load(id: string, dropTouch: boolean): Promise<{ kb: StartKeyboard; vfs: ReturnType<typeof createVirtualFS> }> {
  const meta = parseKps(readFileSync(join(folderOf(id), "source", `${id}.kps`), "utf8"));
  const kb: StartKeyboard = {
    id,
    path: `release/${sampleKeyboardRelativePath(id)}`,
    script: meta.script,
    targets: meta.targets,
    displayName: meta.displayName,
    version: meta.version,
    languages: meta.languages,
  };
  const vfs = createVirtualFS();
  await fetchKeyboardSourceToVfs(kb, vfs, { proxyBase: PROXY, fetchImpl: corpusFetch, keepKps: true });
  if (dropTouch) {
    const p = findTouchLayoutPath(vfs);
    if (p !== undefined) vfs.delete(p);
  }
  return { kb, vfs };
}

async function openKeyboard(id: string, dropTouch = false): Promise<void> {
  const { kb, vfs } = await load(id, dropTouch);
  resetStores();
  useWorkingCopyStore.getState().instantiateFromExisting(kb, { vfs, ir: parseKmn(readVfsText(vfs, `source/${id}.kmn`)!, id).ir });
}

const startVfs = () => useWorkingCopyStore.getState().startVfs!;
const touchPath = (): string | undefined => findTouchLayoutPath(startVfs());
const bare = (s: string): string => s.replace(/^﻿/, "");

/** The touch file a Copy session of the same keyboard downloads when it reseeds from the desktop. */
async function copyReseedText(id: string): Promise<string> {
  const { kb, vfs } = await load(id, false);
  resetStores();
  const wc = useWorkingCopyStore.getState();
  const ir = parseKmn(readVfsText(vfs, `source/${id}.kmn`)!, id).ir;
  wc.instantiateFromStart(kb, { vfs, ir });
  const built = buildTouchLayoutJson(ir, [], { mods: { removals: [], placements: [] }, seedSource: "reseed-from-desktop" });
  wc.setTouchLayoutJson(built.json);
  const projected = await projectWorkingCopyForOutput();
  return readVfsText(projected!.vfs, `source/${id}.keyman-touch-layout`)!;
}
const copyReseedLayout = async (id: string): Promise<unknown> => JSON.parse(bare(await copyReseedText(id)));

async function routesAgree(path: string, expected: string | undefined, id: string): Promise<void> {
  const s = useWorkingCopyStore.getState();
  const { result: hook, unmount } = renderHook(() => useWorkingCopyTransform({ previewedStartId: id }));
  const previewVfs = createVirtualFS(s.startVfs!.entries());
  hook.current!(previewVfs, id);
  const preview = readVfsText(previewVfs, path);
  unmount();
  const projected = await projectWorkingCopyForOutput();
  const download = projected!.vfs.get(path) === undefined ? undefined : readVfsText(projected!.vfs, path);
  expect(preview, "preview").toBe(expected);
  expect(download, "download").toBe(expected);
}

describe("touch reseed summary", () => {
  it("counts keys and names the layers added and removed", () => {
    const before = JSON.stringify({ phone: { layer: [{ id: "default", row: [{ key: [{ id: "K_A" }, { id: "K_B" }] }] }, { id: "old", row: [] }] } });
    const after = JSON.stringify({ phone: { layer: [{ id: "default", row: [{ key: [{ id: "K_A" }] }] }, { id: "symbols", row: [{ key: [{ id: "K_1" }, { id: "K_2" }] }] }] } });
    expect(summarizeTouchReplacement("source/x.keyman-touch-layout", before, after)).toMatchObject({
      path: "source/x.keyman-touch-layout",
      creating: false,
      layersAdded: ["symbols"],
      layersRemoved: ["old"],
      keysBefore: 2,
      keysAfter: 3,
    });
    expect(summarizeTouchReplacement("p", undefined, after)).toMatchObject({ creating: true, keysBefore: 0, keysAfter: 3 });
  });
});

const corpusPresent = existsSync(RELEASE);

describe.skipIf(!corpusPresent)("reseed on an opened keyboard that has a touch file", () => {
  for (const id of ["akan", "bambara"]) {
    describe(id, () => {
      beforeEach(async () => {
        await openKeyboard(id);
      });

      it("asks first, naming the file; nothing is written until the author agrees", () => {
        const before = startVfs();
        const built = buildTouchReseedChange("reseed");
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        const asked = applyOpenChange(built.change);
        expect(asked.status).toBe("needs-consent");
        if (asked.status !== "needs-consent") return;
        expect(asked.files).toContain(touchPath());
        expect(asked.touchReplacement).toMatchObject({ path: touchPath(), creating: false });
        expect(asked.touchReplacement!.keysBefore).toBeGreaterThan(0);
        expect(asked.touchReplacement!.keysAfter).toBeGreaterThan(0);
        expect(startVfs()).toBe(before);
        expect(useOpenUndoStore.getState().records).toEqual([]);
      });

      it("on agreement replaces the file with the layout Copy builds, as one undoable change; working copy, preview and download agree", async () => {
        const copyText = await copyReseedText(id);
        const copy = JSON.parse(bare(copyText));
        await openKeyboard(id);
        const path = touchPath()!;
        const original = readVfsText(startVfs(), path)!;
        const built = buildTouchReseedChange("reseed");
        if (!built.ok) throw new Error(built.reason);
        const done = applyOpenChange(built.change, { consentedReemit: true });
        expect(done.status).toBe("applied");
        const now = readVfsText(startVfs(), path)!;
        expect(now).not.toBe(original);
        // The same layout a Copy session of this keyboard builds (a symbols layer, working Caps).
        expect(JSON.parse(bare(now))).toEqual(copy);
        // One builder: the bytes are the Copy download's, not just the same layout.
        expect(now).toBe(copyText);
        expect(useOpenUndoStore.getState().records).toHaveLength(1);
        await routesAgree(path, now, id);
        // Undo restores the bytes, and only that one record is taken.
        expect(undoLastOpenApply().ok).toBe(true);
        expect(readVfsText(startVfs(), path)).toBe(original);
        expect(useOpenUndoStore.getState().records).toHaveLength(0);
      }, 60_000);

      it("writes the schema-conformant, tabulated text the download carries (no studio-only members)", () => {
        const built = buildTouchReseedChange("reseed");
        if (!built.ok) throw new Error(built.reason);
        const text = built.change.files[touchPath()!]!;
        expect(text).toContain("\n");
        expect(text).not.toMatch(/"output"\s*:/);
        expect(text).not.toMatch(/"p"\s*:/);
        expect(conformTouchLayoutToKeymanSchema(text).removed).toEqual([]);
      });
    });
  }
});

describe.skipIf(!corpusPresent)("generation on an opened keyboard with no touch file", () => {
  const ID = "basic_kbdus";
  const NEW_PATH = `source/${ID}.keyman-touch-layout`;

  beforeEach(async () => {
    await openKeyboard(ID, true);
  });

  it("starts with no touch file", () => {
    expect(touchPath()).toBeUndefined();
  });

  it("with no generation, the download has no touch file and nothing is held", async () => {
    const projected = await projectWorkingCopyForOutput();
    expect(projected!.vfs.list().some((p) => p.endsWith(".keyman-touch-layout"))).toBe(false);
    expect(useWorkingCopyStore.getState().touchLayoutJson).toBeNull();
    expect(useOpenUndoStore.getState().records).toEqual([]);
  });

  it("asks first with a creating summary; on agreement creates the file as one undoable change; undo removes it", async () => {
    const copy = await copyReseedLayout(ID);
    await openKeyboard(ID, true);
    const built = buildTouchReseedChange("create");
    if (!built.ok) throw new Error(built.reason);
    const asked = applyOpenChange(built.change);
    expect(asked).toMatchObject({ status: "needs-consent", touchReplacement: { creating: true, keysBefore: 0 } });
    expect((asked as { files: string[] }).files).toContain(NEW_PATH);
    expect(touchPath()).toBeUndefined();

    expect(applyOpenChange(built.change, { consentedReemit: true }).status).toBe("applied");
    expect(touchPath()).toBe(NEW_PATH);
    const created = readVfsText(startVfs(), NEW_PATH)!;
    expect(JSON.parse(bare(created))).toEqual(copy);
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    await routesAgree(NEW_PATH, created, ID);

    expect(undoLastOpenApply().ok).toBe(true);
    expect(touchPath()).toBeUndefined();
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  }, 60_000);

  it("afterwards it is an ordinary keyboard with a touch file: a key edit writes the file precisely", () => {
    const built = buildTouchReseedChange("create");
    if (!built.ok) throw new Error(built.reason);
    applyOpenChange(built.change, { consentedReemit: true });
    const before = readVfsText(startVfs(), NEW_PATH)!;
    const layout = JSON.parse(bare(before)) as Record<string, { layer?: { id: string; row: { key: { id: string; text?: string }[] }[] }[] }>;
    const platform = Object.keys(layout).find((p) => layout[p]?.layer !== undefined)!;
    const layer = layout[platform]!.layer![0]!;
    const key = layer.row.flatMap((r) => r.key).find((k) => typeof k.text === "string" && /^[KTU]_/.test(k.id))!;
    const op: KeyEditOperation = {
      kind: "set",
      seq: 1,
      address: touchKeyAddress(platform, layer.id, key.id),
      fields: { text: "ɛ" },
    };
    const result = applyOpenChange({ kind: "touch", edit: { ops: [op] }, label: "edit" });
    expect(result.status).toBe("applied");
    const after = readVfsText(startVfs(), NEW_PATH)!;
    expect(after).not.toBe(before);
    // Only the edited key's lines change: the rest is the file's own text.
    const pool = new Map<string, number>();
    for (const l of after.split("\n")) pool.set(l, (pool.get(l) ?? 0) + 1);
    let lost = 0;
    for (const l of before.split("\n")) {
      const n = pool.get(l) ?? 0;
      if (n > 0) pool.set(l, n - 1);
      else lost += 1;
    }
    expect(lost).toBeLessThanOrEqual(3);
    expect(useOpenUndoStore.getState().records).toHaveLength(2);
  });
});


// -- the .kmn and .kps lines that make a created layout compile and ship ------------------

const SID = "tiny";
const SKMN = (extra: string): string =>
  ["store(&VERSION) '10.0'", "store(&NAME) 'Tiny'", "store(&TARGETS) 'any'", ...(extra === "" ? [] : [extra]), "begin Unicode > use(main)", "group(main) using keys", "+ [K_A] > 'a'", ""].join("\r\n");
const SKPS = (withJs: boolean): string =>
  [
    "<Package>",
    "  <Files>",
    "    <File>",
    `      <Name>..\\build\\${SID}.kmx</Name>`,
    "      <FileType>.kmx</FileType>",
    "    </File>",
    ...(withJs ? ["    <File>", `      <Name>..\\build\\${SID}.js</Name>`, "      <FileType>.js</FileType>", "    </File>"] : []),
    "    <File>",
    "      <Name>readme.htm</Name>",
    "      <FileType>.htm</FileType>",
    "    </File>",
    "  </Files>",
    "</Package>",
    "",
  ].join("\r\n");
const LAYOUT = `source/${SID}.keyman-touch-layout`;
const KB: StartKeyboard = { id: SID, path: "release/t/tiny", script: "Latn", targets: ["any"], displayName: "Tiny", version: "1.0", languages: ["en"] };

function openSynthetic(kmn: string, kps: string, touch?: string): void {
  resetStores();
  const files = [
    { path: `source/${SID}.kmn`, content: kmn, isBinary: false },
    { path: `source/${SID}.kps`, content: kps, isBinary: false },
    ...(touch === undefined ? [] : [{ path: LAYOUT, content: touch, isBinary: false }]),
  ];
  useWorkingCopyStore.getState().instantiateFromExisting(KB, { vfs: createVirtualFS(files), ir: parseKmn(kmn, SID).ir });
}
const text = (p: string): string | undefined => {
  const v = startVfs();
  return v.get(p) === undefined ? undefined : readVfsText(v, p);
};

describe("Create writes the .kmn store and the .kps entry with the layout, as one change", () => {
  it("adds &LAYOUTFILE after the last header store and the compiled .js to the package; only those lines are new; undo is byte-identical", () => {
    const kmn = SKMN("");
    const kps = SKPS(false);
    openSynthetic(kmn, kps);
    const built = buildTouchReseedChange("create");
    if (!built.ok) throw new Error(built.reason);
    expect(Object.keys(built.change.files).sort()).toEqual([LAYOUT, `source/${SID}.kmn`, `source/${SID}.kps`].sort());
    expect(applyOpenChange(built.change)).toMatchObject({ status: "needs-consent", touchReplacement: { alsoWrites: [`source/${SID}.kmn`, `source/${SID}.kps`] } });
    expect(applyOpenChange(built.change, { consentedReemit: true }).status).toBe("applied");
    const kmnNow = text(`source/${SID}.kmn`)!;
    const kpsNow = text(`source/${SID}.kps`)!;
    expect(kmnNow.replace(`store(&LAYOUTFILE) '${SID}.keyman-touch-layout'\r\n`, "")).toBe(kmn);
    expect(kmnNow).toContain(`store(&TARGETS) 'any'\r\nstore(&LAYOUTFILE) '${SID}.keyman-touch-layout'\r\n`);
    expect(kpsNow).toContain(`${SID}.js</Name>`);
    expect(kpsNow.replace(/    <File>\r\n      <Name>[^<]*\.js<\/Name>[\s\S]*?<\/File>\r\n/, "")).toBe(kps);
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    // Idempotent: asking again changes nothing in the .kmn or .kps.
    const again = buildTouchReseedChange("again");
    if (!again.ok) throw new Error(again.reason);
    expect(Object.keys(again.change.files)).toEqual([LAYOUT]);
    expect(undoLastOpenApply().ok).toBe(true);
    expect(text(`source/${SID}.kmn`)).toBe(kmn);
    expect(text(`source/${SID}.kps`)).toBe(kps);
    expect(text(LAYOUT)).toBeUndefined();
  });

  it("a keyboard that already names the layout and lists the .js changes only the touch file", () => {
    const kmn = SKMN(`store(&LAYOUTFILE) '${SID}.keyman-touch-layout'`);
    openSynthetic(kmn, SKPS(true));
    const built = buildTouchReseedChange("create");
    if (!built.ok) throw new Error(built.reason);
    expect(Object.keys(built.change.files)).toEqual([LAYOUT]);
    expect(built.change.askFirst!.alsoWrites).toEqual([]);
  });

  it("recognises an existing &LAYOUTFILE store whatever its case or spacing", () => {
    openSynthetic(SKMN("store( &layoutfile ) 'other.keyman-touch-layout'"), SKPS(true));
    const built = buildTouchReseedChange("create");
    if (!built.ok) throw new Error(built.reason);
    expect(Object.keys(built.change.files)).toEqual([LAYOUT]);
  });

  it("adds no .js entry for a desktop-only keyboard", () => {
    openSynthetic(SKMN("").replace("'any'", "'windows'"), SKPS(false));
    const built = buildTouchReseedChange("create");
    if (!built.ok) throw new Error(built.reason);
    expect(Object.keys(built.change.files).sort()).toEqual([LAYOUT, `source/${SID}.kmn`].sort());
  });
});

describe("the replacement summary", () => {
  const LAYOUT_TEXT = JSON.stringify({ phone: { layer: [{ id: "default", row: [{ key: [{ id: "K_A" }, { id: "T_0301" }, { id: "T_0302", sk: [{ id: "T_0303" }] }] }] }] } });
  const NEW_TEXT = JSON.stringify({ phone: { layer: [{ id: "default", row: [{ key: [{ id: "K_A" }, { id: "T_0302" }] }] }] } });

  it("counts rules and drafts that use a touch key the new layout lacks", () => {
    const kmn = ["store(&NAME) 'Tiny'", "begin Unicode > use(main)", "group(main) using keys", "+ [K_A] > 'a'", "+ [T_0301] > 'x'", "+ [T_0303] > 'y'", "+ [T_0302] > 'z'", ""].join("\r\n");
    const ir = parseKmn(kmn, SID).ir;
    const draft: [string, never][] = [
      ["x", { target: "x", mechanisms: [{ slotValues: { hostKey: "T_0301" } }] } as never],
      ["y", { target: "y", mechanisms: [{ slotValues: { hostKey: "K_A" } }] } as never],
    ];
    const s = summarizeTouchReplacement("p", LAYOUT_TEXT, NEW_TEXT, { ir, draft });
    expect(s).toMatchObject({ orphanedRules: 2, orphanedDrafts: 1, unreadable: false });
    // Creating has no old keys to lose.
    expect(summarizeTouchReplacement("p", undefined, NEW_TEXT, { ir, draft })).toMatchObject({ orphanedRules: 0, orphanedDrafts: 0 });
  });

  it("an unreadable existing file is flagged, not counted as 0 keys; a built file that does not parse is flagged too", () => {
    expect(summarizeTouchReplacement("p", '{"phone": {"layer": [', NEW_TEXT)).toMatchObject({ unreadable: true, orphanedRules: 0 });
    expect(summarizeTouchReplacement("p", LAYOUT_TEXT, "not json")).toMatchObject({ unreadable: true });
    expect(summarizeTouchReplacement("p", undefined, NEW_TEXT).unreadable).toBe(false);
  });
});
