// Slice S2 tools on Open (spec 111 "live files"): rule additions (Narrow,
// Missing guard), disabled families, and the marks guards are written into
// the file when applied, and nothing is held for the output to replay.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { createVirtualFS, makePattern, type StartKeyboard } from "@keyboard-studio/contracts";
import { MARKS_GUARD_GROUP, parseKmn } from "@keyboard-studio/engine";
import type { OverBroadGuard } from "@keyboard-studio/engine/kmAssist";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useOpenRemovalStore } from "../stores/openRemovalStore.ts";
import { useOpenUndoStore } from "../stores/openUndoStore.ts";
import { useOpenAssignStore } from "../stores/openAssignStore.ts";
import { useGuardIntentStore } from "../stores/guardIntentStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { recordMarksTreatmentValue, type MarksTreatmentValue } from "../survey/marks/marksValue.ts";
import { useWorkingCopyTransform } from "../hooks/useWorkingCopyTransform.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { applyOpenChange, undoLastOpenApply } from "./openApply.ts";
import { readVfsText } from "./vfsText.ts";
import { narrowOverBroadGuardOnOpen } from "../components/rules/narrowGuard.ts";
import { FamilyCardList } from "../components/rules/FamilyCardList.tsx";
import { MissingGuardCard } from "../components/rules/MissingGuardCard.tsx";
import type { MissingGuardGroup } from "../components/rules/guardAnalysis.ts";
import { OpenApplyHost } from "../components/OpenApplyHost.tsx";

const SWAP = makePattern({
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

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
  getPatternByIdSync: (id: string) => (id === "simple_swap" ? SWAP : undefined),
}));

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const ACUTE = "́";
const KB = {
  id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"],
  displayName: "Tiny", version: "1.0", languages: ["en"],
} as StartKeyboard;

function kmn(eol = "\n"): string {
  return [
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
  ].join(eol);
}

function open(eol = "\n"): string {
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
const ruleLines = (): string[] => fileText().split(/\r?\n/).filter((l) => /\+ \[|any\(|U\+/.test(l));
const ruleIdOf = (needle: string): string => {
  const ir = useWorkingCopyStore.getState().startIr!;
  const r = ir.groups.flatMap((g) => g.rules).find((x) => JSON.stringify(x.context).includes(needle));
  return r!.nodeId;
};

function expectReplayEmpty(): void {
  const s = useWorkingCopyStore.getState();
  expect(s.disabledFamilyIds.size).toBe(0);
  expect(s.deletedNodeIds.size).toBe(0);
  expect(s.deletedItemIds.size).toBe(0);
  expect(s.carveChars.size).toBe(0);
  expect(s.contextToleranceOverlay).toBeNull();
  expect(s.phaseResults.find((p) => p.phase === "C")?.assignments ?? []).toEqual([]);
  expect(s.ir).toBe(s.startIr);
}

afterEach(() => cleanup());

describe("Narrow on Open", () => {
  beforeEach(() => open());

  it("writes the exception into the file BEFORE its guard, holds nothing, and undo takes it out", async () => {
    const before = fileText();
    const guard: OverBroadGuard = {
      markKey: "K_E",
      markChar: ACUTE,
      blockedChar: "e",
      guardRuleId: ruleIdOf("K_E"),
      question: "q",
    };
    const apply = async (c: Parameters<typeof applyOpenChange>[0]) => applyOpenChange(c);
    const outcome = await narrowOverBroadGuardOnOpen(guard, apply);
    expect(outcome).not.toBeNull();
    const lines = ruleLines();
    const guardAt = lines.findIndex((l) => l.startsWith("any(blk)"));
    const excAt = lines.findIndex((l) => l.startsWith("e + [RALT K_E]"));
    expect(excAt).toBeGreaterThan(-1);
    expect(excAt).toBeLessThan(guardAt);
    expect(lines.filter((l) => l.startsWith("any(blk)"))).toHaveLength(1);
    expect(fileText().replace(/^e \+ \[RALT K_E\].*\n/m, "")).toBe(before);
    expectReplayEmpty();
    expect(useGuardIntentStore.getState().narrowedGuardQuestions.has("q")).toBe(true);
    expect(useGuardIntentStore.getState().narrowUndoStack).toEqual([]);
  });
});

describe("Missing guard on Open", () => {
  const GROUP: MissingGuardGroup = {
    store: "blk",
    familyName: "Diacritic blocking",
    missing: [{ key: "K_O", outputChar: ACUTE, suggestedStore: "blk" }],
  };
  beforeEach(() => open());

  it("Add all writes the rules into the file when applied", async () => {
    render(<OpenApplyHost><MissingGuardCard group={GROUP} /></OpenApplyHost>);
    const before = ruleLines().length;
    fireEvent.click(screen.getByTestId(/missing-guard-add-all-/));
    await waitFor(() => expect(ruleLines().length).toBe(before + 1));
    expect(fileText()).toContain("K_O");
    expectReplayEmpty();
  });
});

describe("disabled families on Open", () => {
  beforeEach(() => open());

  it("Disable group removes the family's rules from the file, Enable puts them back, nothing is held", async () => {
    const before = fileText();
    render(<OpenApplyHost><FamilyCardList /></OpenApplyHost>);
    const card = (await screen.findAllByTestId(/^family-card-disable-/))[0]!;
    const id = card.getAttribute("data-testid")!.replace("family-card-disable-", "");
    fireEvent.click(card);
    await waitFor(() => expect(fileText()).not.toBe(before));
    expectReplayEmpty();
    // The card stays, built from the record, with Enable.
    const back = await screen.findByTestId(`family-card-disable-${id}`);
    expect(back.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(back);
    await waitFor(() => expect(fileText()).toBe(before));
    expectReplayEmpty();
  });
});

describe("marks guards on Open", () => {
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
  beforeEach(() => open("\r\n"));

  it("writes the guard rules into the file without asking, once; a second apply changes nothing; every route agrees", async () => {
    recordMarksTreatmentValue(VALUE);
    // The engine splices the new group in place: no reformat, so no question.
    expect(applyOpenChange({ kind: "marks" }).status).toBe("applied");
    expect(fileText()).toContain(`group(${MARKS_GUARD_GROUP})`);
    expect(fileText()).toContain("+ [K_A] > 'a'");
    expect(fileText()).not.toMatch(/[^\r]\n/);
    const t1 = fileText();
    expect(applyOpenChange({ kind: "marks" })).toEqual({ status: "unchanged" });
    expect(fileText()).toBe(t1);
    expectReplayEmpty();

    const s = useWorkingCopyStore.getState();
    const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: ID }));
    const preview = createVirtualFS(s.startVfs!.entries());
    result.current!(preview, ID);
    const projected = await projectWorkingCopyForOutput();
    // Exact text, blank lines included; only the version stores differ (the
    // output path stamps &KEYBOARDVERSION).
    const noVersion = (t: string) => t.split(/(?<=\n)/).filter((l) => !/&KEYBOARDVERSION|&VERSION/i.test(l)).join("");
    expect(noVersion(projected!.vfs.get(KMN_PATH)!.content as string)).toBe(noVersion(fileText()));
    expect(noVersion(readVfsText(preview, KMN_PATH)!)).toBe(noVersion(fileText()));
  });

  it("an assignment and the guards it needs are ONE undo step", () => {
    const before = fileText();
    recordMarksTreatmentValue(VALUE);
    const a = {
      scope: "individual" as const, target: "ɛ", modality: "physical" as const, source: "user" as const,
      mechanisms: [{ patternId: "simple_swap", strategyId: "S-01" as const, slotValues: { kmnRules: "+ [K_Z] > U+025B" } }],
    };
    expect(applyOpenChange({ kind: "assign", add: [a], remove: [] }).status).toBe("applied");
    expect(fileText()).toContain("U+025B");
    expect(fileText()).toContain(`group(${MARKS_GUARD_GROUP})`);
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    expect(undoLastOpenApply().ok).toBe(true);
    expect(fileText()).toBe(before);
    expect(useOpenAssignStore.getState().session).toBeNull();
  });

  it("without a recorded marks decision there is nothing to write", () => {
    expect(applyOpenChange({ kind: "marks" })).toEqual({ status: "unchanged" });
  });
});
