// selectSessionAssignments (spec 111 FR-042): on Open the applied assignments
// are the session's assignments for every reader that records or judges them;
// on Copy nothing changes.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS, makePattern, type MechanismAssignment, type StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { clearOpenSession } from "../stores/openUndoStore.ts";
import { applyOpenChange } from "./openApply.ts";
import { selectSessionAssignments } from "./sessionAssignments.ts";
import { deriveInventoryCoverageGate } from "./inventoryDiff.ts";
import { currentPhysicalLayoutValue } from "../survey/assignLoop/physicalLayoutValue.ts";
import { seedInstantiatedWorkingCopy } from "../test/workingCopy.ts";

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

const a: MechanismAssignment = {
  scope: "individual",
  target: "ɛ",
  modality: "physical",
  mechanisms: [{ patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules: "+ [K_E] > U+025B" } }],
  source: "user",
};

describe("on Open", () => {
  const ID = "tiny";
  const KMN = ["store(&NAME) 'Tiny'", "begin Unicode > use(main)", "group(main) using keys", "+ [K_A] > 'a'", ""].join("\n");
  beforeEach(() => {
    clearOpenSession();
    const vfs = createVirtualFS([
      { path: `source/${ID}.kmn`, content: KMN, isBinary: false },
      { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
    ]);
    const wc = useWorkingCopyStore.getState();
    wc.reset();
    wc.instantiateFromExisting(
      { id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"], displayName: "Tiny", version: "1.0", languages: ["en"] } as StartKeyboard,
      { vfs, ir: parseKmn(KMN, ID).ir },
    );
    wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
  });

  it("the decision value, the recorder's source and the coverage gate include an applied assignment", () => {
    const gateInput = () => {
      const s = useWorkingCopyStore.getState();
      return {
        startIr: s.startIr,
        phaseResults: s.phaseResults,
        startKeyboard: s.startKeyboard,
        touchLayoutJson: null,
        session: { confirmedInventory: ["ɛ"] },
      };
    };
    expect(deriveInventoryCoverageGate(gateInput()).unimplementedDesktop).toContain("ɛ");
    expect(applyOpenChange({ kind: "assign", add: [a], remove: [] }).status).toBe("applied");
    const s = useWorkingCopyStore.getState();
    // Not held for replay ...
    expect(s.phaseResults.find((p) => p.phase === "C")?.assignments ?? []).toEqual([]);
    // ... but the record reads it.
    expect(selectSessionAssignments(s)).toHaveLength(1);
    expect(currentPhysicalLayoutValue().assignments).toEqual([a]);
    expect(deriveInventoryCoverageGate(gateInput()).unimplementedDesktop).not.toContain("ɛ");
  });
});

describe("on Copy", () => {
  it("is the phase-C list, unchanged", () => {
    seedInstantiatedWorkingCopy(["ɛ"], { attributed: true });
    useWorkingCopyStore.getState().recordAssignments([a]);
    const s = useWorkingCopyStore.getState();
    expect(selectSessionAssignments(s)).toEqual([a]);
    expect(currentPhysicalLayoutValue().assignments).toEqual([a]);
  });
});
