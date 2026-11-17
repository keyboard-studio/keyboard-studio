// touchOpenCommit (spec 111 phase 16, slice S2a): key-grid / builder / family /
// bulk edits on a keyboard opened for update are written into the touch file, one
// change and one undo record per author action; the overlay is only a record.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS, touchKeyAddress, type StartKeyboard } from "@keyboard-studio/contracts";
import { fetchKeyboardSourceToVfs, parseKmn, parseKps, type FetchFn } from "@keyboard-studio/engine";
import { useWorkingCopyStore, type PendingKeyEditOperation } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { useOpenUndoStore } from "../../stores/openUndoStore.ts";
import { useOpenRemovalStore } from "../../stores/openRemovalStore.ts";
import { useOpenAssignStore } from "../../stores/openAssignStore.ts";
import { useWorkingCopyTransform } from "../../hooks/useWorkingCopyTransform.ts";
import { applyOpenChange, undoLastOpenApply } from "../../lib/openApply.ts";
import { setOpenApplyNotifier } from "../../lib/openApplyNotifier.ts";
import { projectWorkingCopyForOutput } from "../../lib/serializeWorkingCopy.ts";
import { findTouchLayoutPath } from "../../lib/findTouchLayoutPath.ts";
import { readVfsText } from "../../lib/vfsText.ts";
import { sampleKeyboardRelativePath } from "../../test/openSampleKeyboards.ts";
import { commitTouchOpOnOpen, groupTouchCommitsOnOpen, installRulesOnOpen } from "./touchOpenCommit.ts";
import { emitKmn } from "@keyboard-studio/engine";

vi.mock("../../lib/services.ts", async () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
  getPatternByIdSync: () => undefined,
}));

const ID = "tiny";
const KB = { id: ID, path: `release/t/${ID}`, script: "Latn", targets: ["desktop"], displayName: "Tiny", version: "1.0", languages: ["en"] } as StartKeyboard;
const KMN = ["store(&NAME) 'Tiny'", "begin Unicode > use(main)", "group(main) using keys", "+ [K_A] > 'a'", "+ [K_B] > 'b'", ""].join("\r\n");
const TOUCH =
  '{\r\n\t"phone": {\r\n\t\t"layer": [{"id":"default","row":[{"id":1,"key":[\r\n' +
  '{"id":"K_A","text":"a"},\r\n{"id":"K_B","text":"b"},\r\n{"id":"K_C","text":"c"},\r\n{"id":"K_D","text":"d"}\r\n' +
  ']}]}]\r\n\t}\r\n}\r\n';
const LABEL = "touch layout edit";

function resetStores(): void {
  setOpenApplyNotifier(null);
  useOpenRemovalStore.getState().clear();
  useOpenUndoStore.getState().clear();
  useOpenAssignStore.getState().clear();
  useDecisionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
}
function openTiny(touch: string): void {
  resetStores();
  const vfs = createVirtualFS([
    { path: `source/${ID}.kmn`, content: KMN, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
    { path: `source/${ID}.keyman-touch-layout`, content: touch, isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, ID).ir });
}
const startVfs = () => useWorkingCopyStore.getState().startVfs!;
const touchPath = (): string => findTouchLayoutPath(startVfs())!;
const touchText = (): string => readVfsText(startVfs(), touchPath())!;
const addr = (id: string): string => touchKeyAddress("phone", "default", id);
const set = (id: string, text: string): PendingKeyEditOperation => ({ kind: "set", address: addr(id), fields: { text } });
const overlay = () => useWorkingCopyStore.getState().keyEditOverlay.ops;

/** Lines of `a` that `b` lacks (multiset). */
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

/** SC-010: the working copy, the preview and the download all hold the file's text. */
async function expectOneText(id: string = ID): Promise<void> {
  const path = touchPath();
  const text = touchText();
  const { result: hook, unmount } = renderHook(() => useWorkingCopyTransform({ previewedStartId: id }));
  const previewVfs = createVirtualFS(startVfs().entries());
  hook.current!(previewVfs, id);
  const preview = readVfsText(previewVfs, path);
  unmount();
  const projected = await projectWorkingCopyForOutput();
  expect(preview).toBe(text);
  expect(readVfsText(projected!.vfs, path)).toBe(text);
}

afterEach(() => setOpenApplyNotifier(null));

describe("key-grid commits on Open write the file", () => {
  beforeEach(() => openTiny(TOUCH));

  it("set text: only that key's line changes, one undo record, byte-identical undo", async () => {
    const before = touchText();
    expect(commitTouchOpOnOpen({ op: set("K_B", "ɛ") }, LABEL)).toBe("applied");
    const after = touchText();
    expect(missingLines(before, after)).toEqual(['{"id":"K_B","text":"b"},\r\n']);
    expect(after).toContain("ɛ");
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    expect(overlay()).toHaveLength(1);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(0);
    await expectOneText();
    expect(undoLastOpenApply().ok).toBe(true);
    expect(touchText()).toBe(before);
    expect(overlay()).toHaveLength(0);
  });

  it("add key and remove key", async () => {
    const before = touchText();
    const add: PendingKeyEditOperation = { kind: "add", address: addr("K_B"), position: "after", key: { id: "K_ZZ", text: "z", sp: 0 } };
    expect(commitTouchOpOnOpen({ op: add }, LABEL)).toBe("applied");
    expect(missingLines(before, touchText())).toEqual([]);
    expect(touchText()).toContain("K_ZZ");
    await expectOneText();
    const mid = touchText();
    expect(commitTouchOpOnOpen({ op: { kind: "remove", address: addr("K_ZZ"), outcome: "drop" } }, LABEL)).toBe("applied");
    expect(touchText()).not.toContain("K_ZZ");
    expect(useOpenUndoStore.getState().records).toHaveLength(2);
    expect(undoLastOpenApply().ok).toBe(true);
    expect(touchText()).toBe(mid);
    expect(undoLastOpenApply().ok).toBe(true);
    expect(touchText()).toBe(before);
  });

  it("a family fan-out / bulk edit is one change: one write, one undo record, only those keys", async () => {
    const before = touchText();
    groupTouchCommitsOnOpen(() => {
      for (const id of ["K_A", "K_C", "K_D"]) {
        expect(commitTouchOpOnOpen({ op: set(id, id.toLowerCase() + "́") }, LABEL)).toBe("pending");
      }
    }, LABEL);
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    expect(overlay().map((o) => o.seq)).toEqual([0, 1, 2]);
    const lost = missingLines(before, touchText());
    expect(lost).toHaveLength(3);
    expect(lost.join("")).not.toContain("K_B");
    await expectOneText();
    expect(undoLastOpenApply().ok).toBe(true);
    expect(touchText()).toBe(before);
    expect(overlay()).toHaveLength(0);
  });

  it("an add followed by a set of the new key in one group lands together", () => {
    const before = touchText();
    groupTouchCommitsOnOpen(() => {
      commitTouchOpOnOpen({ op: { kind: "add", address: addr("K_D"), position: "after", key: { id: "K_NEW", text: "", sp: 0 } } }, LABEL);
      commitTouchOpOnOpen({ op: set("K_NEW", "n") }, LABEL);
    }, LABEL);
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    expect(touchText()).toContain('"K_NEW"');
    expect(undoLastOpenApply().ok).toBe(true);
    expect(touchText()).toBe(before);
  });

  it("a code-view apply and then undo leave the file, preview and output in step (SC-013)", async () => {
    commitTouchOpOnOpen({ op: set("K_A", "x") }, LABEL);
    const edited = touchText().replace('"text":"c"', '"text":"cc"');
    expect(applyOpenChange({ kind: "files", files: { [touchPath()]: edited }, label: "Touch code view edit", labelKey: "code-view" }).status).toBe("applied");
    expect(touchText()).toBe(edited);
    await expectOneText();
    expect(undoLastOpenApply().ok).toBe(true);
    expect(touchText()).toContain('"text":"x"');
    expect(touchText()).not.toContain("cc");
    await expectOneText();
  });
});

describe("consent", () => {
  // A duplicated property name cannot be patched in place, so the canonical layout needs the author's agreement.
  const UNPATCHABLE = TOUCH.replace('{"id":"K_B","text":"b"}', '{"id":"K_B","text":"b","text":"b"}');

  it("pending: nothing is written or recorded until the author agrees; agree writes and records once", async () => {
    openTiny(UNPATCHABLE);
    const before = touchText();
    let item: Parameters<NonNullable<Parameters<typeof setOpenApplyNotifier>[0]>>[0] | undefined;
    setOpenApplyNotifier((i) => {
      item = i;
    });
    expect(commitTouchOpOnOpen({ op: set("K_A", "q") }, LABEL)).toBe("pending");
    expect(touchText()).toBe(before);
    expect(overlay()).toHaveLength(0);
    const change = item!.build()!;
    expect(applyOpenChange(change, { consentedReemit: true }).status).toBe("applied");
    item!.onApplied!();
    expect(overlay()).toHaveLength(1);
    expect(touchText()).toContain('"q"');
    await expectOneText();
  });

  it("decline: file, overlay and records are unchanged", () => {
    openTiny(UNPATCHABLE);
    const before = touchText();
    let declined = 0;
    setOpenApplyNotifier((i) => {
      i.onNotApplied();
      declined++;
    });
    expect(commitTouchOpOnOpen({ op: set("K_A", "q") }, LABEL)).toBe("pending");
    expect(declined).toBe(1);
    expect(touchText()).toBe(before);
    expect(overlay()).toHaveLength(0);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });
});

describe("the working IR follows the files, never runs ahead of them", () => {
  const kmnIrOf = () => parseKmn(readVfsText(startVfs(), `source/${ID}.kmn`)!, ID).ir;
  const withoutLastRule = () => {
    const ir = JSON.parse(JSON.stringify(useWorkingCopyStore.getState().startIr)) as ReturnType<typeof kmnIrOf>;
    const g = ir.groups.find((x) => x.rules.length > 1)!;
    g.rules.pop();
    return ir;
  };
  const UNPATCHABLE = TOUCH.replace('{"id":"K_B","text":"b"}', '{"id":"K_B","text":"b","text":"b"}');

  it("a declined change with a rules half leaves wc.ir equal to the parse of the files", () => {
    openTiny(UNPATCHABLE);
    const irBefore = JSON.stringify(useWorkingCopyStore.getState().ir);
    setOpenApplyNotifier((i) => i.onNotApplied());
    expect(commitTouchOpOnOpen({ op: set("K_A", "q"), rulesIr: withoutLastRule() }, LABEL)).toBe("pending");
    expect(JSON.stringify(useWorkingCopyStore.getState().ir)).toBe(irBefore);
    expect(emitKmn(useWorkingCopyStore.getState().ir!)).toBe(emitKmn(kmnIrOf()));
  });

  it("an applied change with a rules half is written by the seam: wc.ir equals the parse of the files", () => {
    openTiny(TOUCH);
    expect(commitTouchOpOnOpen({ op: set("K_A", "q"), rulesIr: withoutLastRule() }, LABEL)).toBe("applied");
    expect(readVfsText(startVfs(), `source/${ID}.kmn`)).not.toContain("[K_B]");
    expect(emitKmn(useWorkingCopyStore.getState().ir!)).toBe(emitKmn(kmnIrOf()));
  });

  it("relink shape: renames back plus the clone rule removed is one change, recorded once, undo restores both files", () => {
    openTiny(TOUCH);
    const kmnBefore = readVfsText(startVfs(), `source/${ID}.kmn`)!;
    const touchBefore = touchText();
    let recorded = 0;
    const out = groupTouchCommitsOnOpen(() => {
      commitTouchOpOnOpen(
        { op: { kind: "rename", address: addr("K_B"), toId: "K_Z" }, rulesIr: withoutLastRule(), onApplied: () => recorded++ },
        LABEL,
      );
      commitTouchOpOnOpen({ op: { kind: "rename", address: addr("K_C"), toId: "K_Y" } }, LABEL);
    }, LABEL);
    expect(out).toBe("applied");
    expect(recorded).toBe(1);
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    expect(touchText()).toContain("K_Z");
    expect(touchText()).toContain("K_Y");
    expect(undoLastOpenApply().ok).toBe(true);
    expect(touchText()).toBe(touchBefore);
    expect(readVfsText(startVfs(), `source/${ID}.kmn`)).toBe(kmnBefore);
  });

  it("relink shape declined: nothing recorded, files and wc.ir unchanged", () => {
    openTiny(UNPATCHABLE);
    const before = touchText();
    const irBefore = JSON.stringify(useWorkingCopyStore.getState().ir);
    let recorded = 0;
    setOpenApplyNotifier((i) => i.onNotApplied());
    const out = groupTouchCommitsOnOpen(() => {
      commitTouchOpOnOpen(
        { op: { kind: "rename", address: addr("K_B"), toId: "K_Z" }, rulesIr: withoutLastRule(), onApplied: () => recorded++ },
        LABEL,
      );
    }, LABEL);
    expect(out).toBe("pending");
    expect(recorded).toBe(0);
    expect(touchText()).toBe(before);
    expect(JSON.stringify(useWorkingCopyStore.getState().ir)).toBe(irBefore);
  });

  it("a rules-only install (mint-and-rule repair) goes through the seam", () => {
    openTiny(TOUCH);
    expect(installRulesOnOpen(withoutLastRule(), LABEL)).toBe("applied");
    expect(emitKmn(useWorkingCopyStore.getState().ir!)).toBe(emitKmn(kmnIrOf()));
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
  });

  it("the install's record is made only once it is in the file: decline and failure record nothing", () => {
    openTiny(TOUCH);
    let recorded = 0;
    setOpenApplyNotifier((i) => i.onNotApplied());
    // Failure: the kmn is no longer a keyboard source after the install is attempted on a missing file.
    useWorkingCopyStore.getState().replaceStartingPointFiles({ [`source/${ID}.kmn`]: null });
    installRulesOnOpen(withoutLastRule(), LABEL, () => recorded++);
    expect(recorded).toBe(0);
    openTiny(TOUCH);
    expect(installRulesOnOpen(withoutLastRule(), LABEL, () => recorded++)).toBe("applied");
    expect(recorded).toBe(1);
  });

  it("a group's failure is returned, not swallowed", () => {
    openTiny(TOUCH);
    const bad = '{"phone": {"layer": [';
    useWorkingCopyStore.getState().replaceStartingPointFiles({ [touchPath()]: bad });
    const out = groupTouchCommitsOnOpen(() => {
      commitTouchOpOnOpen({ op: set("K_A", "q") }, LABEL);
    }, LABEL);
    expect(out).toBe("failed");
    expect(touchText()).toBe(bad);
  });
});

// -- corpus -----------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const KEYBOARDS_ROOT = resolve(HERE, "../../../../../../keyboards");
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

describe.skipIf(!existsSync(RELEASE))("one key-grid edit over the corpus", () => {
  for (const id of ["akan", "bambara", "anii"]) {
    if (!existsSync(join(folderOf(id), "source", `${id}.keyman-touch-layout`))) continue;
    it(`${id}: precise, one record, undo restores the bytes`, async () => {
      const meta = parseKps(readFileSync(join(folderOf(id), "source", `${id}.kps`), "utf8"));
      const kb: StartKeyboard = { id, path: `release/${sampleKeyboardRelativePath(id)}`, script: meta.script, targets: meta.targets, displayName: meta.displayName, version: meta.version, languages: meta.languages };
      const vfs = createVirtualFS();
      await fetchKeyboardSourceToVfs(kb, vfs, { proxyBase: PROXY, fetchImpl: corpusFetch, keepKps: true });
      resetStores();
      useWorkingCopyStore.getState().instantiateFromExisting(kb, { vfs, ir: parseKmn(readVfsText(vfs, `source/${id}.kmn`)!, id).ir });
      const before = touchText();
      const layout = JSON.parse(before.replace(/^﻿/, "")) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      let target: { platform: string; layer: string; keyId: string } | undefined;
      for (const [platform, p] of Object.entries<any>(layout)) { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (target !== undefined || p === null || typeof p !== "object" || !Array.isArray(p.layer)) continue;
        const layer = p.layer[0];
        const ids: string[] = (layer.row ?? []).flatMap((r: any) => (r.key ?? []).map((k: any) => k.id)); // eslint-disable-line @typescript-eslint/no-explicit-any
        for (const r of layer.row ?? []) for (const k of r.key ?? []) {
          if (target === undefined && typeof k.id === "string" && typeof k.text === "string" && ids.filter((i) => i === k.id).length === 1) {
            target = { platform, layer: layer.id, keyId: k.id };
          }
        }
      }
      expect(target).toBeDefined();
      const op: PendingKeyEditOperation = { kind: "set", address: touchKeyAddress(target!.platform, target!.layer, target!.keyId), fields: { text: "ɛ" } };
      expect(commitTouchOpOnOpen({ op }, LABEL), `${id}: written without asking`).toBe("applied");
      const after = touchText();
      expect(missingLines(before, after).length).toBeLessThanOrEqual(14);
      expect(useOpenUndoStore.getState().records).toHaveLength(1);
      await expectOneText(id);
      expect(undoLastOpenApply().ok).toBe(true);
      expect(touchText()).toBe(before);
    }, 60_000);

    it(`${id}: a 3-key bulk edit is one write, one undo record, three lines, byte-identical undo`, async () => {
      const meta = parseKps(readFileSync(join(folderOf(id), "source", `${id}.kps`), "utf8"));
      const kb: StartKeyboard = { id, path: `release/${sampleKeyboardRelativePath(id)}`, script: meta.script, targets: meta.targets, displayName: meta.displayName, version: meta.version, languages: meta.languages };
      const vfs = createVirtualFS();
      await fetchKeyboardSourceToVfs(kb, vfs, { proxyBase: PROXY, fetchImpl: corpusFetch, keepKps: true });
      resetStores();
      useWorkingCopyStore.getState().instantiateFromExisting(kb, { vfs, ir: parseKmn(readVfsText(vfs, `source/${id}.kmn`)!, id).ir });
      const before = touchText();
      const layout = JSON.parse(before.replace(/^﻿/, "")) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      const picks: { platform: string; layer: string; keyId: string }[] = [];
      for (const [platform, p] of Object.entries<any>(layout)) { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (p === null || typeof p !== "object" || !Array.isArray(p.layer) || picks.length >= 3) continue;
        const layer = p.layer[0];
        const ids: string[] = (layer.row ?? []).flatMap((r: any) => (r.key ?? []).map((k: any) => k.id)); // eslint-disable-line @typescript-eslint/no-explicit-any
        for (const r of layer.row ?? []) for (const k of r.key ?? []) {
          if (picks.length < 3 && typeof k.id === "string" && typeof k.text === "string" && ids.filter((i) => i === k.id).length === 1) {
            picks.push({ platform, layer: layer.id, keyId: k.id });
          }
        }
      }
      expect(picks).toHaveLength(3);
      const out = groupTouchCommitsOnOpen(() => {
        for (const pk of picks) {
          commitTouchOpOnOpen({ op: { kind: "set", address: touchKeyAddress(pk.platform, pk.layer, pk.keyId), fields: { width: 77 } } }, LABEL);
        }
      }, LABEL);
      expect(out).toBe("applied");
      expect(useOpenUndoStore.getState().records).toHaveLength(1);
      expect(overlay()).toHaveLength(3);
      expect(missingLines(before, touchText()).length).toBeLessThanOrEqual(3);
      await expectOneText(id);
      expect(undoLastOpenApply().ok).toBe(true);
      expect(touchText()).toBe(before);
      expect(overlay()).toHaveLength(0);
    }, 60_000);
  }
});
