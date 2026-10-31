import { describe, expect, it } from "vitest";
import type { PlacementCandidate } from "@keyboard-studio/contracts";
import type { PlacementSeedEntry } from "../../survey/placementSeeds.ts";
import type { ScoredCandidate } from "../../survey/placementRationale.ts";
import { orderVisibleSuggestions, preselectMethod } from "./suggestionOrder.ts";

function entry(strategyId: "S-01" | "S-02" | "S-08", ch = "ǎ"): PlacementSeedEntry {
  const topCandidate: PlacementCandidate = {
    vkey: "K_A",
    modifiers: [],
    mechanism: "direct",
    priorSource: "corpus",
    priorCount: 1,
    confidence: 0.9,
  };
  return { character: ch, codepoint: "U+01CE", strategyId, topCandidate };
}

function scored(total: number): ScoredCandidate {
  return { total, factors: [], gated: null, incumbent: null, demotion: null };
}

describe("orderVisibleSuggestions", () => {
  it("orders by score, best first, without mutating the input", () => {
    const a = entry("S-01");
    const b = entry("S-08");
    const c = entry("S-02");
    const input = [a, b, c];
    const scores = new Map([
      [a, scored(10)],
      [b, scored(40)],
      [c, scored(25)],
    ]);
    expect(orderVisibleSuggestions(input, scores)).toEqual([b, c, a]);
    expect(input).toEqual([a, b, c]);
  });

  it("keeps the ranked order on a tie and scores a missing entry as 0", () => {
    const a = entry("S-01");
    const b = entry("S-08");
    const c = entry("S-02");
    const scores = new Map([
      [a, scored(5)],
      [b, scored(5)],
    ]);
    expect(orderVisibleSuggestions([c, a, b], scores)).toEqual([a, b, c]);
  });

  it("is empty for no visible suggestions", () => {
    expect(orderVisibleSuggestions([], new Map())).toEqual([]);
  });
});

describe("preselectMethod", () => {
  it("pre-selects the deadkey card for a decomposable accented letter", () => {
    const pre = preselectMethod({
      currentChar: "ǎ",
      scriptClass: "alphabet",
      sessionAssignments: [],
      workingIr: null,
    });
    expect(pre.method).toBe("deadkey");
    expect(pre.deadkeyBaseLetter).toBe("a");
    expect(pre.proposedTriggerKey).toMatch(/^K_/);
  });

  it("leaves the default method for a plain letter variant", () => {
    const pre = preselectMethod({
      currentChar: "ɛ",
      scriptClass: "alphabet",
      sessionAssignments: [],
      workingIr: null,
    });
    expect(pre.method).toBeNull();
    expect(pre.deadkeyBaseLetter).toBe("");
  });

  it("does not pre-select a deadkey in an abugida", () => {
    const pre = preselectMethod({
      currentChar: "ǎ",
      scriptClass: "abugida",
      sessionAssignments: [],
      workingIr: null,
    });
    expect(pre.method).toBeNull();
  });
});
