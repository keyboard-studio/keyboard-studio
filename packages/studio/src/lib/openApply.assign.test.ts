// openApply kind `assign` (spec 111 "live files", slice S2): a Mechanisms
// assignment on Open is written into the .kmn, the on-screen keyboard (.kvks)
// and the touch layout in ONE applied change, and everything else in those
// files stays byte-identical. Real engine and projection; the pattern lookup
// is the only stand-in.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  createVirtualFS,
  makePattern,
  type MechanismAssignment,
  type Pattern,
  type StartKeyboard,
} from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useOpenAssignStore, assignmentFingerprint } from "../stores/openAssignStore.ts";
import { useOpenRemovalStore } from "../stores/openRemovalStore.ts";
import { useOpenUndoStore } from "../stores/openUndoStore.ts";
import { useWorkingCopyTransform } from "../hooks/useWorkingCopyTransform.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { applyOpenChange, undoLastOpenApply } from "./openApply.ts";
import { readVfsText } from "./vfsText.ts";

const SWAP: Pattern = makePattern({
  id: "simple_swap",
  title: "simple_swap",
  description: "simple_swap",
  category: "desktop",
  appliesTo: [],
  questions: [{ id: "kmnRules", prompt: "kmnRules", answerType: "text" as const }],
  kmnFragment: "{{kmnRules}}\n",
  tests: [],
  validatedForFamilies: [],
  sourceKeyboards: [],
  reviewedBy: "",
  reviewDate: "2026-10-29",
});
const WITH_STORE: Pattern = makePattern({
  id: "test_store_method",
  title: "test_store_method",
  description: "test_store_method",
  category: "desktop",
  appliesTo: [],
  questions: [],
  kmnFragment: "store(tonal) 'ab'\n+ [K_Q] > 'q'\n",
  tests: [],
  validatedForFamilies: [],
  sourceKeyboards: [],
  reviewedBy: "",
  reviewDate: "2026-10-29",
});
const WITH_SYSTEM_STORE: Pattern = makePattern({
  id: "test_system_store_method",
  title: "test_system_store_method",
  description: "test_system_store_method",
  category: "desktop",
  appliesTo: [],
  questions: [],
  kmnFragment: "store(&NAME) 'Hijack'\n+ [K_Q] > 'q'\n",
  tests: [],
  validatedForFamilies: [],
  sourceKeyboards: [],
  reviewedBy: "",
  reviewDate: "2026-10-29",
});
const LAYER_SWITCH: Pattern = makePattern({
  id: "modifier_as_layer_switch",
  title: "modifier_as_layer_switch",
  description: "modifier_as_layer_switch",
  category: "desktop",
  appliesTo: [],
  questions: [{ id: "kmnRules", prompt: "kmnRules", answerType: "text" as const }],
  kmnFragment: "{{kmnRules}}\n",
  tests: [],
  validatedForFamilies: [],
  sourceKeyboards: [],
  reviewedBy: "",
  reviewDate: "2026-10-29",
});
const PATTERNS = new Map([SWAP, WITH_STORE, WITH_SYSTEM_STORE, LAYER_SWITCH].map((p) => [p.id, p] as const));

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
  getPatternByIdSync: (id: string) => PATTERNS.get(id),
}));

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const KVKS_PATH = `source/${ID}.kvks`;
const TOUCH_PATH = `source/${ID}.keyman-touch-layout`;

const KVKS = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  "<visualkeyboard>",
  "<header><version>10.0</version><kbdname>tiny</kbdname><flags><useunderlying/></flags></header>",
  '<encoding name="unicode" fontname="Arial" fontsize="-12">',
  '<layer shift="">',
  '<key vkey="K_A">a</key>',
  '<key vkey="K_E">e</key>',
  "</layer>",
  "</encoding>",
  "</visualkeyboard>",
  "",
].join("\n");

const TOUCH_OBJ = {
  phone: {
    font: "Tahoma",
    layer: [
      {
        id: "default",
        row: [
          {
            id: 1,
            key: [
              { id: "K_A", text: "a" },
              { id: "K_E", text: "e" },
            ],
          },
        ],
      },
    ],
  },
};
const TOUCH = JSON.stringify(TOUCH_OBJ, null, 2);

function kmnText(eol: string, extraStore = ""): string {
  return [
    "c a hand-written comment",
    "store(&NAME) 'Tiny'",
    "store(&VERSION) '10.0'",
    "store(&VISUALKEYBOARD) 'tiny.kvks'",
    "store(&LAYOUTFILE) 'tiny.keyman-touch-layout'",
    ...(extraStore === "" ? [] : [extraStore]),
    "",
    "begin Unicode > use(main)",
    "",
    "group(main) using keys",
    "+ [K_A] > 'a'   c keep this spacing",
    "+ [K_B] > 'b'",
    "",
  ].join(eol);
}

const KB = {
  id: ID,
  path: `release/t/${ID}`,
  script: "Latn",
  targets: ["desktop"],
  displayName: "Tiny",
  version: "1.0",
  languages: ["en"],
} as StartKeyboard;

function open(eol = "\n", extraStore = ""): { kmn: string; kvks: string; touch: string } {
  useOpenRemovalStore.getState().clear();
  useOpenUndoStore.getState().clear();
  useOpenAssignStore.getState().clear();
  const kmn = kmnText(eol, extraStore);
  const vfs = createVirtualFS([
    { path: KMN_PATH, content: kmn, isBinary: false },
    { path: KVKS_PATH, content: KVKS, isBinary: false },
    { path: TOUCH_PATH, content: TOUCH, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
  ]);
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  wc.instantiateFromExisting(KB, { vfs, ir: parseKmn(kmn, ID).ir });
  wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
  wc.setFallbackPolicy("pass-through");
  return { kmn, kvks: KVKS, touch: TOUCH };
}

const files = () => {
  const vfs = useWorkingCopyStore.getState().startVfs!;
  return { kmn: readVfsText(vfs, KMN_PATH)!, kvks: readVfsText(vfs, KVKS_PATH)!, touch: readVfsText(vfs, TOUCH_PATH)! };
};

function swap(target: string, rule: string): MechanismAssignment {
  return {
    scope: "individual",
    target,
    modality: "physical",
    mechanisms: [{ patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules: rule } }],
    source: "user",
  };
}
const storeMethod = (): MechanismAssignment => ({
  scope: "individual",
  target: "q",
  modality: "physical",
  mechanisms: [{ patternId: "test_store_method", strategyId: "S-02" }],
  source: "user",
});

const systemStoreMethod = (): MechanismAssignment => ({
  scope: "individual",
  target: "q",
  modality: "physical",
  mechanisms: [{ patternId: "test_system_store_method", strategyId: "S-02" }],
  source: "user",
});

const lines = (s: string) => s.split(/\r?\n/);

async function routesAgree(): Promise<void> {
  const s = useWorkingCopyStore.getState();
  const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: ID }));
  const preview = createVirtualFS(s.startVfs!.entries());
  result.current!(preview, ID);
  const projected = await projectWorkingCopyForOutput();
  const strip = (t: string) => t.split(/(?<=\n)/).filter((l) => !/&KEYBOARDVERSION|&VERSION/i.test(l)).join("");
  for (const path of [KMN_PATH, KVKS_PATH, TOUCH_PATH]) {
    const stored = readVfsText(s.startVfs!, path)!;
    expect(strip(readVfsText(preview, path)!)).toBe(strip(stored));
    expect(strip(projected!.vfs.get(path)!.content as string)).toBe(strip(stored));
  }
}

/** Every replay field the projection reads, on Open. */
function expectReplayEmpty(): void {
  const s = useWorkingCopyStore.getState();
  expect(s.phaseResults.find((p) => p.phase === "C")?.assignments ?? []).toEqual([]);
  expect(s.deletedNodeIds.size).toBe(0);
  expect(s.deletedItemIds.size).toBe(0);
  expect(s.carveChars.size).toBe(0);
  expect(s.disabledFamilyIds.size).toBe(0);
  expect(s.deletedTouchKeyIds.size).toBe(0);
  expect(s.carveTouchKeepInert).toEqual([]);
  expect(s.deadkeyOverlay.ops).toEqual([]);
  expect(s.keyEditOverlay.ops).toEqual([]);
  expect(s.contextToleranceOverlay).toBeNull();
  expect(s.ir).toBe(s.startIr);
}

describe("applyOpenChange assign", () => {
  beforeEach(() => open());

  it.each([["\n"], ["\r\n"]])(
    "adds only the new lines to the .kmn, only the key's label to the .kvks and touch file (eol %j), and every route agrees",
    async (eol) => {
      const before = open(eol);
      const a = swap("ɛ", "+ [K_E] > U+025B");
      const result = applyOpenChange({ kind: "assign", add: [a], remove: [] });
      expect(result.status).toBe("applied");
      const after = files();

      // .kmn: every original line is still there, in order; the rest is the new rule.
      const orig = lines(before.kmn);
      const now = lines(after.kmn);
      // (the fragment brings its own blank separator line, as on Copy)
      const at = now.indexOf("+ [K_E] > U+025B");
      expect(at).toBeGreaterThan(-1);
      expect(now[at + 1]).toBe("");
      expect([...now.slice(0, at), ...now.slice(at + 2)]).toEqual(orig);
      if (eol === "\r\n") expect(after.kmn).not.toMatch(/[^\r]\n/);

      // .kvks: identical except the K_E label.
      expect(after.kvks).toBe(before.kvks.replace('<key vkey="K_E">e</key>', '<key vkey="K_E">ɛ</key>'));
      // touch: identical as data except that key's text.
      const expected = structuredClone(TOUCH_OBJ);
      expected.phone.layer[0]!.row[0]!.key[1]!.text = "ɛ";
      expect(JSON.parse(after.touch)).toEqual(expected);
      expect(after.touch).toBe(JSON.stringify(expected, null, 2));

      // The applied method reads as existing content from the re-parsed model.
      const s = useWorkingCopyStore.getState();
      expect(s.startIr!.groups.flatMap((g) => g.rules).some((r) => JSON.stringify(r.context).includes("K_E"))).toBe(true);
      expectReplayEmpty();
      await routesAgree();
    },
  );

  it("a rule that shadows one of the keyboard's own is applied as the output does, and unassign restores every file byte-for-byte", async () => {
    const before = open("\r\n");
    const a = swap("ɐ", "+ [K_A] > U+0250");
    expect(applyOpenChange({ kind: "assign", add: [a], remove: [] }).status).toBe("applied");
    expect(files().kmn).not.toContain("> 'a'   c keep this spacing");
    await routesAgree();

    expect(applyOpenChange({ kind: "assign", add: [], remove: [assignmentFingerprint(a)] }).status).toBe("applied");
    expect(files()).toEqual({ kmn: before.kmn, kvks: before.kvks, touch: before.touch });
    expect(useOpenAssignStore.getState().session).toBeNull();
    expectReplayEmpty();
  });

  it("unassign takes back only its own rules after unrelated edits, and refuses with a reason once those rules were edited in code", () => {
    const before = open("\n");
    const a = swap("ɛ", "+ [K_E] > U+025B");
    const b = swap("ʃ", "+ [K_S] > U+0283");
    expect(applyOpenChange({ kind: "assign", add: [a], remove: [] }).status).toBe("applied");
    expect(applyOpenChange({ kind: "assign", add: [b], remove: [] }).status).toBe("applied");
    // The author edits an unrelated line in the code.
    const edited = files().kmn.replace("+ [K_B] > 'b'", "+ [K_B] > 'bb'");
    expect(applyOpenChange({ kind: "files", files: { [KMN_PATH]: edited }, label: "edit" }).status).toBe("applied");

    const r = applyOpenChange({ kind: "assign", add: [], remove: [assignmentFingerprint(a)] });
    expect(r.status).toBe("applied");
    expect(files().kmn).not.toContain("U+025B");
    expect(files().kmn).toContain("U+0283");
    expect(files().kmn).toContain("[K_B] > 'bb'");
    expect(files().kvks).toContain(">e</key>");
    expect(files().kvks).not.toContain("ɛ");

    // Now the author edits the rule b added; taking b back refuses and changes nothing.
    const edited2 = files().kmn.replace("+ [K_S] > U+0283", "+ [K_S] > U+0284");
    expect(applyOpenChange({ kind: "files", files: { [KMN_PATH]: edited2 }, label: "edit" }).status).toBe("applied");
    const snapshot = files();
    const refused = applyOpenChange({ kind: "assign", add: [], remove: [assignmentFingerprint(b)] });
    expect(refused).toMatchObject({ status: "failed", refused: true, code: "rules-edited" });
    expect(files()).toEqual(snapshot);
    expect(before.kmn).not.toBe(snapshot.kmn);
  });

  it("refuses to overwrite a store the keyboard already has, and says which", () => {
    const before = open("\n", "store(tonal) 'xy'");
    const result = applyOpenChange({ kind: "assign", add: [storeMethod()], remove: [] });
    expect(result).toMatchObject({ status: "failed", refused: true, code: "store-collision", params: { store: "tonal" } });
    expect(files().kmn).toBe(before.kmn);
    expect(useOpenAssignStore.getState().session).toBeNull();
  });

  it("compares store names case-insensitively, as kmcmplib's duplicate-store check does", () => {
    // docs/lint.md "Duplicate store names" (CheckForDuplicates.cpp): case-insensitive, system stores exempt.
    const before = open("\n", "store(Tonal) 'xy'");
    const result = applyOpenChange({ kind: "assign", add: [storeMethod()], remove: [] });
    expect(result).toMatchObject({ status: "failed", refused: true, code: "store-collision" });
    expect(files().kmn).toBe(before.kmn);
  });

  it("never writes a system store from a method's fragment", () => {
    const before = open("\n");
    const result = applyOpenChange({ kind: "assign", add: [systemStoreMethod()], remove: [] });
    expect(result.status).toBe("applied");
    expect(files().kmn).toContain("store(&NAME) 'Tiny'");
    expect(files().kmn).not.toContain("Hijack");
    expect(files().kmn).toContain("[K_Q]");
    expect(before.kmn).toContain("store(&NAME) 'Tiny'");
  });

  it("changes only the key's label in a touch file that is not in the engine's layout (every other byte kept)", () => {
    const odd = '{\n\t"phone": {"font":"Tahoma",\n\t\t"layer":[{"id":"default","row":[{"id":1,"key":[{"id":"K_A","text":"a"},{"id":"K_E","text":"e"}]}]}]}\n}\n';
    open("\n");
    const wc = useWorkingCopyStore.getState();
    wc.replaceStartingPointFiles({ [TOUCH_PATH]: odd });
    const a = swap("ɛ", "+ [K_E] > U+025B");
    expect(applyOpenChange({ kind: "assign", add: [a], remove: [] }).status).toBe("applied");
    expect(files().touch).toBe(odd.replace('"text":"e"', '"text":"ɛ"'));
    expect(applyOpenChange({ kind: "assign", add: [], remove: [assignmentFingerprint(a)] }).status).toBe("applied");
    expect(files().touch).toBe(odd);
  });

  it("places an added touch layer in the file's own text (no consent), and undo keeps every byte", () => {
    const odd = '{\n\t"phone": {"font":"Tahoma",\n\t\t"layer":[{"id":"default","row":[{"id":1,"key":[{"id":"K_A","text":"a"},{"id":"K_E","text":"e"}]}]}]}\n}\n';
    open("\n");
    useWorkingCopyStore.getState().replaceStartingPointFiles({ [TOUCH_PATH]: odd });
    const a: MechanismAssignment = {
      scope: "individual",
      target: "ɛ",
      modality: "physical",
      mechanisms: [{ patternId: "modifier_as_layer_switch", strategyId: "S-01", slotValues: { kmnRules: "+ [RALT K_E] > U+025B" } }],
      source: "user",
    };
    const result = applyOpenChange({ kind: "assign", add: [a], remove: [] });
    expect(result.status).toBe("applied");
    const touch = files().touch;
    expect(JSON.parse(touch).phone.layer.length).toBeGreaterThan(1);
    // The file's own head is untouched: only layers were added after it.
    expect(touch.startsWith(odd.slice(0, odd.indexOf('"layer":[{"id":"default"')))).toBe(true);
    // Placed in the file's own compact layout, not re-serialised wholesale.
    expect(touch).toContain('"layer":[{"id":"default","row":[{"id":1,"key":[{"id":"K_A","text":"a"');
    expect(touch.split("\n")).toHaveLength(odd.split("\n").length);
    expect(undoLastOpenApply().ok).toBe(true);
    expect(files().touch).toBe(odd);
  });

  it("adds a store the keyboard does not have, and unassign removes it again", () => {
    const before = open("\n");
    const m = storeMethod();
    expect(applyOpenChange({ kind: "assign", add: [m], remove: [] }).status).toBe("applied");
    const kmn = files().kmn;
    expect(kmn).toContain("store(tonal) 'ab'");
    expect(kmn.indexOf("store(tonal)")).toBeLessThan(kmn.indexOf("begin Unicode"));
    expect(applyOpenChange({ kind: "assign", add: [], remove: [assignmentFingerprint(m)] }).status).toBe("applied");
    expect(files().kmn).toBe(before.kmn);
  });

  it("undo puts the files and the session list back", () => {
    const before = open("\n");
    const a = swap("ɛ", "+ [K_E] > U+025B");
    expect(applyOpenChange({ kind: "assign", add: [a], remove: [] }).status).toBe("applied");
    expect(useOpenAssignStore.getState().session?.assignments).toHaveLength(1);
    expect(undoLastOpenApply().ok).toBe(true);
    expect(files()).toEqual({ kmn: before.kmn, kvks: before.kvks, touch: before.touch });
    expect(useOpenAssignStore.getState().session).toBeNull();
  });

  it("holds nothing as an overlay: held rule additions are written first, as their own step", () => {
    open("\n");
    const start = useWorkingCopyStore.getState().startIr!;
    const next = structuredClone(start);
    const group = next.groups.find((g) => !g.readonly)!;
    const extra = { ...structuredClone(group.rules[0]!), nodeId: "narrow#1", output: [{ kind: "char" as const, value: "z" }], rulesStepAdded: true as const };
    delete (extra as { sourceLine?: number }).sourceLine;
    group.rules.splice(1, 0, extra);
    useWorkingCopyStore.getState().setWorkingIR(next);
    const a = swap("ɛ", "+ [K_E] > U+025B");
    expect(applyOpenChange({ kind: "assign", add: [a], remove: [] }).status).toBe("applied");
    expect(files().kmn).toContain("U+007A");
    expect(files().kmn).toContain("U+025B");
    expectReplayEmpty();
  });
});
