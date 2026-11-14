// An assignment is verified before ANYTHING is written (spec 111 live files):
// a refusal or a declined consent leaves the files, the held overlays and the
// undo log exactly as they were, and held overlays go in with the assignment
// as their own step only once it has been accepted.
//
// No fixture makes the engine ask for a reformat of the guard group any more
// (it now places a new group precisely), so the guard-consent test wraps
// `projectWorkingCopyVfs` and reports `reformatRequired` for the guard run,
// leaving that file as the real projection would.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS, makePattern, type IRRule, type MechanismAssignment, type StartKeyboard } from "@keyboard-studio/contracts";
import { MARKS_GUARD_GROUP, parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { clearOpenSession, useOpenUndoStore } from "../stores/openUndoStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { recordMarksTreatmentValue } from "../survey/marks/marksValue.ts";
import { applyOpenChange } from "./openApply.ts";
import { readVfsText } from "./vfsText.ts";

const frag = (id: string, kmnFragment: string) =>
  makePattern({
    id, title: id, description: id, category: "desktop", appliesTo: [],
    questions: id === "simple_swap" ? [{ id: "kmnRules", prompt: "kmnRules", answerType: "text" as const }] : [],
    kmnFragment, tests: [], validatedForFamilies: [], sourceKeyboards: [], reviewedBy: "", reviewDate: "2026-10-29",
  });
const PATTERNS = new Map(
  [
    frag("simple_swap", "{{kmnRules}}\n"),
    frag("store_lower", "store(tonal) 'ab'\n+ [K_Q] > 'q'\n"),
    frag("store_upper", "store(Tonal) 'cd'\n+ [K_W] > 'w'\n"),
  ].map((p) => [p.id, p] as const),
);
const control = vi.hoisted(() => ({ forceGuardReformat: false }));
vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
  getPatternByIdSync: (id: string) => PATTERNS.get(id),
}));
vi.mock("./projectWorkingCopyVfs.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("./projectWorkingCopyVfs.ts")>();
  return {
    ...real,
    projectWorkingCopyVfs: (input: Parameters<typeof real.projectWorkingCopyVfs>[0]) => {
      const guardRun =
        control.forceGuardReformat &&
        input.marksGuards != null &&
        input.assignments.length === 0 &&
        input.openMode?.consentedReemit !== true;
      const path = `source/${input.keyboardId}.kmn`;
      const kept = guardRun ? readVfsText(input.vfs, path) : undefined;
      const result = real.projectWorkingCopyVfs(input);
      if (!guardRun || kept === undefined) return result;
      input.vfs.set(path, kept, false);
      return { ...result, reformatRequired: [path] };
    },
  };
});

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const KMN = [
  "store(&NAME) 'Tiny'", "store(tonal) 'xy'", "begin Unicode > use(main)", "group(main) using keys",
  "+ [K_A] > 'a'", "+ [K_G] > 'g'", "",
].join("\n");
const KB = { id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"], displayName: "Tiny", version: "1.0", languages: ["en"] } as StartKeyboard;
const MARKS = {
  answers: {},
  completion: {
    worklist: { ownLetterUnits: ["a", "k"], markUnits: [{ mark: "́", inputOrder: "postfix" }], blockedCombinations: [{ base: "k", mark: "́" }] },
    outputForm: "base-plus-mark",
  },
  contextTolerance: null,
} as never;

const text = () => readVfsText(useWorkingCopyStore.getState().startVfs!, KMN_PATH)!;
const swap = (rule: string): MechanismAssignment => ({
  scope: "individual", target: "ɛ", modality: "physical", source: "user",
  mechanisms: [{ patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules: rule } }],
});
const method = (patternId: string, target: string): MechanismAssignment => ({
  scope: "individual", target, modality: "physical", source: "user",
  mechanisms: [{ patternId, strategyId: "S-02" }],
});

function holdNarrowException(): void {
  const next = structuredClone(useWorkingCopyStore.getState().startIr!);
  const group = next.groups.find((g) => !g.readonly)!;
  const extra = { ...structuredClone(group.rules[0]!), nodeId: "narrow#1", output: [{ kind: "char" as const, value: "z" }], rulesStepAdded: true as const } as IRRule;
  delete (extra as { sourceLine?: number }).sourceLine;
  group.rules.splice(1, 0, extra);
  useWorkingCopyStore.getState().setWorkingIR(next);
}

beforeEach(() => {
  control.forceGuardReformat = false;
  clearOpenSession();
  useDecisionStore.getState().reset();
  const vfs = createVirtualFS([
    { path: KMN_PATH, content: KMN, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
  ]);
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  wc.instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, ID).ir });
  wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
  wc.setFallbackPolicy("pass-through");
});

describe("a held overlay is not written ahead of an assignment that is not applied", () => {
  it("a refused assignment (store collision) leaves files, overlay and undo log as they were", () => {
    holdNarrowException();
    const before = useWorkingCopyStore.getState();
    const vfsBefore = before.startVfs;
    const result = applyOpenChange({ kind: "assign", add: [method("store_lower", "q")], remove: [] });
    expect(result).toMatchObject({ status: "failed", refused: true, code: "store-collision" });
    const after = useWorkingCopyStore.getState();
    expect(after.startVfs).toBe(vfsBefore);
    expect(text()).toBe(KMN);
    expect(useOpenUndoStore.getState().records).toEqual([]);
    expect(after.ir).not.toBe(after.startIr); // the exception is still held
  });

  it("a declined consent leaves them as they were too, and consent writes the overlay and the assignment together", () => {
    holdNarrowException();
    recordMarksTreatmentValue(MARKS);
    control.forceGuardReformat = true;
    const vfsBefore = useWorkingCopyStore.getState().startVfs;
    const asked = applyOpenChange({ kind: "assign", add: [swap("+ [K_E] > U+025B")], remove: [] });
    expect(asked).toMatchObject({ status: "needs-consent" });
    expect(useWorkingCopyStore.getState().startVfs).toBe(vfsBefore);
    expect(text()).toBe(KMN);
    expect(useOpenUndoStore.getState().records).toEqual([]);

    const done = applyOpenChange({ kind: "assign", add: [swap("+ [K_E] > U+025B")], remove: [] }, { consentedReemit: true });
    expect(done.status).toBe("applied");
    expect(text()).toContain("U+025B");
    expect(text()).toContain("U+007A"); // the held exception
    expect(text()).toContain(`group(${MARKS_GUARD_GROUP})`);
    // the held overlay is its own step; assignment plus guards are ONE record
    expect(useOpenUndoStore.getState().records.map((r) => r.view.kind)).toEqual(["flush", "assign"]);
    expect(useWorkingCopyStore.getState().ir).toBe(useWorkingCopyStore.getState().startIr);
  });

  it("without held overlays, the guard consent is asked once for assignment plus guards: nothing written, then exactly one record", () => {
    recordMarksTreatmentValue(MARKS);
    control.forceGuardReformat = true;
    expect(applyOpenChange({ kind: "assign", add: [swap("+ [K_E] > U+025B")], remove: [] })).toMatchObject({ status: "needs-consent" });
    expect(text()).toBe(KMN);
    expect(useOpenUndoStore.getState().records).toEqual([]);
    expect(applyOpenChange({ kind: "assign", add: [swap("+ [K_E] > U+025B")], remove: [] }, { consentedReemit: true }).status).toBe("applied");
    const records = useOpenUndoStore.getState().records;
    expect(records).toHaveLength(1);
    expect(records[0]!.view.kind).toBe("assign");
    expect(text()).toContain("U+025B");
    expect(text()).toContain(`group(${MARKS_GUARD_GROUP})`);
  });
});

describe("store collisions inside one run", () => {
  it("two stores whose names differ only in case, added together, are refused", () => {
    // The keyboard's own `tonal` would also clash; use one without it.
    const kmn = KMN.replace("store(tonal) 'xy'\n", "");
    const vfs = createVirtualFS([{ path: KMN_PATH, content: kmn, isBinary: false }, { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false }]);
    const wc = useWorkingCopyStore.getState();
    wc.reset();
    wc.instantiateFromExisting(KB, { vfs, ir: parseKmn(kmn, ID).ir });
    const result = applyOpenChange({ kind: "assign", add: [method("store_lower", "q"), method("store_upper", "w")], remove: [] });
    expect(result).toMatchObject({ status: "failed", refused: true, code: "store-collision" });
    expect(text()).toBe(kmn);
  });
});
