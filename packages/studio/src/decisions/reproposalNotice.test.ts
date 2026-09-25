// reproposalNotice.test — the FR-016 notice's step-naming half (spec 079
// T064, journey-strip-contract.md §9).

import { describe, it, expect } from "vitest";
import type { WorkItem } from "../steps/workToDo.ts";
import { affectedStepNames } from "./reproposalNotice.ts";

function reproposed(stepId: string, screenId: string): WorkItem {
  return {
    kind: "reproposed",
    stepId,
    screenId,
    answerId: `${screenId}.a1`,
    reason: { code: "evidence-added", subject: "x", sourceStepId: "characters" },
  };
}

describe("affectedStepNames — catalog labels only, never a raw step id", () => {
  it("names a single affected step by its catalog label", () => {
    expect(affectedStepNames([reproposed("marks", "ms_series_s1")])).toBe("Accents & marks");
  });

  it("never surfaces the raw step id", () => {
    // "touch_seed_source" has an underscore-joined raw id distinct from its
    // catalog label ("Touch seed") — a substring match here would only pass
    // by accident the way a same-cased word like "marks" could.
    const names = affectedStepNames([reproposed("touch_seed_source", "tss1")]);
    expect(names).toBe("Touch seed");
    expect(names).not.toContain("touch_seed_source");
    expect(names).not.toContain("_");
  });

  it("de-duplicates and lists more than one affected step, in first-appearance order", () => {
    const names = affectedStepNames([
      reproposed("marks", "ms_series_s1"),
      reproposed("punctuation", "p1"),
      reproposed("marks", "ms_series_s2"),
    ]);
    expect(names).toContain("Accents & marks");
    expect(names).toContain("Punctuation");
    // Not literally "marks, punctuation, marks" — de-duplicated.
    expect(names.match(/Accents & marks/g)?.length).toBe(1);
  });

  it("an empty delta names nothing (never throws)", () => {
    expect(affectedStepNames([])).toBe("");
  });
});
