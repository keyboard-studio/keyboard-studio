// Copy of a keyboard with no touch layout, touch built in the studio: the
// download's `.kmn` must name the layout (`&LAYOUTFILE`) and the `.kps` must
// list the compiled `.js`, or kmc silently drops the layout from the compiled
// keyboard (issue #2924). The Open path fixed the same gap in spec 111 T087b
// (`openApply/touchReseed.ts`, `withLayoutFileStore` / `withScriptFileEntry`);
// Copy was left unchanged there because that spec keeps Copy's output
// unchanged. This file is the Copy-side regression test for that gap.
//
// The harness mirrors `openApply.touchReseed.test.ts`'s `copyReseedText` — the
// repo's own "what a Copy session downloads" — with a keyboard that ships no
// touch layout (`bj_cree_woods`, TARGETS 'web desktop') instead of one that
// ships one. It deliberately uses no Open-only store, so the same file runs
// on main (where the Open path does not exist yet) as the reproduction.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import {
  compile,
  fetchKeyboardSourceToVfs,
  parseKmn,
  parseKps,
  type FetchFn,
} from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useWorkingCopyTransform } from "../hooks/useWorkingCopyTransform.ts";
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
  useDecisionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
}

async function load(id: string): Promise<{ kb: StartKeyboard; vfs: ReturnType<typeof createVirtualFS> }> {
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
  return { kb, vfs };
}

/** A Copy session of `id`, with the touch layout built exactly as the Touch gallery builds it. */
async function copySession(id: string, buildTouch: boolean): Promise<void> {
  const { kb, vfs } = await load(id);
  resetStores();
  const wc = useWorkingCopyStore.getState();
  const ir = parseKmn(readVfsText(vfs, `source/${id}.kmn`)!, id).ir;
  wc.instantiateFromStart(kb, { vfs, ir });
  if (buildTouch) {
    const built = buildTouchLayoutJson(ir, [], { mods: { removals: [], placements: [] }, seedSource: "reseed-from-desktop" });
    expect(built.json, "the touch layout must build").not.toBeNull();
    wc.setTouchLayoutJson(built.json);
  }
}

const layoutFileStore = (kmn: string): string[] =>
  kmn.split(/\r?\n/).filter((l) => /^[ \t]*store\s*\(\s*&LAYOUTFILE\s*\)/i.test(l));

const corpusPresent = existsSync(RELEASE);

// `bj_cree_woods` ships no touch layout and its `.kmn` names none; its
// TARGETS ('web desktop') emit a `.js`, so the package must list one.
const NO_TOUCH = "bj_cree_woods";
// `akan` ships a touch layout and already names it.
const HAS_TOUCH = "akan";

describe.skipIf(!corpusPresent)("Copy of a keyboard with no touch layout, touch built (#2924)", () => {
  beforeEach(async () => {
    await copySession(NO_TOUCH, true);
  });

  it("the projected .kmn names the built touch layout", async () => {
    const projected = await projectWorkingCopyForOutput();
    expect(projected).not.toBeNull();
    const vfs = projected!.vfs;
    const touchPath = findTouchLayoutPath(vfs);
    expect(touchPath).toBe(`source/${NO_TOUCH}.keyman-touch-layout`);
    const kmn = readVfsText(vfs, `source/${NO_TOUCH}.kmn`)!;
    expect(layoutFileStore(kmn)).toEqual([`store(&LAYOUTFILE) '${NO_TOUCH}.keyman-touch-layout'`]);
  });

  it("the projected .kps lists the compiled .js the layout compiles into", async () => {
    const projected = await projectWorkingCopyForOutput();
    expect(projected).not.toBeNull();
    const kps = readVfsText(projected!.vfs, `source/${NO_TOUCH}.kps`)!;
    // The base .kps lists .kmx and .kvk but no .js; the projection must add it.
    expect(kps).toContain(`..\\build\\${NO_TOUCH}.js</Name>`);
    expect(kps.match(/<Name>[^<]*\.js<\/Name>/gi)).toHaveLength(1);
  });

  it("names the renamed layout when the author picks a new keyboard id", async () => {
    useWorkingCopyStore.getState().setIdentity({ keyboardId: "cree_woods" });
    const projected = await projectWorkingCopyForOutput();
    expect(projected).not.toBeNull();
    expect(projected!.keyboardId).toBe("cree_woods");
    const vfs = projected!.vfs;
    expect(findTouchLayoutPath(vfs)).toBe("source/cree_woods.keyman-touch-layout");
    const kmn = readVfsText(vfs, "source/cree_woods.kmn")!;
    expect(layoutFileStore(kmn)).toEqual(["store(&LAYOUTFILE) 'cree_woods.keyman-touch-layout'"]);
    const kps = readVfsText(vfs, "source/cree_woods.kps")!;
    expect(kps).toContain("..\\build\\cree_woods.js</Name>");
  });

  it("the compiled .js carries the touch layout — and does not without the store", async () => {
    const projected = await projectWorkingCopyForOutput();
    expect(projected).not.toBeNull();
    const vfs = projected!.vfs;
    // Release build, as the download ships it.
    const withStore = await compile(vfs, NO_TOUCH, { saveDebug: false });
    expect(withStore.success, JSON.stringify(withStore.diagnostics?.slice(0, 5))).toBe(true);
    const js = withStore.artifacts.find((a) => a.filename.endsWith(".js"));
    expect(js, "a web-target keyboard compiles a .js").toBeDefined();
    const jsText = new TextDecoder().decode(js!.data);
    // kmc embeds the named touch layout as `this.KVKL={...}`.
    expect(jsText).toContain("this.KVKL={");
    // Control: the same VFS with the store line removed compiles a .js with
    // no layout block — the store is what makes kmc read the file.
    const kmn = readVfsText(vfs, `source/${NO_TOUCH}.kmn`)!;
    const noStoreVfs = createVirtualFS(vfs.entries());
    noStoreVfs.set(`source/${NO_TOUCH}.kmn`, kmn.replace(/^[ \t]*store\s*\(\s*&LAYOUTFILE\s*\)[^\r\n]*\r?\n/im, ""), false);
    const withoutStore = await compile(noStoreVfs, NO_TOUCH, { saveDebug: false });
    expect(withoutStore.success).toBe(true);
    const jsNoStore = withoutStore.artifacts.find((a) => a.filename.endsWith(".js"));
    expect(new TextDecoder().decode(jsNoStore!.data)).not.toContain("this.KVKL={");
  }, 120_000);

  it("preview and download agree on the .kmn store (the store is not download-only)", async () => {
    const s = useWorkingCopyStore.getState();
    const { result: hook, unmount } = renderHook(() => useWorkingCopyTransform({ previewedStartId: NO_TOUCH }));
    const previewVfs = createVirtualFS(s.startVfs!.entries());
    hook.current!(previewVfs, NO_TOUCH);
    const previewKmn = readVfsText(previewVfs, `source/${NO_TOUCH}.kmn`);
    unmount();
    const projected = await projectWorkingCopyForOutput();
    const downloadKmn = readVfsText(projected!.vfs, `source/${NO_TOUCH}.kmn`);
    // The two .kmn texts differ legitimately (the download bumps the release
    // version; the preview does not), so only the store lines must agree.
    expect(layoutFileStore(previewKmn!), "preview").toEqual(layoutFileStore(downloadKmn!));
    expect(layoutFileStore(downloadKmn!)).toHaveLength(1);
  });
});

describe.skipIf(!corpusPresent)("Copy of a keyboard that already has &LAYOUTFILE (#2924)", () => {
  it("is unchanged: still exactly one store, naming the same file", async () => {
    await copySession(HAS_TOUCH, false);
    const projected = await projectWorkingCopyForOutput();
    expect(projected).not.toBeNull();
    const kmn = readVfsText(projected!.vfs, `source/${HAS_TOUCH}.kmn`)!;
    expect(layoutFileStore(kmn)).toEqual([`store(&LAYOUTFILE) '${HAS_TOUCH}.keyman-touch-layout'`]);
    const kps = readVfsText(projected!.vfs, `source/${HAS_TOUCH}.kps`)!;
    expect(kps.match(/<Name>[^<]*\.js<\/Name>/gi)).toHaveLength(1);
  });

  it("stays unchanged when the touch layout is rebuilt, too", async () => {
    await copySession(HAS_TOUCH, true);
    const projected = await projectWorkingCopyForOutput();
    expect(projected).not.toBeNull();
    const kmn = readVfsText(projected!.vfs, `source/${HAS_TOUCH}.kmn`)!;
    expect(layoutFileStore(kmn)).toEqual([`store(&LAYOUTFILE) '${HAS_TOUCH}.keyman-touch-layout'`]);
  });
});

describe.skipIf(!corpusPresent)("Copy with no touch built (#2924)", () => {
  it("adds no store: the stub layout file the output always carries stays unnamed", async () => {
    await copySession(NO_TOUCH, false);
    const projected = await projectWorkingCopyForOutput();
    expect(projected).not.toBeNull();
    const vfs = projected!.vfs;
    // Step 5b stubs an empty layout file for every Track-1 download, even
    // when the author built none. Naming that stub would ship an empty touch
    // layout to mobile (today the unnamed file is ignored and KeymanWeb falls
    // back to the desktop layout), so the store is added only for a layout
    // the author built — never for the stub.
    const touchPath = findTouchLayoutPath(vfs);
    expect(touchPath).toBe(`source/${NO_TOUCH}.keyman-touch-layout`);
    expect(countTouchKeys(readVfsText(vfs, touchPath!)!)).toBe(0);
    const kmn = readVfsText(vfs, `source/${NO_TOUCH}.kmn`)!;
    expect(layoutFileStore(kmn)).toEqual([]);
  });
});

/** The number of keys in a `.keyman-touch-layout` text (0 for the empty stub). */
function countTouchKeys(text: string): number {
  let keys = 0;
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (k === "key" && Array.isArray(v)) keys += v.length;
        else walk(v);
      }
    }
  };
  walk(JSON.parse(text) as unknown);
  return keys;
}
