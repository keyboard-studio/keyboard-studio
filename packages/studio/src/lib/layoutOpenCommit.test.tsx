// A Layout-tab edit on a keyboard opened for update (spec 111 T082a, FR-041/FR-042/FR-045):
// every confirm is written into the source file through the apply seam, one undo record per
// confirm, undo restores the bytes, and the `kmn-edits` / `deadkeys-defined` decisions are only the
// record (nothing replays them: `layoutEdits` is in no Open row). Copy keeps its replay.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS, type KmnEditsValue, type StartKeyboard } from "@keyboard-studio/contracts";
import { fetchKeyboardSourceToVfs, parseKmn, parseKps, type FetchFn } from "@keyboard-studio/engine";
import { useWorkingCopyStore, type KmnEditInput } from "../stores/workingCopyStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useOpenUndoStore } from "../stores/openUndoStore.ts";
import { makeReadyRulesDemoArtifact, useRulesDemoArtifactStore } from "../stores/rulesDemoArtifactStore.ts";
import { useWorkingCopyTransform } from "../hooks/useWorkingCopyTransform.ts";
import { applyOpenChange, undoLastOpenApply } from "./openApply.ts";
import { setOpenApplyNotifier, type HandOver } from "./openApplyNotifier.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { PROJECTION_STEPS } from "./projectionSteps.ts";
import { readVfsText } from "./vfsText.ts";
import { sampleKeyboardRelativePath } from "../test/openSampleKeyboards.ts";

vi.mock("./services.ts", async () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
  getPatternByIdSync: () => undefined,
}));

// Lets a test force the splice to refuse; otherwise the real implementation runs.
const forced = vi.hoisted(() => ({ refuse: false }));
vi.mock("@keyboard-studio/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@keyboard-studio/engine")>();
  return {
    ...actual,
    projectKmnText: (...args: Parameters<typeof actual.projectKmnText>) =>
      forced.refuse ? { ok: false as const, reason: "forced for test" } : actual.projectKmnText(...args),
  };
});

const ID = "lay";
const KMN_PATH = `source/${ID}.kmn`;
const KMN = [
  "store(&VERSION) '10.0'",
  "store(&NAME) 'Lay'",
  "store(&TARGETS) 'any'",
  "store(letters) 'abc'",
  "store(dk_3000_bases) 'ae'",
  "store(dk_3000_output) U+00E1 U+00E9",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "",
  "+ [K_A] > 'a'",
  "+ [SHIFT K_A] > 'A'",
  "+ [K_E] > 'e'",
  "+ [SHIFT K_B] > any(letters)",
  "+ [K_D] > dk(3000)",
  "dk(3000) + any(dk_3000_bases) > index(dk_3000_output, 2)",
  "dk(3000) + [K_O] > U+00F3",
  "",
].join("\r\n");
const KB = { id: ID, path: `release/l/${ID}`, script: "Latn", targets: ["desktop"], displayName: "Lay", version: "1.0", languages: ["en"] } as StartKeyboard;

function resetStores(): void {
  useOpenUndoStore.getState().clear();
  useDecisionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
}

function openFixture(): void {
  resetStores();
  const vfs = createVirtualFS([
    { path: KMN_PATH, content: KMN, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, ID).ir });
  useRulesDemoArtifactStore.getState().setArtifact(makeReadyRulesDemoArtifact(`blob:${ID}`, ID));
}

const fileText = (): string => readVfsText(useWorkingCopyStore.getState().startVfs!, KMN_PATH)!;
const recorded = (): KmnEditsValue | undefined =>
  useDecisionStore.getState().decisions["kmn-edits"]?.value as KmnEditsValue | undefined;
const lines = (t: string): string[] => t.split(/(?<=\n)/);
const noVersion = (t: string): string => t.replace(/^store\(&(?:KEYBOARD)?VERSION\).*\r?\n/gm, "");

/** Lines of `a` that `b` lacks (multiset). */
function missingLines(a: string, b: string): string[] {
  const pool = new Map<string, number>();
  for (const l of lines(b)) pool.set(l, (pool.get(l) ?? 0) + 1);
  const out: string[] = [];
  for (const l of lines(a)) {
    const n = pool.get(l) ?? 0;
    if (n > 0) pool.set(l, n - 1);
    else out.push(l);
  }
  return out;
}

async function previewAndOutput(id: string): Promise<{ preview: string; output: string }> {
  const s = useWorkingCopyStore.getState();
  const { result, unmount } = renderHook(() => useWorkingCopyTransform({ previewedStartId: id }));
  const previewVfs = createVirtualFS(s.startVfs!.entries());
  result.current!(previewVfs, id);
  const preview = readVfsText(previewVfs, `source/${id}.kmn`)!;
  unmount();
  const projected = await projectWorkingCopyForOutput();
  return { preview, output: readVfsText(projected!.vfs, `source/${id}.kmn`)! };
}

const count = (hay: string, needle: string): number => hay.split(needle).length - 1;

beforeEach(() => {
  forced.refuse = false;
  openFixture();
});
afterEach(() => setOpenApplyNotifier(null));

describe("the Open output row", () => {
  it("replays no Layout-tab entry (they are written to the file when applied)", () => {
    expect(PROJECTION_STEPS.output.has("layoutEdits")).toBe(false);
  });
});

describe("a Layout-tab edit on Open", () => {
  type Case = { name: string; run: () => { ok: boolean }; added: string[]; removed: string[]; recordsEntry: boolean };
  const commit = (op: KmnEditInput, options?: { partner?: KmnEditInput; extra?: readonly KmnEditInput[] }) =>
    useWorkingCopyStore.getState().commitKmnEdit(op, options);
  const dk = (...ops: Parameters<ReturnType<typeof useWorkingCopyStore.getState>["commitLayoutDeadkeyOp"]>) =>
    useWorkingCopyStore.getState().commitLayoutDeadkeyOp(...ops);

  const cases: Case[] = [
    {
      name: "set-key",
      run: () => commit({ op: "set-key", vkey: "K_E", layer: [], output: { kind: "text", text: "ŋ" } }),
      added: ["+ [K_E] > U+014B\r\n"],
      removed: ["+ [K_E] > 'e'\r\n"],
      recordsEntry: true,
    },
    {
      name: "set-key with its case partner (one confirm)",
      run: () =>
        commit(
          { op: "set-key", vkey: "K_A", layer: [], output: { kind: "text", text: "ŋ" } },
          { partner: { op: "set-key", vkey: "K_A", layer: ["SHIFT"], output: { kind: "text", text: "Ŋ" } } },
        ),
      added: ["+ [K_A] > U+014B\r\n", "+ [SHIFT K_A] > U+014A\r\n"],
      removed: ["+ [K_A] > 'a'\r\n", "+ [SHIFT K_A] > 'A'\r\n"],
      recordsEntry: true,
    },
    {
      name: "set-row",
      run: () =>
        commit({
          op: "set-row",
          vkey: "K_O",
          layer: [],
          context: [{ kind: "deadkey", deadkeyId: "3000" }],
          becomes: [{ kind: "text", text: "ɔ" }],
        }),
      added: ["dk(3000) + [K_O] > U+0254\r\n"],
      removed: ["dk(3000) + [K_O] > U+00F3\r\n"],
      recordsEntry: true,
    },
    {
      name: "remove-row",
      run: () => commit({ op: "remove-row", vkey: "K_O", layer: [], context: [{ kind: "deadkey", deadkeyId: "3000" }] }),
      added: [],
      removed: ["dk(3000) + [K_O] > U+00F3\r\n"],
      recordsEntry: true,
    },
    {
      name: "deadkey pair added (the table)",
      run: () => dk({ kind: "add-pair", id: 0x3000, base: "o", accented: "ó" }),
      added: [],
      removed: [],
      recordsEntry: false,
    },
    {
      name: "deadkey pair removed (the table)",
      run: () => dk({ kind: "remove-pair", id: 0x3000, index: 0 }),
      added: [],
      removed: [],
      recordsEntry: false,
    },
  ];

  for (const c of cases) {
    it(`${c.name}: written to the file once, one undo record, undo is byte-identical`, async () => {
      const before = fileText();
      const result = c.run();
      expect(result.ok).toBe(true);
      const after = fileText();
      expect(useOpenUndoStore.getState().records).toHaveLength(1);
      expect(useOpenUndoStore.getState().records[0]!.labelKey).toBe("layout-edit");
      expect(after).not.toBe(before);
      if (c.name.startsWith("deadkey")) {
        // Only lines of the deadkey's own table change.
        for (const l of missingLines(before, after)) expect(l).toMatch(/dk_3000|dk\(3000\)/);
        for (const l of missingLines(after, before)) expect(l).toMatch(/dk_3000|dk\(3000\)/);
      } else {
        expect(missingLines(after, before)).toEqual(c.added);
        expect(missingLines(before, after)).toEqual(c.removed);
      }
      // The working copy, the preview and the download read the one text.
      const s = useWorkingCopyStore.getState();
      expect(s.ir).toBe(s.startIr);
      const { preview, output } = await previewAndOutput(ID);
      expect(noVersion(preview)).toBe(noVersion(after));
      expect(noVersion(output)).toBe(noVersion(after));
      for (const l of c.added) expect(count(output, l)).toBe(1);
      // The entry is only the record.
      expect(recorded()?.entries.length ?? 0).toBe(c.recordsEntry ? (c.name.includes("case partner (one") ? 2 : 1) : 0);
      expect(undoLastOpenApply().ok).toBe(true);
      expect(fileText()).toBe(before);
    });
  }

  it("a record-only entry (a declined case partner) writes no file and leaves no undo step", () => {
    const before = fileText();
    expect(commit({ op: "decline-case-partner", vkey: "K_E", layer: [], partner: "E" }).ok).toBe(true);
    expect(fileText()).toBe(before);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
    expect(recorded()?.entries.map((e) => e.op)).toEqual(["decline-case-partner"]);
  });

  it("clear-key is applied to the file's own parse", () => {
    const before = fileText();
    expect(commit({ op: "clear-key", vkey: "K_E", layer: [] }).ok).toBe(true);
    // Nothing was set in the Layout tab, so there is nothing to give back and the file is unchanged.
    expect(fileText()).toBe(before);
    // The file already holds the result, so nothing is recorded.
    expect(recorded()).toBeUndefined();
  });

  it("the Layout tab's own undo stack gets nothing on Open", () => {
    commit({ op: "set-key", vkey: "K_E", layer: [], output: { kind: "text", text: "ŋ" } });
    expect(useWorkingCopyStore.getState().undoStack.filter((e) => e.k === "l" || e.k === "lb" || e.k === "ld")).toEqual([]);
  });

  it("refuses a read-only key and writes nothing", () => {
    const before = fileText();
    const r = commit({ op: "set-key", vkey: "K_B", layer: ["SHIFT"], output: { kind: "text", text: "x" } });
    expect(r.ok).toBe(false);
    expect(fileText()).toBe(before);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
    expect(recorded()).toBeUndefined();
  });

  it("two edits are two undo records, undone newest first", () => {
    const before = fileText();
    commit({ op: "set-key", vkey: "K_E", layer: [], output: { kind: "text", text: "ŋ" } });
    const mid = fileText();
    commit({ op: "set-key", vkey: "K_A", layer: [], output: { kind: "text", text: "ɛ" } });
    expect(useOpenUndoStore.getState().records).toHaveLength(2);
    expect(undoLastOpenApply().ok).toBe(true);
    expect(fileText()).toBe(mid);
    expect(undoLastOpenApply().ok).toBe(true);
    expect(fileText()).toBe(before);
  });
});

describe("a Layout-tab edit that cannot be placed precisely on Open", () => {
  let handed: HandOver[];
  beforeEach(() => {
    handed = [];
    setOpenApplyNotifier((item) => handed.push(item));
    forced.refuse = true;
  });

  it("is handed to the host, writes nothing and records nothing until the author agrees", () => {
    const before = fileText();
    const r = useWorkingCopyStore.getState().commitKmnEdit({ op: "set-key", vkey: "K_E", layer: [], output: { kind: "text", text: "ŋ" } });
    expect(r).toEqual({ ok: true, seqs: [], pending: true });
    expect(handed).toHaveLength(1);
    expect(fileText()).toBe(before);
    expect(recorded()).toBeUndefined();
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });

  it("a decline leaves the file unchanged and records no entry", () => {
    const before = fileText();
    useWorkingCopyStore.getState().commitKmnEdit({ op: "set-key", vkey: "K_E", layer: [], output: { kind: "text", text: "ŋ" } });
    handed[0]!.onNotApplied();
    expect(fileText()).toBe(before);
    expect(recorded()).toBeUndefined();
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });

  it("agreement writes the file as one change and then records the entry", () => {
    useWorkingCopyStore.getState().commitKmnEdit({ op: "set-key", vkey: "K_E", layer: [], output: { kind: "text", text: "ŋ" } });
    const change = handed[0]!.build();
    expect(change).not.toBeNull();
    expect(applyOpenChange(change!, { consentedReemit: true }).status).toBe("applied");
    handed[0]!.onApplied?.();
    expect(fileText()).toContain("U+014B");
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    expect(recorded()?.entries).toHaveLength(1);
  });

  it("without a host the edit is refused, not dropped silently", () => {
    setOpenApplyNotifier(null);
    const before = fileText();
    const r = useWorkingCopyStore.getState().commitKmnEdit({ op: "set-key", vkey: "K_E", layer: [], output: { kind: "text", text: "ŋ" } });
    expect(r).toEqual({ ok: false, reason: "no-host" });
    expect(fileText()).toBe(before);
    expect(recorded()).toBeUndefined();
  });
});

describe("Copy is unchanged", () => {
  it("a Layout-tab edit lands in the working IR and the log, not in any file", () => {
    resetStores();
    const vfs = createVirtualFS([{ path: KMN_PATH, content: KMN, isBinary: false }]);
    const ir = parseKmn(KMN, ID).ir;
    useWorkingCopyStore.setState({ ir, startIr: ir, startVfs: vfs, startKeyboard: KB, instantiationMode: "new-from-base", undoStack: [] });
    useRulesDemoArtifactStore.getState().setArtifact(makeReadyRulesDemoArtifact(`blob:${ID}`, ID));
    const r = useWorkingCopyStore.getState().commitKmnEdit({ op: "set-key", vkey: "K_E", layer: [], output: { kind: "text", text: "ŋ" } });
    expect(r.ok).toBe(true);
    expect(readVfsText(vfs, KMN_PATH)).toBe(KMN);
    expect(useWorkingCopyStore.getState().undoStack.some((e) => e.k === "l")).toBe(true);
    expect(recorded()?.entries).toHaveLength(1);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });
});

// -- the corpus -----------------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const KEYBOARDS_ROOT = resolve(HERE, "../../../../../keyboards");
const PROXY = "http://corpus.invalid";
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

describe("one set-key on sample keyboards of the corpus, placed precisely", () => {
  for (const id of ["basic_kbdus", "akan", "sil_cameroon_qwerty"]) {
    it(id, async () => {
      const folder = join(KEYBOARDS_ROOT, "release", sampleKeyboardRelativePath(id));
      const meta = parseKps(readFileSync(join(folder, "source", `${id}.kps`), "utf8"));
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
      const path = `source/${id}.kmn`;
      const text0 = readVfsText(vfs, path)!;
      const ir0 = parseKmn(text0, id).ir;
      useWorkingCopyStore.getState().instantiateFromExisting(kb, { vfs, ir: ir0 });
      useRulesDemoArtifactStore.getState().setArtifact(makeReadyRulesDemoArtifact(`blob:${id}`, id));
      const before = readVfsText(useWorkingCopyStore.getState().startVfs!, path)!;
      const probe = ["K_Q", "K_W", "K_E", "K_R", "K_T", "K_Y", "K_A", "K_S", "K_D"];
      let applied = false;
      for (const vkey of probe) {
        const r = useWorkingCopyStore.getState().commitKmnEdit({ op: "set-key", vkey, layer: [], output: { kind: "text", text: "ŋ" } });
        if (!r.ok) continue;
        applied = true;
        const after = readVfsText(useWorkingCopyStore.getState().startVfs!, path)!;
        expect(after, `${id} ${vkey}`).not.toBe(before);
        expect(count(after, "U+014B"), `${id} ${vkey}: once`).toBeGreaterThanOrEqual(1);
        expect(missingLines(before, after).length, `${id} ${vkey}: lines lost`).toBeLessThanOrEqual(3);
        expect(missingLines(after, before).length, `${id} ${vkey}: lines added`).toBeLessThanOrEqual(3);
        expect(useOpenUndoStore.getState().records).toHaveLength(1);
        expect(undoLastOpenApply().ok).toBe(true);
        expect(readVfsText(useWorkingCopyStore.getState().startVfs!, path)).toBe(before);
        break;
      }
      expect(applied, `${id}: some key could be set`).toBe(true);
    }, 60_000);
  }
});
