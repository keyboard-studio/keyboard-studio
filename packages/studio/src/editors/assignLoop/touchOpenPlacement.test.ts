// Character placements, deletions and restores on a keyboard opened for update
// (spec 111 phase 16, slice S3): each is written into the touch file as one
// `touch` change (one undo record, recorded only once applied); a restore is
// refused when the key has changed since.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS, touchKeyAddress, touchSubKeyAddress, type StartKeyboard, type TouchAssignment } from "@keyboard-studio/contracts";
import { fetchKeyboardSourceToVfs, parseKmn, parseKps, parseTouchLayout, enumerateTouchMethodsForChar, type FetchFn } from "@keyboard-studio/engine";
import { bindManifest, useWorkingCopyStore, type PendingKeyEditOperation } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { useOpenUndoStore } from "../../stores/openUndoStore.ts";
import { useOpenRemovalStore } from "../../stores/openRemovalStore.ts";
import { useOpenAssignStore } from "../../stores/openAssignStore.ts";
import { useWorkingCopyTransform } from "../../hooks/useWorkingCopyTransform.ts";
import { applyOpenChange, undoLastOpenApply } from "../../lib/openApply.ts";
import { setOpenApplyNotifier } from "../../lib/openApplyNotifier.ts";
import { projectWorkingCopyForOutput } from "../../lib/serializeWorkingCopy.ts";
import { findTouchLayoutPath } from "../../lib/findTouchLayoutPath.ts";
import { pendingTouchDeletions } from "../../lib/openApply/touchRestore.ts";
import { readVfsText } from "../../lib/vfsText.ts";
import { sampleKeyboardRelativePath } from "../../test/openSampleKeyboards.ts";
import { commitTouchEditOnOpen, commitTouchOpOnOpen } from "./touchOpenCommit.ts";
import { buildTouchMechanismRef } from "./TouchGallery.tsx";
import { completeTouchStep } from "../../lib/touchStepCompletion.ts";

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
  '{"id":"K_A","text":"a","sk":[{"id":"U_00E1","text":"á"},{"id":"U_00E0","text":"à"}]},\r\n{"id":"K_B","text":"b"},\r\n{"id":"K_C","text":"c"}\r\n' +
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
  bindManifest([{ kind: "editor-step", id: "touch", title: "touch", component: () => null, inputs: [], writes: [] }] as never);
}
const startVfs = () => useWorkingCopyStore.getState().startVfs!;
const touchPath = (): string => findTouchLayoutPath(startVfs())!;
const touchText = (): string => readVfsText(startVfs(), touchPath())!;
const records = () => useOpenUndoStore.getState().records;

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

function placement(char: string, hostKey: string): TouchAssignment {
  const ref = buildTouchMechanismRef("longpress_alternates", hostKey, "", char, "default")!;
  return { scope: "individual", target: char, modality: "touch", mechanisms: [ref], source: "user" };
}
const count = (text: string, needle: string): number => text.split(needle).length - 1;
const sk = (id: string) => touchSubKeyAddress("phone", "default", "K_A", "sk", id);

afterEach(() => setOpenApplyNotifier(null));

describe("a character placement on Open", () => {
  it("changes only that key, is one undo record, and the file, preview and output agree; undo is byte-identical", async () => {
    openTiny(TOUCH);
    const before = touchText();
    let applied = 0;
    expect(commitTouchEditOnOpen({ assignments: [placement("ɛ", "K_B")] }, LABEL, () => applied++)).toBe("applied");
    expect(applied).toBe(1);
    const after = touchText();
    expect(count(after, "ɛ")).toBe(1);
    // The key's own line, and the platform's default hint the placement sets (its closing line).
    const lost = missingLines(before, after);
    expect(lost).toHaveLength(2);
    expect(lost[0]).toBe('{"id":"K_B","text":"b"},\r\n');
    expect(lost.join("")).not.toMatch(/K_A|K_C/);
    expect(records()).toHaveLength(1);
    expect(useWorkingCopyStore.getState().touchDraft?.charTouchEntries ?? []).toHaveLength(0);
    await expectOneText();
    expect(undoLastOpenApply().ok).toBe(true);
    expect(touchText()).toBe(before);
    await expectOneText();
  });

  it("a key edit and then a placement on another key are both in the file, preview and output (SC-013)", async () => {
    openTiny(TOUCH);
    const op: PendingKeyEditOperation = { kind: "set", address: touchKeyAddress("phone", "default", "K_C"), fields: { text: "ç" } };
    expect(commitTouchOpOnOpen({ op }, LABEL)).toBe("applied");
    expect(commitTouchEditOnOpen({ assignments: [placement("ɛ", "K_B")] }, LABEL)).toBe("applied");
    expect(touchText()).toContain("ç");
    expect(count(touchText(), "ɛ")).toBe(1);
    expect(records()).toHaveLength(2);
    await expectOneText();
    // Continue builds nothing on Open: the file is what is output.
    completeTouchStep({ assignments: [], startIr: useWorkingCopyStore.getState().startIr, startVfs: startVfs(), seedSource: "reseed-from-desktop" });
    expect(useWorkingCopyStore.getState().touchLayoutJson).toBeNull();
    await expectOneText();
    expect(undoLastOpenApply().ok).toBe(true);
    expect(touchText()).not.toContain("ɛ");
    expect(touchText()).toContain("ç");
    await expectOneText();
  });

  it("consent pending: nothing is written or recorded until the author agrees; decline changes nothing", async () => {
    const UNPATCHABLE = TOUCH.replace('{"id":"K_B","text":"b"}', '{"id":"K_B","text":"b","text":"b"}');
    openTiny(UNPATCHABLE);
    const before = touchText();
    let item: Parameters<NonNullable<Parameters<typeof setOpenApplyNotifier>[0]>>[0] | undefined;
    setOpenApplyNotifier((i) => {
      item = i;
    });
    let applied = 0;
    expect(commitTouchEditOnOpen({ assignments: [placement("ɛ", "K_A")] }, LABEL, () => applied++)).toBe("pending");
    expect(touchText()).toBe(before);
    expect(applied).toBe(0);
    expect(records()).toHaveLength(0);
    expect(applyOpenChange(item!.build()!, { consentedReemit: true }).status).toBe("applied");
    item!.onApplied!();
    expect(applied).toBe(1);
    expect(touchText()).toContain("ɛ");
    await expectOneText();

    openTiny(UNPATCHABLE);
    const again = touchText();
    let declined = 0;
    setOpenApplyNotifier((i) => {
      i.onNotApplied();
      declined++;
    });
    applied = 0;
    expect(commitTouchEditOnOpen({ assignments: [placement("ɛ", "K_A")] }, LABEL, () => applied++)).toBe("pending");
    expect(declined).toBe(1);
    expect(applied).toBe(0);
    expect(touchText()).toBe(again);
    expect(records()).toHaveLength(0);
  });
});

describe("a deletion and a restore on Open", () => {
  it("restore finds the key by its id: an insertion before it does not lose it; a changed key is refused", () => {
    openTiny(TOUCH);
    const idB = touchKeyAddress("phone", "default", "K_B");
    expect(commitTouchEditOnOpen({ removeIds: [idB] }, LABEL)).toBe("applied");
    const entries = pendingTouchDeletions(records()).get(idB)!;
    const add: PendingKeyEditOperation = { kind: "add", address: touchKeyAddress("phone", "default", "K_A"), position: "before", key: { id: "K_Z", text: "z", sp: 0 } };
    expect(commitTouchOpOnOpen({ op: add }, LABEL)).toBe("applied");
    expect(commitTouchEditOnOpen({ restoreKeys: entries, ids: [idB] }, LABEL)).toBe("applied");
    const keys = JSON.parse(touchText()).phone.layer[0].row[0].key;
    expect(keys.map((k: { id: string }) => k.id)).toEqual(["K_Z", "K_A", "K_B", "K_C"]);
    expect(keys[2]).toEqual({ id: "K_B", text: "b" });
  });

  it("with duplicate ids in the layer only the key at the saved place counts, and only if unchanged", () => {
    const DUP = TOUCH.replace('{"id":"K_C","text":"c"}', '{"id":"K_B","text":"b2"}');
    openTiny(DUP);
    const idB = touchKeyAddress("phone", "default", "K_B");
    expect(commitTouchEditOnOpen({ removeIds: [idB] }, LABEL)).toBe("applied");
    const entries = pendingTouchDeletions(records()).get(idB)!;
    expect(entries.length).toBeGreaterThan(0);
    // Both are neutralised or blanked alike; restoring puts each back at its own place.
    expect(commitTouchEditOnOpen({ restoreKeys: entries, ids: [idB] }, LABEL)).toBe("applied");
    expect(JSON.parse(touchText())).toEqual(JSON.parse(DUP));
    // One of the two changed by hand since the deletion: refused, nothing written.
    expect(commitTouchEditOnOpen({ removeIds: [idB] }, LABEL)).toBe("applied");
    const again = pendingTouchDeletions(records()).get(idB)!;
    const layout = JSON.parse(touchText());
    layout.phone.layer[0].row[0].key[2].text = "changed";
    const edited = JSON.stringify(layout, null, 2);
    expect(applyOpenChange({ kind: "files", files: { [touchPath()]: edited }, label: "Touch code view edit", labelKey: "code-view" }).status).toBe("applied");
    const r = applyOpenChange({ kind: "touch", edit: { restoreKeys: again, ids: [idB] }, label: LABEL });
    expect(r).toMatchObject({ status: "failed", refused: true, code: "touch-key-changed" });
    expect(touchText()).toBe(edited);
  });

  it("the ids of one deletion leave the restore list together when one is restored", () => {
    openTiny(TOUCH);
    const a = sk("U_00E1");
    const b = sk("U_00E0");
    expect(commitTouchEditOnOpen({ removeIds: [a, b] }, LABEL)).toBe("applied");
    const pending = pendingTouchDeletions(records());
    expect([...pending.keys()].sort()).toEqual([a, b].sort());
    expect(commitTouchEditOnOpen({ restoreKeys: pending.get(a)!, ids: [a] }, LABEL)).toBe("applied");
    expect(pendingTouchDeletions(records()).size).toBe(0);
    expect(touchText()).toContain("à");
  });

  it("a refused restore reaches the host: applying the handed-over change reports touch-key-changed", () => {
    openTiny(TOUCH);
    expect(commitTouchEditOnOpen({ removeIds: [sk("U_00E1")] }, LABEL)).toBe("applied");
    const entries = pendingTouchDeletions(records()).get(sk("U_00E1"))!;
    commitTouchOpOnOpen({ op: { kind: "set", address: touchKeyAddress("phone", "default", "K_A"), fields: { text: "A!" } } }, LABEL);
    let item: Parameters<NonNullable<Parameters<typeof setOpenApplyNotifier>[0]>>[0] | undefined;
    setOpenApplyNotifier((i) => {
      item = i;
    });
    commitTouchEditOnOpen({ restoreKeys: entries, ids: [sk("U_00E1")] }, LABEL);
    expect(applyOpenChange(item!.build()!)).toMatchObject({ status: "failed", refused: true, code: "touch-key-changed" });
  });

  it("a placement sets the platform's defaultHint, as the Copy path does", () => {
    openTiny(TOUCH);
    commitTouchEditOnOpen({ assignments: [placement("ɛ", "K_B")] }, LABEL);
    expect(JSON.parse(touchText()).phone.defaultHint).toBe("dot");
  });

  it("delete is a removeIds change with one undo record; restore puts the saved key back; both undo byte-identically", async () => {
    openTiny(TOUCH);
    const before = touchText();
    expect(commitTouchEditOnOpen({ removeIds: [sk("U_00E1")] }, LABEL)).toBe("applied");
    expect(touchText()).not.toContain("á");
    expect(touchText()).toContain("à");
    expect(records()).toHaveLength(1);
    expect(useWorkingCopyStore.getState().deletedTouchKeyIds.size).toBe(0);
    await expectOneText();
    const deleted = touchText();
    const pending = pendingTouchDeletions(records());
    expect([...pending.keys()]).toEqual([sk("U_00E1")]);

    expect(commitTouchEditOnOpen({ restoreKeys: pending.get(sk("U_00E1"))!, ids: [sk("U_00E1")] }, LABEL)).toBe("applied");
    expect(touchText()).toContain("á");
    expect(pendingTouchDeletions(records()).size).toBe(0);
    expect(records()).toHaveLength(2);
    await expectOneText();
    // The restored layout equals the original as data.
    expect(JSON.parse(touchText())).toEqual(JSON.parse(before));

    expect(undoLastOpenApply().ok).toBe(true);
    expect(touchText()).toBe(deleted);
    expect([...pendingTouchDeletions(records()).keys()]).toEqual([sk("U_00E1")]);
    expect(undoLastOpenApply().ok).toBe(true);
    expect(touchText()).toBe(before);
    expect(pendingTouchDeletions(records()).size).toBe(0);
  });

  it("a main-key delete is restored over the neutralised key", () => {
    openTiny(TOUCH);
    const before = touchText();
    expect(commitTouchEditOnOpen({ removeIds: [touchKeyAddress("phone", "default", "K_B")] }, LABEL)).toBe("applied");
    expect(touchText()).not.toContain('"text":"b"');
    const entries = pendingTouchDeletions(records()).get(touchKeyAddress("phone", "default", "K_B"))!;
    expect(entries).toHaveLength(1);
    expect(commitTouchEditOnOpen({ restoreKeys: entries, ids: [touchKeyAddress("phone", "default", "K_B")] }, LABEL)).toBe("applied");
    expect(JSON.parse(touchText())).toEqual(JSON.parse(before));
  });

  it("a restore is refused, with nothing written, when the key changed since the deletion", () => {
    openTiny(TOUCH);
    expect(commitTouchEditOnOpen({ removeIds: [sk("U_00E1")] }, LABEL)).toBe("applied");
    const entries = pendingTouchDeletions(records()).get(sk("U_00E1"))!;
    const op: PendingKeyEditOperation = { kind: "set", address: touchKeyAddress("phone", "default", "K_A"), fields: { text: "A!" } };
    expect(commitTouchOpOnOpen({ op }, LABEL)).toBe("applied");
    const changed = touchText();
    const nRecords = records().length;
    const result = applyOpenChange({ kind: "touch", edit: { restoreKeys: entries, ids: [sk("U_00E1")] }, label: LABEL });
    expect(result).toMatchObject({ status: "failed", refused: true, code: "touch-key-changed" });
    expect(touchText()).toBe(changed);
    expect(records()).toHaveLength(nRecords);
    // Through the commit path the author is told (the host shows the refusal notice) and nothing is recorded.
    let handed = 0;
    setOpenApplyNotifier(() => {
      handed++;
    });
    let applied = 0;
    expect(commitTouchEditOnOpen({ restoreKeys: entries, ids: [sk("U_00E1")] }, LABEL, () => applied++)).toBe("failed");
    expect(handed).toBe(1);
    expect(applied).toBe(0);
    expect(touchText()).toBe(changed);
  });

  it("a delete waiting for the author's agreement records nothing; declined leaves the file as it was", () => {
    const UNPATCHABLE = TOUCH.replace('{"id":"K_B","text":"b"}', '{"id":"K_B","text":"b","text":"b"}');
    openTiny(UNPATCHABLE);
    const before = touchText();
    setOpenApplyNotifier((i) => i.onNotApplied());
    let applied = 0;
    expect(commitTouchEditOnOpen({ removeIds: [sk("U_00E1")] }, LABEL, () => applied++)).toBe("pending");
    expect(applied).toBe(0);
    expect(touchText()).toBe(before);
    expect(records()).toHaveLength(0);
    expect(pendingTouchDeletions(records()).size).toBe(0);
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

describe.skipIf(!existsSync(RELEASE))("one placement and one delete over the corpus", () => {
  for (const id of ["akan", "bambara", "anii"]) {
    if (!existsSync(join(folderOf(id), "source", `${id}.keyman-touch-layout`))) continue;
    it(`${id}: a placement and a delete are precise, one record each, undo restores the bytes`, async () => {
      const meta = parseKps(readFileSync(join(folderOf(id), "source", `${id}.kps`), "utf8"));
      const kb: StartKeyboard = { id, path: `release/${sampleKeyboardRelativePath(id)}`, script: meta.script, targets: meta.targets, displayName: meta.displayName, version: meta.version, languages: meta.languages };
      const vfs = createVirtualFS();
      await fetchKeyboardSourceToVfs(kb, vfs, { proxyBase: PROXY, fetchImpl: corpusFetch, keepKps: true });
      resetStores();
      useWorkingCopyStore.getState().instantiateFromExisting(kb, { vfs, ir: parseKmn(readVfsText(vfs, `source/${id}.kmn`)!, id).ir });
      const before = touchText();
      const layout = parseTouchLayout(before.replace(/^﻿/, ""));
      // Place a character that is not on the keyboard, on a host key in the first layer.
      const platform = layout.platforms.find((p) => p.layers.length > 0)!;
      const layer = platform.layers[0]!;
      const host = layer.rows.flatMap((r) => r.keys).find((k) => /^K_[A-Z]$/.test(k.id))!;
      const fresh = "ʬ";
      expect(before).not.toContain(fresh);
      const a: TouchAssignment = placement(fresh, host.id);
      expect(commitTouchEditOnOpen({ assignments: [a] }, LABEL), `${id}: written without asking`).toBe("applied");
      const afterPlace = touchText();
      expect(afterPlace).toContain(fresh);
      expect(missingLines(before, afterPlace).length).toBeLessThanOrEqual(14);
      expect(records()).toHaveLength(1);
      await expectOneText(id);

      // Delete the method just placed (a sub-key of the host key).
      const placed = parseTouchLayout(afterPlace.replace(/^﻿/, ""));
      const method = enumerateTouchMethodsForChar(placed, fresh).find((m) => m.deletable)!;
      expect(method, `${id}: the placement is a deletable method`).toBeDefined();
      const nPlaced = count(afterPlace, fresh);
      expect(commitTouchEditOnOpen({ removeIds: [method.id] }, LABEL), `${id}: delete`).toBe("applied");
      expect(count(touchText(), fresh)).toBe(nPlaced - 1);
      expect(missingLines(afterPlace, touchText()).length).toBeLessThanOrEqual(14);
      expect(records()).toHaveLength(2);
      await expectOneText(id);
      const entries = pendingTouchDeletions(records()).get(method.id)!;
      expect(commitTouchEditOnOpen({ restoreKeys: entries, ids: [method.id] }, LABEL)).toBe("applied");
      expect(count(touchText(), fresh)).toBe(nPlaced);
      expect(JSON.parse(touchText().replace(/^﻿/, ""))).toEqual(JSON.parse(afterPlace.replace(/^﻿/, "")));
      expect(undoLastOpenApply().ok).toBe(true);
      expect(undoLastOpenApply().ok).toBe(true);
      expect(undoLastOpenApply().ok).toBe(true);
      expect(touchText()).toBe(before);
    }, 60_000);
  }
});
