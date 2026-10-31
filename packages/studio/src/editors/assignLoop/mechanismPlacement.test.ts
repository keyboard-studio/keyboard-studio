// The mechanism step's lifted placement decisions (spec 107 FR-040).

import { describe, expect, it } from "vitest";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import {
  buildNeedSets,
  canGoNextFor,
  companionConfirmAssignments,
  dismissedSuggestionEntryKey,
  displacementConfirmAssignments,
  displacementOutcomeFor,
  excludeSequenceMechanisms,
  placementOffer,
  placementSequence,
  placementWalkList,
  type PlacementRecord,
} from "./mechanismPlacement.ts";
import type { CasePairProposal } from "./casePairCompanion.ts";
import type { DisplacementProposal } from "./useDisplacementProposal.ts";

const swap = (target: string, kmnRules: string): MechanismAssignment => ({
  scope: "individual",
  target,
  modality: "physical",
  mechanisms: [{ patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules } }],
  source: "user",
});

const sequence = (target: string): MechanismAssignment => ({
  scope: "individual",
  target,
  modality: "physical",
  mechanisms: [
    {
      patternId: "multi_char_sequence",
      strategyId: "S-03",
      slotValues: { firstLetterOut: "zzq", secondLetter: "j", collapsedChar: target },
    },
  ],
  source: "user",
});

describe("placementWalkList", () => {
  it("keeps the letters inside the placement set, NFC-deduped, in collated order", () => {
    const out = placementWalkList(["B", "a", "é", "é", "z"], ["a", "B", "é"], new Set());
    expect(out).toEqual(["a", "B", "é"]);
  });
});

describe("excludeSequenceMechanisms and canGoNextFor", () => {
  const assignments = [swap("a", "+ [K_A] > 'a'"), sequence("b")];

  it("drops an all-sequence assignment from the covered view", () => {
    expect(excludeSequenceMechanisms(assignments).map((a) => a.target)).toEqual(["a"]);
  });

  it("enables Next for a covered, sequenced or marked character and not for an untouched one", () => {
    const mech = excludeSequenceMechanisms(assignments);
    expect(canGoNextFor("a", mech, assignments, new Set())).toBe(true);
    expect(canGoNextFor("b", mech, assignments, new Set())).toBe(true);
    expect(canGoNextFor("c", mech, assignments, new Set())).toBe(false);
    expect(canGoNextFor("c", mech, assignments, new Set(["c"]))).toBe(true);
    expect(canGoNextFor(null, mech, assignments, new Set())).toBe(false);
  });
});

describe("placementOffer", () => {
  it("offers nothing without a placement map", () => {
    const offer = placementOffer({
      currentChar: "ŋ",
      placementMap: undefined,
      bcp47: "",
      sessionAssignments: [],
      mechanismAssignments: [],
      dismissedEntries: new Set([dismissedSuggestionEntryKey("ŋ", "S-01")]),
      rowDismissed: false,
      slotOccupancy: new Map(),
      needSets: buildNeedSets(["ŋ"], new Set()),
      workingIr: null,
      baseOnlyProducedSet: new Set(),
      baseProducedSet: new Set(),
    });
    expect(offer.suggestions).toEqual([]);
    expect(offer.orderedVisibleSuggestions).toEqual([]);
    expect(offer.rowOffered).toBe(false);
  });
});

describe("companionConfirmAssignments", () => {
  const base = swap("ŋ", "+ [K_X] > U+014B");

  const physical = (over: Partial<Extract<CasePairProposal, { mechanism: "physical" }>> = {}): CasePairProposal => ({
    mechanism: "physical",
    originalChar: "ŋ",
    counterpart: "Ŋ",
    vkey: "K_X",
    capsHandling: false,
    baseAssignment: base,
    ...over,
  });

  it("appends the shift-layer companion for the counterpart", () => {
    const next = companionConfirmAssignments(physical(), [base]);
    expect(next).not.toBeNull();
    expect(next).toHaveLength(2);
    expect(next?.[0]).toBe(base);
    expect(next?.[1]?.target).toBe("Ŋ");
    expect(next?.[1]?.mechanisms[0]?.slotValues?.["kmnRules"]).toContain("SHIFT K_X");
  });

  it("replaces the base assignment with one combined assignment on a CAPS-handling key", () => {
    const next = companionConfirmAssignments(physical({ capsHandling: true }), [base]);
    expect(next).toHaveLength(1);
    expect(next?.[0]?.target).toBe("ŋ");
    expect(next?.[0]).not.toBe(base);
  });

  it("records nothing when the assignment it was raised for is gone, or for a touch proposal", () => {
    expect(companionConfirmAssignments(physical(), [])).toBeNull();
    const touch: CasePairProposal = {
      mechanism: "touch",
      originalChar: "ŋ",
      counterpart: "Ŋ",
      baseKey: "K_X",
      targetLayer: "shift",
      targetLayerLabel: "Shift",
      baseRef: base.mechanisms[0]!,
    };
    expect(companionConfirmAssignments(touch, [base])).toBeNull();
  });

  it("adds the SHIFT variant of an RAlt placement", () => {
    const ralt: CasePairProposal = {
      mechanism: "ralt-layer",
      originalChar: "ɨ",
      counterpart: "Ɨ",
      vkey: "K_I",
      baseModifiers: ["RALT"],
      baseAssignment: base,
    };
    const next = companionConfirmAssignments(ralt, [base]);
    expect(next?.[1]?.target).toBe("Ɨ");
    expect(next?.[1]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe("[SHIFT RALT K_I]");
  });
});

describe("displacementConfirmAssignments", () => {
  const base = swap("ŋ", "+ [K_X] > U+014B");
  const proposal: DisplacementProposal = {
    displacedChar: "x",
    incomingChar: "ŋ",
    vkey: "K_X",
    modifiers: [],
    demotionMethod: "ralt",
    direction: "demote-incumbent",
    baseAssignment: base,
  };

  it("records the displaced glyph's RAlt demotion on the same key", () => {
    const next = displacementConfirmAssignments(proposal, [base], null);
    expect(next).toHaveLength(2);
    expect(next?.[1]?.target).toBe("x");
    expect(next?.[1]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe("[RALT K_X]");
  });

  it("swaps the primary away when the incoming character is the one demoted", () => {
    const next = displacementConfirmAssignments({ ...proposal, direction: "demote-incoming" }, [base], null);
    expect(next).toHaveLength(1);
    expect(next?.[0]?.target).toBe("ŋ");
    expect(next?.[0]).not.toBe(base);
  });

  it("records nothing for a stale proposal", () => {
    expect(displacementConfirmAssignments(proposal, [], null)).toBeNull();
  });
});

describe("displacementOutcomeFor", () => {
  const base = swap("ŋ", "+ [K_X] > U+014B");
  const proposal: DisplacementProposal = {
    displacedChar: "x",
    incomingChar: "ŋ",
    vkey: "K_X",
    modifiers: [],
    demotionMethod: "ralt",
    direction: "demote-incumbent",
    baseAssignment: base,
  };

  it("confirm-move records what the confirm records", () => {
    expect(displacementOutcomeFor("confirm-move", proposal, [base], null)).toEqual({
      kind: "record",
      next: displacementConfirmAssignments(proposal, [base], null),
    });
  });

  it("the both-core demotion override records the displaced glyph's demotion", () => {
    const outcome = displacementOutcomeFor("demote-displaced", { ...proposal, direction: "both-core" }, [base], null);
    expect(outcome.kind).toBe("record");
    expect(outcome.kind === "record" ? outcome.next?.[1]?.target : undefined).toBe("x");
  });

  it("keep-both and leave are the recorded dismissal", () => {
    expect(displacementOutcomeFor("keep-both", proposal, [base], null)).toEqual({ kind: "dismiss" });
    expect(displacementOutcomeFor("leave", proposal, [base], null)).toEqual({ kind: "dismiss" });
  });

  it("a stale proposal records nothing", () => {
    expect(displacementOutcomeFor("confirm-move", proposal, [], null)).toEqual({ kind: "record", next: null });
  });
});

describe("placementSequence", () => {
  const assignment = swap("a", "+ [K_A] > 'a'");
  const existing = swap("b", "+ [K_B] > 'b'");
  const companion = (id: string) => ({ originalChar: id }) as never;
  const displacement = { displacedChar: "x" } as never;
  const plan = (over: Partial<PlacementRecord>): PlacementRecord => ({
    kind: "record",
    assignment,
    companionBefore: null,
    displacement: null,
    companionAfter: null,
    ...over,
  });

  it("with no proposals is the record alone, appending to the current assignments", () => {
    const steps = placementSequence(plan({}), [existing]);
    expect(steps).toEqual([{ kind: "record", assignment, next: [existing, assignment] }]);
  });

  it("orders companionBefore, record, displacement, companionAfter", () => {
    const before = companion("before");
    const after = companion("after");
    const steps = placementSequence(
      plan({ companionBefore: before, displacement, companionAfter: after }),
      [existing],
    );
    expect(steps.map((s) => s.kind)).toEqual([
      "propose-companion",
      "record",
      "propose-displacement",
      "propose-companion",
    ]);
    expect(steps[0]).toEqual({ kind: "propose-companion", input: before });
    expect(steps[2]).toEqual({ kind: "propose-displacement", input: displacement });
    expect(steps[3]).toEqual({ kind: "propose-companion", input: after });
  });

  it("skips absent proposals and does not mutate the current assignments", () => {
    const current = [existing];
    const steps = placementSequence(plan({ displacement }), current);
    expect(steps.map((s) => s.kind)).toEqual(["record", "propose-displacement"]);
    expect(current).toEqual([existing]);
  });
});
