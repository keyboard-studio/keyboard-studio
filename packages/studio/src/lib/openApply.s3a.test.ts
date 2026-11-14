// Slice S3a (spec 111 "live files", FR-042): on Open nothing replays decisions
// over the files, a code-view edit is an undoable applied change, the output
// does not re-apply what is already in the file, and the id rename is skipped.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { MARKS_GUARD_GROUP, parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useOpenRemovalStore } from "../stores/openRemovalStore.ts";
import { useOpenUndoStore } from "../stores/openUndoStore.ts";
import { useOpenAssignStore } from "../stores/openAssignStore.ts";
import { useGuardIntentStore } from "../stores/guardIntentStore.ts";
import { useDecisionStore, getDecisionSnapshot } from "../stores/decisionStore.ts";
import { recordMarksTreatmentValue, type MarksTreatmentValue } from "../survey/marks/marksValue.ts";
import { useWorkingCopyTransform } from "../hooks/useWorkingCopyTransform.ts";
import {
  rebuildWorkingCopyFromStores,
  recalculateForStartingPointChangeFromStores,
} from "../decisions/rebuildWorkingCopy.ts";
import type { DecisionSet } from "../decisions/decisionTypes.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";
import { capsHandlingFromDecisions } from "./projectionInput.ts";
import { createStudioReducerDeps } from "./studioReducerDeps.ts";
import { applyOpenChange, undoLastOpenApply } from "./openApply.ts";
import { readVfsText } from "./vfsText.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
  getPatternByIdSync: () => undefined,
}));

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const ACUTE = "́";
const KB = {
  id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"],
  displayName: "Tiny", version: "1.0", languages: ["en"],
} as StartKeyboard;

function kmn(eol = "\r\n"): string {
  return [
    "c hand-written",
    "store(&NAME) 'Tiny'",
    "store(&VERSION) '10.0'",
    "",
    "begin Unicode > use(main)",
    "",
    "group(main) using keys",
    "+ [K_A] > 'a'   c keep this spacing",
    "+ [SHIFT K_A] > 'A'",
    "+ [K_B] > 'b'",
    "+ [K_C] > 'c'",
    "",
  ].join(eol);
}

function open(eol = "\r\n"): string {
  useOpenRemovalStore.getState().clear();
  useOpenUndoStore.getState().clear();
  useOpenAssignStore.getState().clear();
  useGuardIntentStore.getState().resetForTest();
  useDecisionStore.getState().reset();
  const text = kmn(eol);
  const vfs = createVirtualFS([
    { path: KMN_PATH, content: text, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
  ]);
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  wc.instantiateFromExisting(KB, { vfs, ir: parseKmn(text, ID).ir });
  wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
  wc.setFallbackPolicy("pass-through");
  return text;
}

const fileText = (): string => readVfsText(useWorkingCopyStore.getState().startVfs!, KMN_PATH)!;
const ruleIdFor = (vkey: string): string => {
  const ir = useWorkingCopyStore.getState().startIr!;
  const r = ir.groups.flatMap((g) => g.rules).find((x) => x.context.some((c) => c.kind === "vkey" && c.name === vkey));
  return r!.nodeId;
};
const noVersion = (t: string): string =>
  t.split(/(?<=\n)/).filter((l) => !/&KEYBOARDVERSION|&VERSION/i.test(l)).join("");

afterEach(() => cleanup());

describe("SC-011: a code edit does not bring a removed rule back or remove another", () => {
  beforeEach(() => open());

  it("remove a rule, insert a rule above it in the code view and apply", async () => {
    expect(applyOpenChange({ kind: "remove", itemIds: [ruleIdFor("K_B")], chars: ["b"] }).status).toBe("applied");
    expect(fileText()).not.toContain("[K_B]");

    // The code view: insert a new rule ABOVE the removed rule's old place.
    const edited = fileText().replace("+ [SHIFT K_A] > 'A'\r\n", "+ [SHIFT K_A] > 'A'\r\n+ [K_Z] > 'z'\r\n");
    expect(edited).not.toBe(fileText());
    expect(applyOpenChange({ kind: "files", files: { [KMN_PATH]: edited }, label: "Edit" }).status).toBe("applied");

    const text = fileText();
    expect(text).not.toContain("[K_B]");
    for (const keep of ["[K_A] > 'a'", "[SHIFT K_A] > 'A'", "[K_Z] > 'z'", "[K_C] > 'c'"]) {
      expect(text).toContain(keep);
    }
    // Nothing replays later either.
    rebuildWorkingCopyFromStores(["physical-layout"]);
    recalculateForStartingPointChangeFromStores();
    expect(fileText()).toBe(text);

    // Working copy, preview and download are one text.
    const s = useWorkingCopyStore.getState();
    expect(emitCount(s.startIr!)).toBe(4);
    const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: ID }));
    const preview = createVirtualFS(s.startVfs!.entries());
    result.current!(preview, ID);
    const projected = await projectWorkingCopyForOutput();
    expect(noVersion(readVfsText(preview, KMN_PATH)!)).toBe(noVersion(text));
    expect(noVersion(projected!.vfs.get(KMN_PATH)!.content as string)).toBe(noVersion(text));
  });
});

function emitCount(ir: { groups: { rules: unknown[] }[] }): number {
  return ir.groups.reduce((n, g) => n + g.rules.length, 0);
}

describe("no replay on Open (FR-042)", () => {
  beforeEach(() => open());

  it("a code edit, a tool change and a decision change leave the working copy as the files say", () => {
    const snapshot = () => {
      const s = useWorkingCopyStore.getState();
      return { ir: s.ir, startIr: s.startIr, vfs: s.startVfs, text: fileText() };
    };
    const decisionsBefore = getDecisionSnapshot();

    const edited = fileText().replace("+ [K_C] > 'c'", "+ [K_C] > 'c'   c edited");
    expect(applyOpenChange({ kind: "files", files: { [KMN_PATH]: edited }, label: "Edit" }).status).toBe("applied");
    let before = snapshot();
    expect(rebuildWorkingCopyFromStores(["physical-layout"])).toBeNull();
    expect(recalculateForStartingPointChangeFromStores()).toBeNull();
    expect(snapshot()).toEqual(before);
    expect(snapshot().ir).toBe(before.ir);
    expect(snapshot().vfs).toBe(before.vfs);

    expect(applyOpenChange({ kind: "remove", itemIds: [ruleIdFor("K_B")], chars: ["b"] }).status).toBe("applied");
    before = snapshot();
    expect(rebuildWorkingCopyFromStores(["physical-layout", "character-inventory"])).toBeNull();
    expect(recalculateForStartingPointChangeFromStores()).toBeNull();
    expect(snapshot().vfs).toBe(before.vfs);
    expect(snapshot().text).toBe(before.text);

    // Replay writes no derived records either.
    expect(getDecisionSnapshot()).toEqual(decisionsBefore);
  });

  it("the reducer's rebuild and its ir patch go through the seam, not into a working IR", () => {
    const deps = createStudioReducerDeps({
      instantiateFromStart: vi.fn(),
      clearTouchSeedChoice: vi.fn(),
      recordDecision: vi.fn() as never,
    });
    const before = useWorkingCopyStore.getState();
    deps.rebuildFromDecisions?.(["physical-layout"]);
    expect(useWorkingCopyStore.getState().ir).toBe(before.ir);
    deps.applyWorkingCopyPatch?.({ ir: {} } as never, [] as never);
    const after = useWorkingCopyStore.getState();
    // `setWorkingIR` would have replaced `ir` with a copy; the seam leaves
    // it equal to `startIr` (the files are what the model is read from).
    expect(after.ir).toBe(after.startIr);
    expect(fileText()).toBe(kmn());
  });
});

describe("code-view apply is one undo step (FR-045)", () => {
  beforeEach(() => open());

  it("logs a record and undo puts the file and its model back", () => {
    const before = fileText();
    const edited = before.replace("+ [K_C] > 'c'", "+ [K_C] > 'c'   c edited");
    const r = applyOpenChange({ kind: "files", files: { [KMN_PATH]: edited }, label: "Edit the keyboard source in the code view" });
    expect(r.status).toBe("applied");
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    expect(useOpenUndoStore.getState().records[0]!.label).toContain("code view");
    expect(undoLastOpenApply().ok).toBe(true);
    expect(fileText()).toBe(before);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
    const s = useWorkingCopyStore.getState();
    expect(s.ir).toBe(s.startIr);
  });

  it("a text that does not parse as a keyboard is refused and nothing is written or logged", () => {
    const before = fileText();
    const klc = 'KBD\tXYZ\t"Example Layout"\r\nLAYOUT\r\n10\tQ\t1\tq\tQ\t-1\r\nENDKBD\r\n';
    expect(applyOpenChange({ kind: "files", files: { [KMN_PATH]: klc }, label: "Edit" }).status).toBe("failed");
    expect(fileText()).toBe(before);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });
});

describe("output on Open does not re-apply what is in the file", () => {
  const VALUE: MarksTreatmentValue = {
    answers: {},
    completion: {
      worklist: {
        ownLetterUnits: ["a", "k"],
        markUnits: [{ mark: ACUTE, inputOrder: "postfix" }],
        blockedCombinations: [{ base: "k", mark: ACUTE }],
      },
      outputForm: "base-plus-mark",
    } as unknown as MarksTreatmentValue["completion"],
    contextTolerance: null,
  };
  beforeEach(() => open());

  it("a recorded marks decision is a record: the download and preview carry no guards the file lacks", async () => {
    recordMarksTreatmentValue(VALUE);
    const text = fileText();
    const projected = await projectWorkingCopyForOutput();
    expect(noVersion(projected!.vfs.get(KMN_PATH)!.content as string)).toBe(noVersion(text));
    expect(projected!.vfs.get(KMN_PATH)!.content as string).not.toContain(`group(${MARKS_GUARD_GROUP})`);
    const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: ID }));
    const preview = createVirtualFS(useWorkingCopyStore.getState().startVfs!.entries());
    result.current!(preview, ID);
    expect(readVfsText(preview, KMN_PATH)).toBe(text);
  });

  it("after the guards are applied the output equals the file apart from version", async () => {
    recordMarksTreatmentValue(VALUE);
    expect(applyOpenChange({ kind: "marks" }).status).toBe("applied");
    const projected = await projectWorkingCopyForOutput();
    expect(noVersion(projected!.vfs.get(KMN_PATH)!.content as string)).toBe(noVersion(fileText()));
  });
});

describe("caps and id rename on Open (T082c)", () => {
  function projectOnOpen(extra: Partial<Parameters<typeof projectWorkingCopyVfs>[0]>) {
    const text = open("\r\n");
    const s = useWorkingCopyStore.getState();
    const vfs = createVirtualFS(s.startVfs!.entries());
    const result = projectWorkingCopyVfs({
      vfs,
      keyboardId: ID,
      startIr: s.startIr!,
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
      openMode: { kps: { nameEdited: false }, consentedReemit: true },
      ...extra,
    });
    return { text, vfs, result };
  }

  it("the id rename never runs: files stay under the keyboard's own id, with a warning", () => {
    const { text, vfs, result } = projectOnOpen({ targetKeyboardId: "renamed" });
    expect(result.effectiveKeyboardId).toBeUndefined();
    expect(vfs.get("source/renamed.kmn")).toBeUndefined();
    expect(readVfsText(vfs, KMN_PATH)).toBe(text);
    expect(result.warnings.some((w) => w.includes("cannot change"))).toBe(true);
  });

  it("an answered caps decision is spliced into the file, not a whole re-emit", () => {
    const { text, vfs } = projectOnOpen({ capsHandling: { mode: "cased-keys" } });
    const out = readVfsText(vfs, KMN_PATH)!;
    expect(out).not.toBe(text);
    expect(out).toContain("&CasedKeys");
    // Lines the caps step has no reason to touch are byte-identical, CRLF kept.
    expect(out).toContain("c hand-written\r\n");
    expect(out).toContain("+ [K_B] > 'b'\r\n");
    expect(out).toContain("+ [K_A] > 'a'   c keep this spacing");
    expect(out).not.toMatch(/[^\r]\n/);
  });

  it("only an asked caps value counts on Open; a seeded default or extracted one is a record", () => {
    const of = (provenance: string): DecisionSet =>
      ({
        "caps-handling": { id: "caps-handling", value: { mode: "cased-keys" }, provenance },
        "character-inventory": { id: "character-inventory", value: { chars: ["a", "b"] }, provenance: "asked" },
      }) as unknown as DecisionSet;
    expect(capsHandlingFromDecisions(of("default"))).toEqual({ mode: "cased-keys" });
    expect(capsHandlingFromDecisions(of("default"), { askedOnly: true })).toBeUndefined();
    expect(capsHandlingFromDecisions(of("extracted"), { askedOnly: true })).toBeUndefined();
    expect(capsHandlingFromDecisions(of("asked"), { askedOnly: true })).toEqual({ mode: "cased-keys" });
  });
});
