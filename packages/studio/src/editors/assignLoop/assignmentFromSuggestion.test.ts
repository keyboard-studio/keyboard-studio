import { describe, expect, it } from "vitest";
import type { MechanismAssignment, PlacementCandidate } from "@keyboard-studio/contracts";
import type { PlacementSeedEntry } from "../../survey/placementSeeds.ts";
import {
  assignmentFromSuggestion,
  buildDeadkeyAssignment,
  deadkeyPlacementFor,
  demotionAssignmentFor,
  newTriggerEscapes,
  swapAssignmentFor,
} from "./assignmentFromSuggestion.ts";
import { PATTERN_DEADKEY, PATTERN_RALT, PATTERN_SWAP } from "./patternIds.ts";

function entry(
  strategyId: "S-01" | "S-02" | "S-08",
  candidate: Partial<PlacementCandidate> = {},
): PlacementSeedEntry {
  return {
    character: "ɛ",
    codepoint: "U+025B",
    strategyId,
    topCandidate: {
      vkey: "K_E",
      modifiers: ["RALT"],
      mechanism: "direct",
      priorSource: "corpus",
      priorCount: 3,
      confidence: 0.9,
      ...candidate,
    },
  };
}

const base = {
  currentChar: "ɛ",
  sessionAssignments: [] as MechanismAssignment[],
  workingIr: null,
  slotOccupancy: new Map(),
  triggerKey: "K_COLON",
  triggerKeyCustomChar: "",
  proposedTriggerKey: "K_COLON",
};

describe("assignmentFromSuggestion", () => {
  it("builds an S-01 swap rule for the candidate key", () => {
    const r = assignmentFromSuggestion({ ...base, entry: entry("S-01", { modifiers: [] }) });
    expect(r.kind).toBe("assignment");
    if (r.kind !== "assignment") return;
    expect(r.assignment.mechanisms[0]).toMatchObject({
      patternId: PATTERN_SWAP,
      strategyId: "S-01",
      slotValues: { kmnRules: "+ [K_E] > U+025B" },
    });
    expect(r.raltCompanionModifiers).toBeNull();
  });

  it("builds an S-08 layer rule from the candidate's own modifiers and flags the companion", () => {
    const r = assignmentFromSuggestion({ ...base, entry: entry("S-08") });
    expect(r.kind).toBe("assignment");
    if (r.kind !== "assignment") return;
    expect(r.assignment.mechanisms[0]).toMatchObject({
      patternId: PATTERN_RALT,
      slotValues: { altgrKeyList: "[RALT K_E]", altgrOutputList: "ɛ" },
    });
    expect(r.raltCompanionModifiers).toEqual(["RALT"]);
  });

  it("does not flag a companion for a candidate that already carries SHIFT", () => {
    const r = assignmentFromSuggestion({
      ...base,
      entry: entry("S-08", { modifiers: ["SHIFT", "RALT"] }),
    });
    expect(r.kind === "assignment" && r.raltCompanionModifiers).toBeNull();
  });

  it("dismisses an S-08 chip whose combo is mutually exclusive", () => {
    const r = assignmentFromSuggestion({
      ...base,
      entry: entry("S-08", { modifiers: ["CAPS", "NCAPS"] }),
    });
    expect(r).toEqual({ kind: "dismiss", reason: "invalid-combo" });
  });

  it("builds an S-02 deadkey with a minted id and returns its identity", () => {
    const r = assignmentFromSuggestion({
      ...base,
      entry: entry("S-02", { mechanism: "deadkey", modifiers: [], baseLetter: "e" }),
    });
    expect(r.kind).toBe("assignment");
    if (r.kind !== "assignment" || r.deadkey === null) throw new Error("expected deadkey");
    expect(r.deadkey.deadkeyName).toBe("3000");
    expect(r.assignment.mechanisms[0]).toMatchObject({
      patternId: PATTERN_DEADKEY,
      strategyId: "S-02",
      slotValues: { triggerKey: "K_COLON", baseLetters: "e", accentedForms: "ɛ" },
    });
  });

  it("dismisses an S-02 chip with no base letter", () => {
    const r = assignmentFromSuggestion({
      ...base,
      entry: entry("S-02", { mechanism: "deadkey", modifiers: [] }),
    });
    expect(r).toEqual({ kind: "dismiss", reason: "no-base-letter" });
  });

  it("prefills the deadkey card when the trigger does not resolve", () => {
    const r = assignmentFromSuggestion({
      ...base,
      triggerKey: "",
      proposedTriggerKey: "K_COLON",
      entry: entry("S-02", { mechanism: "deadkey", modifiers: [], baseLetter: "e" }),
    });
    expect(r).toEqual({ kind: "prefill-deadkey", triggerKey: "", baseLetter: "e" });
  });
});

describe("swapAssignmentFor", () => {
  it("zero layers is a bare S-01 base-key rule", () => {
    const r = swapAssignmentFor({ currentChar: "ɛ", vkey: "K_E", chosenTokens: [], workingIr: null });
    expect(r?.assignment.mechanisms[0]?.slotValues?.["kmnRules"]).toContain("[K_E]");
    expect(r?.assignment.mechanisms[0]?.patternId).toBe(PATTERN_SWAP);
    expect(r?.capsHandling).toBe(false);
  });

  it("a lone SHIFT is an S-01 shift-plane rule", () => {
    const r = swapAssignmentFor({ currentChar: "Ɛ", vkey: "K_E", chosenTokens: ["SHIFT"], workingIr: null });
    expect(r?.assignment.mechanisms[0]?.patternId).toBe(PATTERN_SWAP);
    expect(r?.assignment.mechanisms[0]?.slotValues?.["kmnRules"]).toContain("SHIFT");
  });

  it("other combos are an S-08 layer rule", () => {
    const r = swapAssignmentFor({ currentChar: "ɛ", vkey: "K_E", chosenTokens: ["RALT"], workingIr: null });
    expect(r?.assignment.mechanisms[0]).toMatchObject({
      patternId: PATTERN_RALT,
      slotValues: { altgrKeyList: "[RALT K_E]", altgrOutputList: "ɛ" },
    });
  });

  it("is null for a mutually-exclusive combo", () => {
    expect(
      swapAssignmentFor({ currentChar: "ɛ", vkey: "K_E", chosenTokens: ["CAPS", "NCAPS"], workingIr: null }),
    ).toBeNull();
  });
});

describe("deadkeyPlacementFor / buildDeadkeyAssignment / newTriggerEscapes", () => {
  it("records escapes on a trigger's first placement only", () => {
    const first = deadkeyPlacementFor({
      currentChar: "ǎ",
      baseLetter: "a",
      triggerKey: "K_COLON",
      triggerResolution: { kind: "key", vkey: "K_COLON" },
      workingIr: null,
      sessionAssignments: [],
      slotOccupancy: new Map(),
    });
    expect(first?.assignment.mechanisms[0]?.slotValues?.["escapes"]).toBe("double-tap space altgr");
    const second = deadkeyPlacementFor({
      currentChar: "ě",
      baseLetter: "e",
      triggerKey: "K_COLON",
      triggerResolution: { kind: "key", vkey: "K_COLON" },
      workingIr: null,
      sessionAssignments: first ? [first.assignment] : [],
      slotOccupancy: new Map(),
    });
    expect(second?.deadkeyName).toBe(first?.deadkeyName);
    expect(second?.assignment.mechanisms[0]?.slotValues).not.toHaveProperty("escapes");
  });

  it("omits the escapes slot when none is given", () => {
    const a = buildDeadkeyAssignment({
      currentChar: "ǎ",
      baseLetter: "a",
      triggerVkey: "K_COLON",
      deadkeyName: "3000",
      accentChar: ";",
    });
    expect(a.mechanisms[0]?.slotValues).not.toHaveProperty("escapes");
    expect(newTriggerEscapes("K_COLON", [], new Map())).toBe("double-tap space altgr");
  });
});

describe("demotionAssignmentFor", () => {
  it("demotes to RAlt on the same key", () => {
    const a = demotionAssignmentFor({
      targetChar: "ʼ",
      vkey: "K_QUOTE",
      demotionMethod: "ralt",
      sessionAssignments: [],
      workingIr: null,
    });
    expect(a?.mechanisms[0]).toMatchObject({
      patternId: PATTERN_RALT,
      slotValues: { altgrKeyList: "[RALT K_QUOTE]", altgrOutputList: "ʼ" },
    });
  });

  it("demotes behind a deadkey when RAlt is taken", () => {
    const a = demotionAssignmentFor({
      targetChar: "ʼ",
      vkey: "K_QUOTE",
      demotionMethod: "deadkey",
      sessionAssignments: [],
      workingIr: null,
    });
    expect(a?.mechanisms[0]).toMatchObject({
      patternId: PATTERN_DEADKEY,
      slotValues: { baseLetters: "ʼ", accentedForms: "ʼ" },
    });
  });
});
