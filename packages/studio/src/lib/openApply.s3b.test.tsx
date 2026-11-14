// Slice S3b (spec 111 "live files", FR-041/FR-042): the deadkey editor and the
// context-tolerance fix write into the files when applied, hold no overlay for
// replay, and the per-kind step table is the only place which projection steps
// run for which kind of run.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, renderHook, screen } from "@testing-library/react";
import { createVirtualFS, type IRRule, type StartKeyboard } from "@keyboard-studio/contracts";
import { applyFacetTransform, emitRule, parseKmn } from "@keyboard-studio/engine";
import { render } from "../test/renderWithI18n.tsx";
import { changeSelectMenu } from "../test/selectMenuTestUtils.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useOpenRemovalStore } from "../stores/openRemovalStore.ts";
import { useOpenUndoStore } from "../stores/openUndoStore.ts";
import { useOpenAssignStore } from "../stores/openAssignStore.ts";
import { useGuardIntentStore } from "../stores/guardIntentStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useWorkingCopyTransform } from "../hooks/useWorkingCopyTransform.ts";
import { DeadkeySurface } from "../editors/deadkey/DeadkeySurface.tsx";
import { commitOverlay, repointBegin } from "./contextToleranceCommit.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";
import { PROJECTION_STEPS } from "./projectionSteps.ts";
import { applyOpenChange, undoLastOpenApply } from "./openApply.ts";
import { applyPatchToWorkingCopy, irForApply } from "./applyPatchToWorkingCopy.ts";
import { setOpenChangeApplier, setOpenApplyNotifier, type HandOver } from "./openApplyNotifier.ts";
import { DEADKEY_WRITES } from "../steps/editorMutate.ts";
import deadkeysDefined from "../survey/questions/gallery/deadkeysDefined.ts";
import { applyDeadkeyOpsToIr, type DeadkeyOperation } from "./deadkeyOps.ts";
import { continueCarve } from "../survey/carve/carveContinue.ts";
import { getDecisionSnapshot } from "../stores/decisionStore.ts";
import { analyseContextTolerance } from "./contextToleranceAnalysis.ts";
import { applyContextToleranceDecision } from "./contextToleranceApply.ts";
import { loadContextToleranceEngine } from "./contextToleranceEngine.ts";
import type { RecommendedRemovalChar } from "./irToCarveNodes.ts";
import { readVfsText } from "./vfsText.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
  getPatternByIdSync: () => undefined,
}));

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const KB = {
  id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"],
  displayName: "Tiny", version: "1.0", languages: ["en"],
} as StartKeyboard;

function kmn(): string {
  return [
    "store(&NAME) 'Tiny'",
    "store(&VERSION) '10.0'",
    "begin Unicode > use(main)",
    "group(main) using keys",
    "+ [K_A] > 'a'",
    "+ [K_G] > 'g'",
    "+ [K_C] > 'c'",
    "",
  ].join("\r\n");
}

function open(): void {
  useOpenRemovalStore.getState().clear();
  useOpenUndoStore.getState().clear();
  useOpenAssignStore.getState().clear();
  useGuardIntentStore.getState().resetForTest();
  useDecisionStore.getState().reset();
  const text = kmn();
  const vfs = createVirtualFS([
    { path: KMN_PATH, content: text, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
  ]);
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  wc.instantiateFromExisting(KB, { vfs, ir: parseKmn(text, ID).ir });
  wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
  wc.setFallbackPolicy("pass-through");
}

const fileText = (): string => readVfsText(useWorkingCopyStore.getState().startVfs!, KMN_PATH)!;
const noVersion = (t: string): string =>
  t.split(/(?<=\n)/).filter((l) => !/&KEYBOARDVERSION|&VERSION/i.test(l)).join("");
const count = (text: string, needle: string): number => text.split(needle).length - 1;

/** Working copy == preview == download (version lines aside). */
async function routesAgree(): Promise<string> {
  const s = useWorkingCopyStore.getState();
  const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: ID }));
  const preview = createVirtualFS(s.startVfs!.entries());
  result.current!(preview, ID);
  const projected = await projectWorkingCopyForOutput();
  const download = projected!.vfs.get(KMN_PATH)!.content as string;
  expect(noVersion(readVfsText(preview, KMN_PATH)!)).toBe(noVersion(fileText()));
  expect(noVersion(download)).toBe(noVersion(fileText()));
  return download;
}

afterEach(() => cleanup());

describe("the per-kind step table (T086f)", () => {
  it("lists the guards only for the marks run, and never for the output on Open", () => {
    expect(PROJECTION_STEPS.marks.has("markGuards")).toBe(true);
    for (const kind of ["remove", "ir", "flush", "assign", "output"] as const) {
      expect(PROJECTION_STEPS[kind].has("markGuards")).toBe(false);
    }
  });

  it("an assign run has no intended-text check; the other projecting apply runs do", () => {
    expect(PROJECTION_STEPS.assign.has("intendedCheck")).toBe(false);
    for (const kind of ["remove", "ir", "flush", "marks"] as const) {
      expect(PROJECTION_STEPS[kind].has("intendedCheck")).toBe(true);
    }
  });

  it("no apply run writes the output-only steps; the output run lists none of the retired overlays", () => {
    for (const kind of ["remove", "ir", "flush", "assign", "marks"] as const) {
      for (const step of ["touchInject", "css", "authoredDocs", "identity", "descriptor", "rename"] as const) {
        expect(PROJECTION_STEPS[kind].has(step)).toBe(false);
      }
    }
    for (const step of ["deadkeys", "tolerance", "markGuards", "intendedCheck"] as const) {
      expect(PROJECTION_STEPS.output.has(step)).toBe(false);
    }
  });

  it("Copy (no openMode) still replays the deadkey ops and the tolerance fix", () => {
    open();
    const s = useWorkingCopyStore.getState();
    const run = (openMode?: { kps: { nameEdited: boolean }; steps: ReadonlySet<never> }) => {
      const vfs = createVirtualFS(s.startVfs!.entries());
      projectWorkingCopyVfs({
        vfs,
        keyboardId: ID,
        startIr: s.startIr!,
        deletedNodeIds: new Set(),
        assignments: [],
        getPattern: () => undefined,
        identity: null,
        deadkeyOps: [{ kind: "define", triggerKey: "K_COLON", id: 0x3000, accentChar: ";" }],
        ...(openMode !== undefined ? { openMode: openMode as never } : {}),
      });
      return readVfsText(vfs, KMN_PATH)!;
    };
    expect(run()).toContain("dk(");
    expect(run({ kps: { nameEdited: false }, steps: PROJECTION_STEPS.output as never })).not.toContain("dk(");
  });
});

describe("a deadkey edit on Open is written into the file when it is made (T086d)", () => {
  beforeEach(open);

  async function defineDeadkey(): Promise<void> {
    render(<DeadkeySurface onComplete={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: /define new deadkey/i }));
    await changeSelectMenu(screen.getByLabelText(/trigger key for the new deadkey/i), "K_COLON");
    fireEvent.change(screen.getByLabelText(/deadkey id/i), { target: { value: "3002" } });
    fireEvent.click(screen.getByRole("button", { name: /define deadkey/i }));
  }

  it("defines a deadkey: in the file once, one undo record, undo restores, output has it exactly once", async () => {
    const before = fileText();
    await defineDeadkey();

    const after = fileText();
    expect(after).not.toBe(before);
    expect(count(after, "dk(3002)")).toBeGreaterThan(0);
    // The working IR is the file's parse: no stray write beside the seam.
    const s = useWorkingCopyStore.getState();
    expect(s.ir).toBe(s.startIr);
    const records = useOpenUndoStore.getState().records;
    expect(records).toHaveLength(1);

    // The output replays nothing: the deadkey is in the download exactly as often as in the file.
    const download = await routesAgree();
    expect(count(download, "dk(3002)")).toBe(count(after, "dk(3002)"));

    expect(undoLastOpenApply().ok).toBe(true);
    expect(fileText()).toBe(before);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });

  it("the op log is a record only: the preview and download do not replay it", async () => {
    await defineDeadkey();
    expect(useWorkingCopyStore.getState().deadkeyOverlay.ops).toHaveLength(1);
    const once = count(fileText(), "dk(3002)");
    // A second route over the same files adds nothing.
    expect(count(await routesAgree(), "dk(3002)")).toBe(once);
  });
});

describe("a context-tolerance fix on Open is written into the file when applied (T086c)", () => {
  beforeEach(open);

  function overlayFor(template: IRRule) {
    const s = useWorkingCopyStore.getState();
    const g = s.startIr!.groups.find((x) => !x.readonly)!;
    const guard = g.rules.find((r) => r.context.some((c) => c.kind === "vkey" && c.name === "K_G"))!;
    const added = { ...structuredClone(template), nodeId: "tol#1", output: [{ kind: "char" as const, value: "y" }] };
    delete (added as { sourceLine?: number }).sourceLine;
    return {
      fingerprint: "f",
      acceptedSiteIds: ["site"],
      overlay: {
        batches: [{
          siteKey: "site",
          groupName: g.name,
          beforeRuleText: emitRule(guard, g.usingKeys),
          comment: "",
          rules: [added],
        }],
      },
    };
  }

  it("is in the file once, holds no overlay, one undo record, undo restores, output has it once", async () => {
    const before = fileText();
    const g = useWorkingCopyStore.getState().startIr!.groups.find((x) => !x.readonly)!;
    expect(commitOverlay(overlayFor(g.rules[0]!))).toBe(true);

    const after = fileText();
    expect(after).not.toBe(before);
    expect(count(after, "U+0079")).toBe(1);
    const s = useWorkingCopyStore.getState();
    expect(s.contextToleranceOverlay).toBeNull();
    expect(s.ir).toBe(s.startIr);
    expect(useOpenUndoStore.getState().records).toHaveLength(1);

    expect(count(await routesAgree(), "U+0079")).toBe(1);

    expect(undoLastOpenApply().ok).toBe(true);
    expect(fileText()).toBe(before);
  });

  it("taking the fix back (null) leaves the files alone", () => {
    const g = useWorkingCopyStore.getState().startIr!.groups.find((x) => !x.readonly)!;
    commitOverlay(overlayFor(g.rules[0]!));
    const text = fileText();
    expect(commitOverlay(null)).toBe(true);
    expect(fileText()).toBe(text);
  });
});

describe("no overlay is held after an Open action, apart from the touch ones", () => {
  beforeEach(open);

  it("the deadkey edit and the tolerance fix leave every overlay the projection reads empty", async () => {
    const g = useWorkingCopyStore.getState().startIr!.groups.find((x) => !x.readonly)!;
    const guard = g.rules[1]!;
    const added = { ...structuredClone(g.rules[0]!), nodeId: "tol#2", output: [{ kind: "char" as const, value: "y" }] };
    delete (added as { sourceLine?: number }).sourceLine;
    commitOverlay({
      fingerprint: "f",
      acceptedSiteIds: ["s"],
      overlay: { batches: [{ siteKey: "s", groupName: g.name, beforeRuleText: emitRule(guard, g.usingKeys), comment: "", rules: [added] }] },
    });
    const s = useWorkingCopyStore.getState();
    expect(s.contextToleranceOverlay).toBeNull();
    expect(s.deletedNodeIds.size + s.deletedItemIds.size + s.carveChars.size).toBe(0);
    expect(s.disabledFamilyIds.size).toBe(0);
    expect(s.ir).toBe(s.startIr);
  });
});


describe("a recomposed deadkey decision never doubles an op already in the file (P1)", () => {
  beforeEach(open);

  it("add-pair logged on Open, carved-layout re-recorded: the file is byte-identical and the output has the pair once", async () => {
    const ops: DeadkeyOperation[] = [
      { kind: "define", triggerKey: "K_COLON", id: 0x3000, accentChar: ";" },
      { kind: "add-pair", id: 0x3000, base: "e", accented: "\u00e9" } as DeadkeyOperation,
    ];
    const start = useWorkingCopyStore.getState().startIr!;
    const built = applyDeadkeyOpsToIr(start, ops).ir;
    // What the editor does: write the edit, then log the ops.
    const written = applyPatchToWorkingCopy({ ir: { groups: built.groups, stores: built.stores, raw: built.raw } }, DEADKEY_WRITES);
    expect(written?.status).toBe("applied");
    for (const op of ops) useWorkingCopyStore.getState().commitDeadkeyOp(op);
    const afterEdit = fileText();
    useDecisionStore.getState().record({ id: "deadkeys-defined", value: { ops }, provenance: "asked" });

    // `carved-layout` is re-recorded: the module recomposes from the op log, as the reducer does.
    const patch = deadkeysDefined.apply!(undefined, {
      ir: irForApply(),
      writes: deadkeysDefined.writes!,
      decisions: getDecisionSnapshot(),
      currentHistoryEntryState: null,
    });
    expect(patch.ir).toBeDefined(); // it does recompose a patch...
    applyPatchToWorkingCopy(patch, deadkeysDefined.writes!, { decisionIds: deadkeysDefined.provides! });
    expect(fileText()).toBe(afterEdit); // ...which writes nothing
    expect(useOpenUndoStore.getState().records).toHaveLength(1);

    const download = await routesAgree();
    expect(count(download, "U+00E9")).toBe(count(afterEdit, "U+00E9"));
  });
});

describe("a deadkey write that waits for the author's agreement is logged only on agreement (P2)", () => {
  beforeEach(open);
  afterEach(() => {
    setOpenChangeApplier(applyOpenChange);
    setOpenApplyNotifier(null);
  });

  async function defineWaiting(): Promise<HandOver[]> {
    const held: HandOver[] = [];
    setOpenApplyNotifier((item) => held.push(item));
    setOpenChangeApplier(() => ({ status: "needs-consent", files: [KMN_PATH] }));
    render(<DeadkeySurface onComplete={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: /define new deadkey/i }));
    await changeSelectMenu(screen.getByLabelText(/trigger key for the new deadkey/i), "K_COLON");
    fireEvent.change(screen.getByLabelText(/deadkey id/i), { target: { value: "3002" } });
    fireEvent.click(screen.getByRole("button", { name: /define deadkey/i }));
    return held;
  }

  it("agreed: the op is logged when the change is written", async () => {
    const held = await defineWaiting();
    expect(held).toHaveLength(1);
    expect(useWorkingCopyStore.getState().deadkeyOverlay.ops).toHaveLength(0);
    held[0]!.onApplied?.();
    expect(useWorkingCopyStore.getState().deadkeyOverlay.ops).toHaveLength(1);
  });

  it("declined or failed: nothing is logged", async () => {
    const held = await defineWaiting();
    held[0]!.onNotApplied();
    expect(useWorkingCopyStore.getState().deadkeyOverlay.ops).toHaveLength(0);
  });
});

describe("the carve suggestion's Continue writes the removals into the file on Open (carve writer)", () => {
  beforeEach(open);

  it("removes the marked rules from the file with one undo record, and holds no carve overlay", () => {
    const s = useWorkingCopyStore.getState();
    const rules = s.startIr!.groups.flatMap((g) => g.rules);
    const idOf = (k: string): string => rules.find((r) => r.context.some((c) => c.kind === "vkey" && c.name === k))!.nodeId;
    const row = (ch: string, id: string): RecommendedRemovalChar =>
      ({ ch, contributors: { targetChar: ch, ruleNodeIds: [id], storeSlotIds: [] } }) as unknown as RecommendedRemovalChar;
    const before = fileText();
    continueCarve([row("g", idOf("K_G")), row("c", idOf("K_C"))], true);

    const after = fileText();
    expect(after).not.toBe(before);
    expect(after).not.toContain("[K_G]");
    expect(after).not.toContain("[K_C]");
    expect(after).toContain("[K_A]");
    const now = useWorkingCopyStore.getState();
    expect(now.deletedItemIds.size + now.deletedNodeIds.size + now.carveChars.size).toBe(0);
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    expect(undoLastOpenApply().ok).toBe(true);
    expect(fileText()).toBe(before);
  });
});

describe("a normalization-step fix on Open writes the entry point into the file (header.entryPoints)", () => {
  const STEP_KMN = [
    "store(&NAME) 'Apply'",
    "store(&VERSION) '14.0'",
    "store(&TARGETS) 'any'",
    "store(&mnemoniclayout) '1'",
    "begin Unicode > use(main)",
    "group(main) using keys",
    "store(base) U+00E0",
    "store(acute) U+00E2",
    "store(key.act) ']'",
    "any(base) + any(key.act) > index(acute,1)",
    "+ ']' > U+00B4",
    "",
  ].join("\r\n");

  it("file, preview and download agree; one undo record; no overlay", async () => {
    useOpenRemovalStore.getState().clear();
    useOpenUndoStore.getState().clear();
    useDecisionStore.getState().reset();
    const vfs = createVirtualFS([
      { path: KMN_PATH, content: STEP_KMN, isBinary: false },
      { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
    ]);
    const wc = useWorkingCopyStore.getState();
    wc.reset();
    wc.instantiateFromExisting(KB, { vfs, ir: parseKmn(STEP_KMN, ID).ir });
    wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
    wc.setFallbackPolicy("pass-through");

    const result = await analyseContextTolerance(useWorkingCopyStore.getState().startIr!, () => true);
    const analysis = { status: "ready" as const, runId: 1, ...result! };
    const engine = await loadContextToleranceEngine();
    const outcome = await applyContextToleranceDecision(
      { acceptedSiteIds: ["normalization-step"], fingerprint: analysis.fingerprint },
      analysis as never,
      { engine, applyFacetTransform },
    );
    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") return;
    const before = fileText();
    expect(commitOverlay({ fingerprint: analysis.fingerprint, acceptedSiteIds: ["normalization-step"], overlay: outcome.overlay })).toBe(true);

    const after = fileText();
    expect(after).not.toBe(before);
    expect(after).toContain("begin Unicode > use(generated_context_normalize)");
    expect(count(after, "group(generated_context_normalize)")).toBe(1);
    expect(useWorkingCopyStore.getState().contextToleranceOverlay).toBeNull();
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    const download = await routesAgree();
    expect(count(download, "group(generated_context_normalize)")).toBe(1);
    expect(undoLastOpenApply().ok).toBe(true);
    expect(fileText()).toBe(before);
  }, 60_000);
});


describe("repointBegin: only the Unicode directive that enters the fix's group is repointed", () => {
  const BEGIN = "begin Unicode > use(main)";

  it("skips a comment line that mentions the directive and rewrites the real one", () => {
    const text = `c was: ${BEGIN}\r\nstore(&NAME) 'x'\r\n${BEGIN}\r\n`;
    expect(repointBegin(text, "main", "step")).toBe(`c was: ${BEGIN}\r\nstore(&NAME) 'x'\r\nbegin Unicode > use(step)\r\n`);
  });

  it("leaves a begin ANSI line alone, whatever its order", () => {
    const ansiFirst = `begin ANSI > use(main)\r\n${BEGIN}\r\n`;
    expect(repointBegin(ansiFirst, "main", "step")).toBe("begin ANSI > use(main)\r\nbegin Unicode > use(step)\r\n");
    const ansiLast = `${BEGIN}\r\nbegin ANSI > use(main)\r\n`;
    expect(repointBegin(ansiLast, "main", "step")).toBe("begin Unicode > use(step)\r\nbegin ANSI > use(main)\r\n");
  });

  it("refuses to guess when two Unicode directives enter the group, or none does", () => {
    expect(repointBegin(`${BEGIN}\r\n${BEGIN}\r\n`, "main", "step")).toBeUndefined();
    expect(repointBegin("begin Unicode > use(other)\r\n", "main", "step")).toBeUndefined();
    expect(repointBegin("c begin Unicode > use(main)\r\n", "main", "step")).toBeUndefined();
  });

  it("writes a group name with $ literally", () => {
    expect(repointBegin(`${BEGIN}\r\n`, "main", "a$&b$1")).toBe("begin Unicode > use(a$&b$1)\r\n");
  });
});

describe("a normalization-step fix that cannot be written reaches the author", () => {
  afterEach(() => {
    setOpenChangeApplier(applyOpenChange);
    setOpenApplyNotifier(null);
  });

  const COMMENTED = [
    "store(&NAME) 'Apply'", "store(&VERSION) '14.0'", "store(&TARGETS) 'any'", "store(&mnemoniclayout) '1'",
    "c was: begin Unicode > use(main)",
    "begin Unicode > use(main)",
    "group(main) using keys",
    "store(base) U+00E0", "store(acute) U+00E2", "store(key.act) ']'",
    "any(base) + any(key.act) > index(acute,1)", "+ ']' > U+00B4", "",
  ].join("\r\n");

  async function openWithStep(kmnText: string) {
    useOpenRemovalStore.getState().clear();
    useOpenUndoStore.getState().clear();
    useDecisionStore.getState().reset();
    const vfs = createVirtualFS([
      { path: KMN_PATH, content: kmnText, isBinary: false },
      { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
    ]);
    const wc = useWorkingCopyStore.getState();
    wc.reset();
    wc.instantiateFromExisting(KB, { vfs, ir: parseKmn(kmnText, ID).ir });
    wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
    wc.setFallbackPolicy("pass-through");
    const result = await analyseContextTolerance(useWorkingCopyStore.getState().startIr!, () => true);
    const analysis = { status: "ready" as const, runId: 1, ...result! };
    const engine = await loadContextToleranceEngine();
    const outcome = await applyContextToleranceDecision(
      { acceptedSiteIds: ["normalization-step"], fingerprint: analysis.fingerprint },
      analysis as never,
      { engine, applyFacetTransform },
    );
    if (outcome.kind !== "applied") throw new Error("fixture did not apply");
    return { fingerprint: analysis.fingerprint, acceptedSiteIds: ["normalization-step"], overlay: outcome.overlay };
  }

  it("a comment line naming the directive does not hijack the rewrite: the real begin is repointed", async () => {
    const fix = await openWithStep(COMMENTED);
    expect(commitOverlay(fix)).toBe(true);
    const after = fileText();
    expect(after).toContain("c was: begin Unicode > use(main)");
    expect(after).toContain("\r\nbegin Unicode > use(generated_context_normalize)");
  }, 60_000);

  it("no begin line to repoint: nothing is written, the host is told, it is not reported applied", async () => {
    const fix = await openWithStep(COMMENTED.replace("\r\nbegin Unicode > use(main)", ""));
    const held: HandOver[] = [];
    setOpenApplyNotifier((item) => held.push(item));
    const before = fileText();
    expect(commitOverlay(fix)).toBe(false);
    expect(fileText()).toBe(before);
    expect(held).toHaveLength(1);
    expect(held[0]!.build()).toBeNull(); // the host shows the "could not be applied" notice
  }, 60_000);

  it("the seam asks for agreement: the change is handed to the host, built again from the files, and stamped when written", async () => {
    const fix = await openWithStep(COMMENTED);
    const held: HandOver[] = [];
    setOpenApplyNotifier((item) => held.push(item));
    setOpenChangeApplier(() => ({ status: "needs-consent", files: [KMN_PATH] }));
    const before = fileText();
    const stamped = vi.fn();
    expect(commitOverlay(fix, stamped)).toBe(false);
    expect(fileText()).toBe(before);
    expect(held).toHaveLength(1);
    expect(stamped).not.toHaveBeenCalled();
    const change = held[0]!.build();
    expect(change?.kind).toBe("files");
    // The author agrees: the host applies it and reports it applied.
    setOpenChangeApplier(applyOpenChange);
    expect(applyOpenChange(change!).status).toBe("applied");
    held[0]!.onApplied?.();
    expect(stamped).toHaveBeenCalledTimes(1);
    expect(fileText()).toContain("begin Unicode > use(generated_context_normalize)");
  }, 60_000);
});

describe("deadkeys-defined never writes the file on Open, whatever the log holds (P1)", () => {
  beforeEach(open);

  it("some recorded ops are not in the log (a draft): the file is unchanged", () => {
    const ops: DeadkeyOperation[] = [
      { kind: "define", triggerKey: "K_COLON", id: 0x3000, accentChar: ";" },
      { kind: "define", triggerKey: "K_SEMICOLON", id: 0x3001, accentChar: ":" },
    ];
    const before = fileText();
    useWorkingCopyStore.getState().commitDeadkeyOp(ops[0]!); // only one of the two was logged
    useDecisionStore.getState().record({ id: "deadkeys-defined", value: { ops }, provenance: "asked" });
    const patch = deadkeysDefined.apply!(undefined, {
      ir: irForApply(),
      writes: deadkeysDefined.writes!,
      decisions: getDecisionSnapshot(),
      currentHistoryEntryState: null,
    });
    expect(patch.ir).toBeDefined();
    applyPatchToWorkingCopy(patch, deadkeysDefined.writes!, { decisionIds: deadkeysDefined.provides! });
    expect(fileText()).toBe(before);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });
});
