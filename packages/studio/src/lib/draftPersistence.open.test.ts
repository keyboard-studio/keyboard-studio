// Open drafts (spec 111 FR-049): a keyboard opened for update is saved as its
// current files plus the record, and restored without replaying any decision.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn, recognizePatterns } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useDecisionStore, getDecisionSnapshot } from "../stores/decisionStore.ts";
import { useGuardIntentStore } from "../stores/guardIntentStore.ts";
import { useOpenUndoStore } from "../stores/openUndoStore.ts";
import { applyOpenChange } from "./openApply.ts";
import { draftKey, saveDraft, loadDraft, type DurableDraft } from "./draftPersistence.ts";
import {
  rehydrateWorkingCopyFromSession,
  repairOpenDraftDescriptor,
  snapshotWorkingCopyData,
  snapshotWorkingCopyToSession,
} from "./persistWorkingCopy.ts";
import { isLiveOpen } from "./openMode.ts";
import { rebuildWorkingCopyFromStores, recalculateForStartingPointChangeFromStores, resetRebuildTrail } from "../decisions/rebuildWorkingCopy.ts";
import { installDraftPersistenceHooks } from "./draftPersistence.testkit.ts";

vi.mock("./serverDraftStore.ts", () => ({
  saveServerDraft: vi.fn(async () => true),
  saveServerDraftBeacon: vi.fn(),
  clearServerDraft: vi.fn(async () => true),
}));

installDraftPersistenceHooks();

const ID = "tiny";
const KMN = `source/${ID}.kmn`;
const KPS = `source/${ID}.kps`;
const KB = {
  id: ID, path: `release/t/${ID}`, script: "Latn", targets: ["desktop"], displayName: "Tiny", version: "1.0", languages: ["en"],
} as StartKeyboard;
const KMN_TEXT = "store(&NAME) 'Tiny'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > 'a'\n+ [K_B] > 'b'\n";
const ICON = new Uint8Array([137, 80, 78, 71, 0, 255, 128]);

function openKeyboard(): void {
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  useDecisionStore.getState().reset();
  useOpenUndoStore.getState().replace([]);
  const vfs = createVirtualFS([
    { path: KMN, content: KMN_TEXT, isBinary: false },
    { path: KPS, content: "<Package/>", isBinary: false },
    { path: `source/${ID}.ico`, content: ICON, isBinary: true },
    { path: "source/help/tiny.css", content: "body{}", isBinary: false },
  ]);
  wc.instantiateFromExisting(KB, { vfs, ir: recognizePatterns(parseKmn(KMN_TEXT, ID).ir).ir });
}

function filesOf(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of useWorkingCopyStore.getState().startVfs!.entries()) {
    out[e.path] = typeof e.content === "string" ? e.content : `bytes:${Array.from(e.content).join(",")}`;
  }
  return out;
}

describe("Open draft", () => {
  beforeEach(() => openKeyboard());

  it("restores the applied files byte-for-byte, the record as a record, and an empty undo log", () => {
    const edited = KMN_TEXT.replace("'a'", "'x'");
    expect(applyOpenChange({ kind: "files", files: { [KMN]: edited }, label: "Edit" }).status).toBe("applied");
    expect(applyOpenChange({ kind: "files", files: { "source/help/tiny.css": "body{color:red}" }, label: "Style" }).status).toBe("applied");
    expect(applyOpenChange({ kind: "files", files: { "source/welcome.htm": "<p>hi</p>" }, label: "Doc" }).status).toBe("applied");
    useWorkingCopyStore.setState({ customCss: "stale{}", authoredReadmeMd: "stale" });
    useWorkingCopyStore.getState().deleteTouchKey("k1");
    // A decision that would alter the files if it were replayed over them.
    useDecisionStore.getState().record({ id: "touch-seed-source", value: "reseed-from-desktop", provenance: "asked", step: "touch_seed_source" });
    const filesBefore = filesOf();
    const decisionsBefore = getDecisionSnapshot();
    expect(useOpenUndoStore.getState().records.length).toBeGreaterThan(0);

    saveDraft(ID);
    const saved = JSON.parse(localStorage.getItem(draftKey(ID))!) as DurableDraft;
    expect(saved.workingCopy.customCss).toBeNull();
    expect(saved.workingCopy.authoredReadmeMd).toBeNull();
    // The touch record is kept: the touch-layout decision derives from it.
    expect(saved.workingCopy.deletedTouchKeyIds).toEqual(["k1"]);
    expect(saved.workingCopy.startVfsEntries.find((e) => e.path === `source/${ID}.ico`)?.isBinary).toBe(true);

    useWorkingCopyStore.getState().reset();
    useSurveySessionStore.getState().reset();
    useDecisionStore.getState().reset();
    expect(loadDraft(ID)).toBe(true);

    const s = useWorkingCopyStore.getState();
    expect(filesOf()).toEqual(filesBefore);
    expect(s.startVfs!.get(`source/${ID}.ico`)!.content).toEqual(ICON);
    expect(getDecisionSnapshot()).toEqual(decisionsBefore);
    expect(s.customCss).toBeNull();
    expect(s.authoredReadmeMd).toBeNull();
    expect(useOpenUndoStore.getState().records).toEqual([]);
    // Models come from the saved text.
    expect(JSON.stringify(s.startIr)).toContain('"value":"x"');
    expect(s.ir).toBe(s.startIr);
    expect(s.deletedTouchKeyIds.has("k1")).toBe(true);
  });

  it("never replays a decision over the restored files; the same decision does change a Copy working copy", () => {
    const decision = {
      id: "carved-layout",
      value: { removals: [{ kind: "node", id: "rule#0", provenance: "asked" }] },
      provenance: "asked",
    } as const;
    saveDraft(ID);
    useWorkingCopyStore.getState().reset();
    expect(loadDraft(ID)).toBe(true);
    expect(isLiveOpen(useWorkingCopyStore.getState())).toBe(true);
    const filesBefore = filesOf();
    resetRebuildTrail();
    useDecisionStore.getState().recordAll([{ id: "authoring-track", value: "copy", provenance: "asked" }, decision] as never);
    expect(rebuildWorkingCopyFromStores(["carved-layout"])).toBeNull();
    expect(recalculateForStartingPointChangeFromStores()).toBeNull();
    expect(useWorkingCopyStore.getState().deletedNodeIds.size).toBe(0);
    expect(filesOf()).toEqual(filesBefore);

    // Negative control: Copy replays it.
    const wc = useWorkingCopyStore.getState();
    wc.reset();
    wc.instantiateFromStart(KB, { vfs: createVirtualFS([{ path: KMN, content: KMN_TEXT, isBinary: false }]), ir: parseKmn(KMN_TEXT, ID).ir });
    resetRebuildTrail();
    expect(rebuildWorkingCopyFromStores(["carved-layout"])).not.toBeNull();
    expect(useWorkingCopyStore.getState().deletedNodeIds.has("rule#0")).toBe(true);
  });

  it("re-reads the models from the files of an earlier draft whose saved models were stale", () => {
    saveDraft(ID);
    const env = JSON.parse(localStorage.getItem(draftKey(ID))!) as DurableDraft;
    const edited = KMN_TEXT.replace("'a'", "'z'");
    const entry = env.workingCopy.startVfsEntries.find((e) => e.path === KMN)!;
    entry.content = edited; // files changed, saved IR still says 'a'
    localStorage.setItem(draftKey(ID), JSON.stringify(env));
    useWorkingCopyStore.getState().reset();
    expect(loadDraft(ID)).toBe(true);
    expect(JSON.stringify(useWorkingCopyStore.getState().startIr)).toContain('"value":"z"');
  });

  it("clears the guard rule ids only when the re-read rules differ from the saved ones", () => {
    useGuardIntentStore.setState({ keptGuardRuleIds: new Set(["rule#0"]), narrowedGuardQuestions: new Set(["q"]) });
    snapshotWorkingCopyToSession();
    useWorkingCopyStore.getState().reset();
    useGuardIntentStore.setState({ keptGuardRuleIds: new Set(), narrowedGuardQuestions: new Set() });
    expect(rehydrateWorkingCopyFromSession()).toBe(true);
    expect(useGuardIntentStore.getState().keptGuardRuleIds.has("rule#0")).toBe(true);

    saveDraft(ID);
    const env = JSON.parse(localStorage.getItem(draftKey(ID))!) as DurableDraft;
    env.workingCopy.startVfsEntries.find((e) => e.path === KMN)!.content = KMN_TEXT.replace("'a'", "'z'");
    localStorage.setItem(draftKey(ID), JSON.stringify(env));
    useWorkingCopyStore.getState().reset();
    useGuardIntentStore.setState({ keptGuardRuleIds: new Set(["rule#0"]), narrowedGuardQuestions: new Set(["q"]), narrowUndoStack: [] });
    expect(loadDraft(ID)).toBe(true);
    expect(useGuardIntentStore.getState().keptGuardRuleIds.size).toBe(0);
    expect(useGuardIntentStore.getState().narrowedGuardQuestions.has("q")).toBe(true);
  });

  it("drops a stale saved touch layout when the saved files have no touch file", () => {
    saveDraft(ID);
    const env = JSON.parse(localStorage.getItem(draftKey(ID))!) as DurableDraft;
    (env.workingCopy.startIr as unknown as Record<string, unknown>).touchLayout = { stale: true };
    localStorage.setItem(draftKey(ID), JSON.stringify(env));
    useWorkingCopyStore.getState().reset();
    expect(loadDraft(ID)).toBe(true);
    expect(useWorkingCopyStore.getState().startIr?.touchLayout).toBeUndefined();
  });

  it("keeps the saved models, and still restores, when the saved .kmn cannot be read", () => {
    saveDraft(ID);
    const env = JSON.parse(localStorage.getItem(draftKey(ID))!) as DurableDraft;
    env.workingCopy.startVfsEntries.find((e) => e.path === KMN)!.content = "this is not a keyboard";
    localStorage.setItem(draftKey(ID), JSON.stringify(env));
    useWorkingCopyStore.getState().reset();
    expect(loadDraft(ID)).toBe(true);
    const s = useWorkingCopyStore.getState();
    expect(s.startVfs!.get(KMN)!.content).toBe("this is not a keyboard");
    expect(JSON.stringify(s.startIr)).toContain('"value":"a"');
  });

  it("rehydrates an OAuth-return snapshot of a live Open copy from its files", () => {
    applyOpenChange({ kind: "files", files: { [KMN]: KMN_TEXT.replace("'a'", "'q'") }, label: "Edit" });
    useWorkingCopyStore.setState({ customCss: "stale{}" });
    const filesBefore = filesOf();
    snapshotWorkingCopyToSession();
    useWorkingCopyStore.getState().reset();
    expect(rehydrateWorkingCopyFromSession()).toBe(true);
    const s = useWorkingCopyStore.getState();
    expect(filesOf()).toEqual(filesBefore);
    expect(s.customCss).toBeNull();
    expect(JSON.stringify(s.startIr)).toContain('"value":"q"');
    expect(useOpenUndoStore.getState().records).toEqual([]);
  });

  it("an earlier Adapt draft turned live by the descriptor repair gets the Open rules", async () => {
    const wc = useWorkingCopyStore.getState();
    wc.reset();
    const vfs = createVirtualFS([{ path: KMN, content: KMN_TEXT.replace("'a'", "'m'"), isBinary: false }]);
    wc.instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN_TEXT, ID).ir });
    useWorkingCopyStore.setState({ customCss: "old{}", authoredHelpPhp: "x" });
    const report = await repairOpenDraftDescriptor({
      proxyBase: "http://p",
      fetchImpl: async () => ({ ok: true, text: async () => "<Package/>" }),
    });
    expect(report.restored).toBe(true);
    const s = useWorkingCopyStore.getState();
    expect(isLiveOpen(s)).toBe(true);
    expect(s.customCss).toBeNull();
    expect(s.authoredHelpPhp).toBeNull();
    expect(JSON.stringify(s.startIr)).toContain('"value":"m"');
  });

  it("an earlier Open draft opens with its saved files; held state is dropped, nothing is replayed", () => {
    saveDraft(ID);
    const key = draftKey(ID);
    const env = JSON.parse(localStorage.getItem(key)!) as DurableDraft;
    // As an earlier build wrote it: held Copy state present.
    const wc = env.workingCopy as unknown as Record<string, unknown>;
    wc.customCss = "old{}";
    wc.authoredHelpPhp = "<?php ?>";
    wc.carveTouchKeepInert = ["x"];
    localStorage.setItem(key, JSON.stringify(env));
    const filesBefore = filesOf();
    useWorkingCopyStore.getState().reset();
    expect(loadDraft(ID)).toBe(true);
    const s = useWorkingCopyStore.getState();
    expect(filesOf()).toEqual(filesBefore);
    expect(s.customCss).toBeNull();
    expect(s.authoredHelpPhp).toBeNull();
    expect(s.carveTouchKeepInert).toEqual([]);
  });

  it("Copy drafts still save and restore held state", () => {
    const wc = useWorkingCopyStore.getState();
    wc.reset();
    wc.instantiateFromStart(KB, { vfs: createVirtualFS([{ path: KMN, content: KMN_TEXT, isBinary: false }]), ir: parseKmn(KMN_TEXT, ID).ir });
    useWorkingCopyStore.setState({ customCss: "kept{}", authoredReadmeMd: "# kept" });
    expect(snapshotWorkingCopyData().customCss).toBe("kept{}");
    saveDraft(ID);
    useWorkingCopyStore.getState().reset();
    expect(loadDraft(ID)).toBe(true);
    const s = useWorkingCopyStore.getState();
    expect(s.customCss).toBe("kept{}");
    expect(s.authoredReadmeMd).toBe("# kept");
  });
});
