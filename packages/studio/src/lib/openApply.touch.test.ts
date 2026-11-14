// openApply "touch" kind (spec 111 phase 16, slice S1): a touch-layout edit is
// written into the file's own text, only the affected lines change, every route
// reads the same text, and one undo takes back both files of a two-file change.

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS, touchKeyAddress, type StartKeyboard } from "@keyboard-studio/contracts";
import {
  applyKeyEditsToRawJson,
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
import { patchTouchText } from "./openApply/touchText.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { findTouchLayoutPath } from "./findTouchLayoutPath.ts";
import { readVfsText } from "./vfsText.ts";
import { OPEN_SAMPLE_KEYBOARD_IDS, sampleKeyboardRelativePath } from "../test/openSampleKeyboards.ts";

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

async function openKeyboard(id: string): Promise<void> {
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
  resetStores();
  useWorkingCopyStore.getState().instantiateFromExisting(kb, { vfs, ir: parseKmn(readVfsText(vfs, `source/${id}.kmn`)!, id).ir });
}

const startVfs = () => useWorkingCopyStore.getState().startVfs!;
const touchPath = (): string | undefined => findTouchLayoutPath(startVfs());
const touchText = (): string => readVfsText(startVfs(), touchPath()!)!;

/** Lines of `a` that `b` lacks (multiset), line endings included. */
function missingLines(a: string, b: string): string[] {
  const pool = new Map<string, number>();
  for (const l of b.split(/(?<=\n)/)) pool.set(l, (pool.get(l) ?? 0) + 1);
  const out: string[] = [];
  for (const l of a.split(/(?<=\n)/)) {
    const n = pool.get(l) ?? 0;
    if (n > 0) pool.set(l, n - 1);
    else out.push(l);
  }
  return out;
}

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Pick {
  platform: string;
  layer: string;
  keyId: string;
}

function pickKey(layout: Raw): Pick | undefined {
  for (const [platform, p] of Object.entries<Raw>(layout)) {
    if (p === null || typeof p !== "object" || !Array.isArray(p.layer)) continue;
    const layer: Raw = p.layer.find((l: Raw) => l.id === "default") ?? p.layer[0];
    const ids: string[] = (layer?.row ?? []).flatMap((r: Raw) => (r.key ?? []).map((k: Raw) => k.id));
    for (const row of layer?.row ?? []) {
      for (const k of row.key ?? []) {
        if (typeof k.id === "string" && /^[KTU]_/.test(k.id) && typeof k.text === "string" && ids.filter((i) => i === k.id).length === 1) {
          return { platform, layer: layer.id, keyId: k.id };
        }
      }
    }
  }
  return undefined;
}

const corpusPresent = existsSync(RELEASE);
const table: Record<string, Record<string, string>> = {};

describe.skipIf(!corpusPresent)("touch kind over the corpus", () => {
  for (const id of OPEN_SAMPLE_KEYBOARD_IDS) {
    if (!existsSync(join(folderOf(id), "source", `${id}.keyman-touch-layout`))) continue;
    it(`${id}: key edit, key add, key removal, layer add`, async () => {
      await openKeyboard(id);
      const path = touchPath();
      if (path === undefined) return; // the loader brought no touch file
      const before0 = touchText();
      const pick = pickKey(JSON.parse(before0.replace(/^﻿/, "")));
      expect(pick, `${id}: a key to edit`).toBeDefined();
      const address = touchKeyAddress(pick!.platform, pick!.layer, pick!.keyId);
      const row: Record<string, string> = (table[id] = {});

      const ops: [string, KeyEditOperation][] = [
        ["set", { kind: "set", seq: 1, address, fields: { text: "ɛ" } }],
        ["add", { kind: "add", seq: 1, address, position: "after", key: { id: "K_ZZNEW", text: "z", sp: 0 } }],
        ["remove", { kind: "remove", seq: 1, address, outcome: "drop" }],
      ];
      for (const [name, op] of ops) {
        const before = touchText();
        const intended = JSON.parse(applyKeyEditsToRawJson(before.replace(/^﻿/, ""), [op]).json);
        let result = applyOpenChange({ kind: "touch", edit: { ops: [op] }, label: name });
        row[name] = result.status === "needs-consent" ? "consent" : "precise";
        if (result.status === "needs-consent") result = applyOpenChange({ kind: "touch", edit: { ops: [op] }, label: name }, { consentedReemit: true });
        expect(result.status, `${id} ${name}`).toBe("applied");
        const after = touchText();
        expect(JSON.parse(after.replace(/^﻿/, "")), `${id} ${name}: parses to the intended layout`).toEqual(intended);
        if (row[name] === "precise") {
          // One contiguous region changed: the rest is the file's own bytes.
          let pre = 0;
          while (pre < before.length && pre < after.length && before[pre] === after[pre]) pre++;
          let suf = 0;
          while (suf < before.length - pre && suf < after.length - pre && before[before.length - 1 - suf] === after[after.length - 1 - suf]) suf++;
          if (name === "remove") expect(after.length, `${id} remove: pure deletion`).toBe(pre + suf);
          if (name === "add") expect(before.length, `${id} add: pure insertion`).toBe(pre + suf);
          const touched = (name === "add" ? after : before).slice(pre, (name === "add" ? after : before).length - suf);
          expect(touched.split("\n").length, `${id} ${name}: lines touched`).toBeLessThanOrEqual(14);
          expect(missingLines(before, after).length, `${id} ${name}: before lines lost`).toBeLessThanOrEqual(14);
        }
        // The preview and the download read the same text as the working copy (SC-010).
        const s = useWorkingCopyStore.getState();
        const { result: hook, unmount } = renderHook(() => useWorkingCopyTransform({ previewedStartId: id }));
        const previewVfs = createVirtualFS(s.startVfs!.entries());
        hook.current!(previewVfs, id);
        const preview = readVfsText(previewVfs, path);
        unmount();
        const projected = await projectWorkingCopyForOutput();
        expect(preview, `${id} ${name}: preview`).toBe(after);
        expect(readVfsText(projected!.vfs, path), `${id} ${name}: download`).toBe(after);
        expect(s.ir?.touchLayout).toEqual(s.startIr?.touchLayout);
        // Undo restores the bytes.
        expect(undoLastOpenApply().ok).toBe(true);
        expect(touchText(), `${id} ${name}: undo`).toBe(before);
      }

      // A layer add (what desktop-to-touch propagation does): placed in the text.
      const layout = JSON.parse(before0.replace(/^﻿/, "")) as Raw;
      const layers: Raw[] = layout[pick!.platform].layer;
      layers.push({ ...JSON.parse(JSON.stringify(layers[0])), id: "zz_layer" });
      const patched = patchTouchText(before0, layout);
      row["layer"] = patched === undefined ? "consent" : "precise";
      if (patched !== undefined) {
        expect(JSON.parse(patched.replace(/^﻿/, ""))).toEqual(layout);
        const r = applyOpenChange({ kind: "files", files: { [path]: patched }, label: "layer" });
        expect(r.status).toBe("applied");
        expect(undoLastOpenApply().ok).toBe(true);
        expect(touchText()).toBe(before0);
      }
    }, 60_000);
  }

  it("writes the table when asked", () => {
    const out = process.env.TOUCH_TABLE_OUT;
    if (out !== undefined) writeFileSync(out, JSON.stringify(table, null, 1));
  });
});

// -- a two-file change ------------------------------------------------------------

describe("touch + .kmn rename in one change", () => {
  const ID = "tiny";
  const KB = { id: ID, path: `release/t/${ID}`, script: "Latn", targets: ["desktop"], displayName: "Tiny", version: "1.0", languages: ["en"] } as StartKeyboard;
  const kmn = ["store(&NAME) 'Tiny'", "begin Unicode > use(main)", "group(main) using keys", "+ [K_A] > 'a'", "+ [K_B] > 'b'", ""].join("\r\n");
  const touch = '{\r\n\t"phone": {\r\n\t\t"layer": [{"id":"default","row":[{"id":1,"key":[{"id":"K_A","text":"a"},{"id":"K_B","text":"b"}]}]}]\r\n\t}\r\n}\r\n';

  beforeEach(() => {
    resetStores();
    const vfs = createVirtualFS([
      { path: `source/${ID}.kmn`, content: kmn, isBinary: false },
      { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
      { path: `source/${ID}.keyman-touch-layout`, content: touch, isBinary: false },
    ]);
    useWorkingCopyStore.getState().instantiateFromExisting(KB, { vfs, ir: parseKmn(kmn, ID).ir });
  });

  it("lands both files in one undo record and one write; undo restores both", () => {
    const rename: KeyEditOperation = { kind: "rename", seq: 1, address: touchKeyAddress("phone", "default", "K_A"), toId: "K_Z" };
    const r = applyOpenChange({ kind: "touch", edit: { ops: [rename] }, renames: [rename], label: "rename" });
    expect(r.status).toBe("applied");
    const files = readVfsText(startVfs(), `source/${ID}.kmn`)!;
    expect(files).toContain("[K_Z]");
    expect(files).not.toContain("[K_A]");
    // The rename applier also writes the key's `sp`; every other byte is the file's.
    expect(touchText()).toBe(touch.replace('"K_A","text":"a"', '"K_Z","text":"a","sp":0'));
    const records = useOpenUndoStore.getState().records;
    expect(records).toHaveLength(1);
    expect(Object.keys(records[0]!.files).sort()).toEqual([`source/${ID}.keyman-touch-layout`, `source/${ID}.kmn`]);
    expect(records[0]!.view.kind).toBe("touch");
    expect(useWorkingCopyStore.getState().startIr!.touchLayout).toBeDefined();
    expect(undoLastOpenApply().ok).toBe(true);
    expect(readVfsText(startVfs(), `source/${ID}.kmn`)).toBe(kmn);
    expect(touchText()).toBe(touch);
    expect(JSON.stringify(useWorkingCopyStore.getState().startIr!.touchLayout)).toContain("K_A");
  });

  it("a touch-only change refreshes the IR's touch layout", () => {
    const set: KeyEditOperation = { kind: "set", seq: 1, address: touchKeyAddress("phone", "default", "K_B"), fields: { text: "ɛ" } };
    expect(applyOpenChange({ kind: "touch", edit: { ops: [set] }, label: "label" }).status).toBe("applied");
    const s = useWorkingCopyStore.getState();
    expect(JSON.stringify(s.startIr!.touchLayout)).toContain("ɛ");
    expect(JSON.stringify(s.ir!.touchLayout)).toContain("ɛ");
    expect(s.touchLayoutJson).toBe(touchText());
  });

  it("a removal edit takes the key out of the text", () => {
    const r = applyOpenChange({ kind: "touch", edit: { removeIds: ["phone:default:K_B"] }, label: "drop" });
    expect(r.status).toBe("applied");
    expect(touchText()).not.toContain('"K_B"');
  });

  it("an unreadable touch file fails with nothing written, never asks for consent", () => {
    const bad = '{"phone": {"layer": [';
    useWorkingCopyStore.getState().replaceStartingPointFiles({ [`source/${ID}.keyman-touch-layout`]: bad });
    const set: KeyEditOperation = { kind: "set", seq: 1, address: touchKeyAddress("phone", "default", "K_B"), fields: { text: "x" } };
    const r = applyOpenChange({ kind: "touch", edit: { ops: [set] }, label: "label" });
    expect(r.status).toBe("failed");
    expect(applyOpenChange({ kind: "touch", edit: { ops: [set] }, label: "label" }, { consentedReemit: true }).status).toBe("failed");
    expect(touchText()).toBe(bad);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });

  it("a rule inserted before a renamed key's rule does not make that rename look added", () => {
    const rename: KeyEditOperation = { kind: "rename", seq: 1, address: touchKeyAddress("phone", "default", "K_B"), toId: "K_Y" };
    const ir = useWorkingCopyStore.getState().startIr!;
    const nextIr = JSON.parse(JSON.stringify(ir)) as typeof ir;
    const group = nextIr.groups.find((g) => g.rules.length > 0)!;
    const extra = parseKmn(["begin Unicode > use(main)", "group(main) using keys", "+ [K_C] > 'c'", ""].join("\r\n"), ID).ir.groups.flatMap((g) => g.rules)[0]!;
    group.rules.splice(0, 0, { ...extra, nodeId: "new-rule" });
    const r = applyOpenChange({
      kind: "touch",
      edit: { ops: [rename] },
      renames: [rename],
      rules: { nextIr, writes: [["groups"]] },
      label: "rename with a new rule",
    });
    expect(r.status).toBe("applied");
    const text = readVfsText(startVfs(), `source/${ID}.kmn`)!;
    expect(text).toContain("[K_C]");
    expect(text).toContain("[K_Y]");
    expect(text).not.toContain("[K_B]");
  });
});
