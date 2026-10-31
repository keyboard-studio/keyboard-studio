// carveContinue — the marked-until-Continue rule, driven without React.
// Rows are hand-built; the store actions are the real ones.

import { beforeEach, describe, expect, it } from "vitest";
import type { RecommendedRemovalChar } from "../../lib/irToCarveNodes.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import {
  carveDecisionInput,
  continueCarve,
  isMarkedCarveRow,
  skipCarve,
} from "./carveContinue.ts";

function row(ch: string, ruleNodeIds: string[], caseGroup?: string[]): RecommendedRemovalChar {
  return {
    ch,
    contributors: { targetChar: ch, ruleNodeIds, storeSlotIds: [] },
    ...(caseGroup === undefined ? {} : { caseGroup }),
  } as unknown as RecommendedRemovalChar;
}

const rows = [row("q", ["r-q"]), row("x", ["r-x"]), row("z", [])];
const state = () => useWorkingCopyStore.getState();

beforeEach(() => {
  state().reset();
});

describe("isMarkedCarveRow", () => {
  const primary = new Set(rows);
  const none = () => false;

  it("marks a primary row with ids that is neither discarded nor kept", () => {
    expect(isMarkedCarveRow(rows[0]!, primary, none, new Set())).toBe(true);
  });

  it("does not mark a row that is discarded, kept, id-less or not primary", () => {
    expect(isMarkedCarveRow(rows[0]!, primary, () => true, new Set())).toBe(false);
    expect(isMarkedCarveRow(rows[0]!, primary, none, new Set(["q"]))).toBe(false);
    expect(isMarkedCarveRow(rows[2]!, primary, none, new Set())).toBe(false);
    expect(isMarkedCarveRow(rows[0]!, new Set(), none, new Set())).toBe(false);
  });
});

describe("continueCarve", () => {
  it("discards every marked row as a derived removal and decides `default`", () => {
    const decision = continueCarve(rows, true);
    expect(decision.id).toBe("carved-layout");
    expect(decision.provenance).toBe("default");
    expect(decision.value.removals.map((r) => `${r.kind}:${r.id}:${r.provenance}`)).toEqual([
      "item:r-q:derived",
      "item:r-x:derived",
      "char:q:derived",
      "char:x:derived",
    ]);
    expect(decision.value.suggestionFingerprint).toBe('["q","x","z"]');
    expect(decision).toEqual(carveDecisionInput());
  });

  it("leaves a kept row alone and records it", () => {
    state().setCarveSuggestion({ fingerprint: '["q","x","z"]', derived: [], kept: ["x"] });
    const decision = continueCarve(rows, true);
    // Carve removal ids, not a question order.
    const removedIds = decision.value.removals.map((r) => r.id);
    expect(removedIds).toEqual(["r-q", "q"]);
    expect(decision.provenance).toBe("asked");
  });

  it("does nothing until the recommendation is ready", () => {
    const decision = continueCarve(rows, false);
    expect(decision.value.removals).toEqual([]);
    expect(state().carveSuggestion).toBeNull();
  });

  it("carves every member of a case group", () => {
    continueCarve([row("c", ["r-c"], ["C", "c"])], true);
    expect([...state().carveChars].sort()).toEqual(["C", "c"]);
  });
});

describe("skipCarve", () => {
  it("keeps every suggested character and decides `asked`", () => {
    continueCarve(rows, true);
    const decision = skipCarve(rows);
    expect(decision.value.removals).toEqual([]);
    expect(decision.provenance).toBe("asked");
    expect(state().carveSuggestion).toEqual({
      fingerprint: '["q","x","z"]',
      derived: [],
      kept: ["q", "x", "z"],
      touched: true,
    });
  });

  it("records no kept characters when nothing was suggested", () => {
    skipCarve([]);
    expect(state().carveSuggestion).toEqual({
      fingerprint: "[]",
      derived: [],
      kept: [],
      touched: true,
    });
  });
});
