// useFlaggedNextGate.test.ts — spec 079 US3 T046/T080 (FR-013).

import { describe, expect, it } from "vitest";
import { computeFlaggedNextGate } from "./useFlaggedNextGate.ts";
import type { WorkItem } from "../steps/workToDo.ts";

const REASON = { code: "evidence-added" as const, subject: "b", sourceStepId: "characters" };

function reproposed(screenId: string, answerId = `${screenId}.a`): WorkItem {
  return { kind: "reproposed", stepId: "marks", screenId, answerId, reason: REASON };
}

describe("computeFlaggedNextGate", () => {
  const order = ["s1", "s2", "s3"];

  it("blocks when a flagged screen sits before the current position", () => {
    const result = computeFlaggedNextGate([reproposed("s1")], order, "s2");
    expect(result.blocked).toBe(true);
    expect(result.flaggedBefore).toHaveLength(1);
  });

  it("does not block on the CURRENT screen's own flag (item 7)", () => {
    const result = computeFlaggedNextGate([reproposed("s2")], order, "s2");
    expect(result.blocked).toBe(false);
  });

  it("does not block on a flag AFTER the current position", () => {
    const result = computeFlaggedNextGate([reproposed("s3")], order, "s1");
    expect(result.blocked).toBe(false);
  });

  it("never blocks on an unresolved/unknown position (treated as the first screen)", () => {
    const result = computeFlaggedNextGate([reproposed("s1")], order, null);
    expect(result.blocked).toBe(false);
  });

  it("ignores non-reproposed work items", () => {
    const items: WorkItem[] = [{ kind: "unassigned", stepId: "mechanisms", count: 2 }];
    const result = computeFlaggedNextGate(items, order, "s2");
    expect(result.blocked).toBe(false);
  });

  it("ignores a flagged screen not in this step's own walk", () => {
    const result = computeFlaggedNextGate([reproposed("other-step-screen")], order, "s2");
    expect(result.blocked).toBe(false);
  });
});
