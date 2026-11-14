// Nothing is held on Open (spec 111 FR-041, live files; T086g, T086h): every change
// is written when applied, so a change writes only itself. The flush that used to
// write held rules-step additions ahead of another change is gone, and neither the
// output nor another change derives rule additions from the working IR.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS, type IRRule, type StartKeyboard } from "@keyboard-studio/contracts";
import { emitRule, parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useOpenRemovalStore } from "../stores/openRemovalStore.ts";
import { useOpenUndoStore } from "../stores/openUndoStore.ts";
import { applyOpenChange, undoLastOpenApply } from "./openApply.ts";
import { readVfsText } from "./vfsText.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const KMN = [
  "store(&NAME) 'Tiny'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "+ [K_G] > 'g'",
  "+ [K_C] > 'c'",
  "+ [K_D] > 'd'",
  "",
].join("\r\n");
const KB = {
  id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"],
  displayName: "Tiny", version: "1.0", languages: ["en"],
} as StartKeyboard;

function open(): void {
  useOpenRemovalStore.getState().clear();
  const vfs = createVirtualFS([
    { path: KMN_PATH, content: KMN, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
  ]);
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  wc.instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, ID).ir });
  wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
  wc.setFallbackPolicy("pass-through");
}

const rules = () => useWorkingCopyStore.getState().startIr!.groups.flatMap((g) => g.rules);
const byKey = (k: string): IRRule =>
  rules().find((r) => r.context.some((c) => c.kind === "vkey" && c.name === k))!;
const fileText = (): string => readVfsText(useWorkingCopyStore.getState().startVfs!, KMN_PATH)!;
const ruleLines = (): string[] => fileText().split("\r\n").filter((l) => l.startsWith("+"));

function extra(template: IRRule, nodeId: string, out: string, marked: boolean): IRRule {
  const r = { ...structuredClone(template), nodeId, output: [{ kind: "char" as const, value: out }] };
  delete (r as { sourceLine?: number }).sourceLine;
  return marked ? { ...r, rulesStepAdded: true as const } : r;
}

describe("a change on Open writes only itself", () => {
  beforeEach(open);

  it("a remove writes only the removal; a rule addition left in the working IR is not written with it (no flush)", async () => {
    const start = useWorkingCopyStore.getState().startIr!;
    const next = structuredClone(start);
    const group = next.groups.find((g) => !g.readonly)!;
    group.rules.splice(1, 0, extra(group.rules[0]!, "narrow#1", "z", true));
    useWorkingCopyStore.getState().setWorkingIR(next);

    const result = applyOpenChange({ kind: "remove", itemIds: [byKey("K_D").nodeId], chars: ["d"] });
    expect(result.status).toBe("applied");
    expect(ruleLines().map((l) => l.slice(0, 9))).toEqual(["+ [K_A] >", "+ [K_G] >", "+ [K_C] >"]);
    expect(fileText()).not.toContain("U+007A");
    // One applied change, one undo record: no "earlier changes" step is logged ahead of it.
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
  });

  it("a context-tolerance overlay left by an older draft is not carried (it is written when applied, never held)", async () => {
    const start = useWorkingCopyStore.getState().startIr!;
    const g = start.groups.find((x) => !x.readonly)!;
    const guard = byKey("K_G");
    useWorkingCopyStore.getState().setContextToleranceOverlay({
      fingerprint: "f",
      acceptedSiteIds: ["site"],
      overlay: {
        batches: [{
          siteKey: "site",
          groupName: g.name,
          beforeRuleText: emitRule(guard, g.usingKeys),
          comment: "",
          rules: [extra(g.rules[0]!, "tol#1", "y", false)],
        }],
      },
    });
    const result = applyOpenChange({ kind: "remove", itemIds: [byKey("K_D").nodeId], chars: ["d"] });
    expect(result.status).toBe("applied");
    // Nothing replays it: the file gets only the removal.
    expect(ruleLines().map((l) => l.slice(0, 9))).toEqual(["+ [K_A] >", "+ [K_G] >", "+ [K_C] >"]);
    expect(fileText()).not.toContain("U+0079");
  });

  it("a reinsert (Restore) writes only the restore", () => {
    open();
    expect(applyOpenChange({ kind: "remove", itemIds: [byKey("K_D").nodeId], chars: ["d"] }).status).toBe("applied");
    const start = useWorkingCopyStore.getState().startIr!;
    const next = structuredClone(start);
    const group = next.groups.find((x) => !x.readonly)!;
    group.rules.splice(1, 0, extra(group.rules[0]!, "narrow#2", "z", true));
    useWorkingCopyStore.getState().setWorkingIR(next);
    const entries = useOpenRemovalStore.getState().entries;
    expect(applyOpenChange({ kind: "reinsert", entries: [...entries] }).status).toBe("applied");
    const lines = ruleLines();
    expect(lines).toHaveLength(4);
    expect(fileText()).not.toContain("U+007A");
    expect(lines[3]).toContain("[K_D]");
  });
});

describe("reinsert that cannot be placed precisely asks first", () => {
  beforeEach(open);

  function unplaceable() {
    expect(applyOpenChange({ kind: "remove", itemIds: [byKey("K_C").nodeId], chars: ["c"] }).status).toBe("applied");
    const [entry] = useOpenRemovalStore.getState().entries;
    // The files moved on and the neighbour is no longer there.
    return { ...entry!, files: {}, rules: entry!.rules.map((r) => ({ ...r, prevText: "no such rule", prevOrdinal: 1 })) };
  }

  it("returns needs-consent and writes nothing", () => {
    const entry = unplaceable();
    const before = useWorkingCopyStore.getState().startVfs;
    expect(applyOpenChange({ kind: "reinsert", entries: [entry] })).toEqual({
      status: "needs-consent",
      files: [KMN_PATH],
    });
    expect(useWorkingCopyStore.getState().startVfs).toBe(before);
    expect(useOpenRemovalStore.getState().entries).toHaveLength(1);
  });

  it("puts the rule back, reformatted, once the author consents", () => {
    const entry = unplaceable();
    const result = applyOpenChange({ kind: "reinsert", entries: [entry] }, { consentedReemit: true });
    expect(result.status).toBe("applied");
    expect(fileText()).toContain("[K_C]");
    expect(useOpenRemovalStore.getState().entries).toHaveLength(0);
  });
});

describe("undo takes back exactly the change (FR-045)", () => {
  beforeEach(open);

  it("undoing a remove returns to the original text in one step; Restore then its undo round-trips", () => {
    const original = fileText();
    expect(applyOpenChange({ kind: "remove", itemIds: [byKey("K_D").nodeId], chars: ["d"] }).status).toBe("applied");
    const removed = fileText();
    const entries = [...useOpenRemovalStore.getState().entries];
    expect(applyOpenChange({ kind: "reinsert", entries }).status).toBe("applied");
    expect(undoLastOpenApply().ok).toBe(true);
    expect(fileText()).toBe(removed);
    expect(useOpenRemovalStore.getState().entries.map((e) => e.id)).toEqual(entries.map((e) => e.id));
    expect(undoLastOpenApply().ok).toBe(true);
    expect(fileText()).toBe(original);
    expect(undoLastOpenApply().ok).toBe(false);
  });
});
