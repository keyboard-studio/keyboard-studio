import { describe, it, expect } from "vitest";
import { derivePunctuationFlags, PUNCTUATION_INVENTORY_ANSWER_ID, PUNCTUATION_STEP_ID } from "./punctuationFlags.ts";
import type { SavedAnswer } from "../../steps/answerTypes.ts";

function saved(evidenceKey: string | null): SavedAnswer {
  return {
    value: ["!"],
    answerType: "char-list",
    origin: "confirmed",
    stage: "confirmed",
    evidenceKey,
    screenId: PUNCTUATION_STEP_ID,
    savedAt: 0,
  };
}

describe("derivePunctuationFlags (spec 079 US3 T079/T080)", () => {
  it("no saved answer -> no flag", () => {
    expect(derivePunctuationFlags(undefined, "hi|")).toEqual([]);
  });

  it("matching key -> no flag", () => {
    expect(derivePunctuationFlags(saved("hi|"), "hi|")).toEqual([]);
  });

  it("null key (pre-079) -> no flag", () => {
    expect(derivePunctuationFlags(saved(null), "hi|")).toEqual([]);
  });

  it("mismatched key -> one flag on the punctuation screen", () => {
    const flags = derivePunctuationFlags(saved("ewo|"), "hi|");
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      answerId: PUNCTUATION_INVENTORY_ANSWER_ID,
      screenId: PUNCTUATION_STEP_ID,
      reason: { code: "evidence-added" },
    });
  });
});
