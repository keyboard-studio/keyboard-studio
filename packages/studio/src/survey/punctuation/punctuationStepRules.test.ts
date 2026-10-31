import { describe, expect, it, vi } from "vitest";
import {
  PUNCTUATION_INVENTORY_ANSWER_ID,
  PUNCTUATION_STEP_ID,
  completePunctuation,
  isPunctuationAlreadyConfirmed,
  isPunctuationChar,
} from "./punctuationStepRules.ts";

describe("isPunctuationAlreadyConfirmed", () => {
  const confirmed = [{ phase: "C" as const, answers: [], confirmedInventory: ["."] }];

  it("needs a phase-C inventory on the session", () => {
    expect(isPunctuationAlreadyConfirmed({ phaseResults: [], confirmedForKey: undefined, evidenceKey: "k" })).toBe(false);
  });

  it("holds for the evidence it was confirmed on, and for a confirmation that recorded no key", () => {
    expect(isPunctuationAlreadyConfirmed({ phaseResults: confirmed, confirmedForKey: "k", evidenceKey: "k" })).toBe(true);
    expect(isPunctuationAlreadyConfirmed({ phaseResults: confirmed, confirmedForKey: undefined, evidenceKey: "k" })).toBe(true);
    expect(isPunctuationAlreadyConfirmed({ phaseResults: confirmed, confirmedForKey: null, evidenceKey: "k" })).toBe(true);
    expect(isPunctuationAlreadyConfirmed({ phaseResults: confirmed, confirmedForKey: "old", evidenceKey: "k" })).toBe(false);
  });
});

describe("completePunctuation", () => {
  it("records the evidence key the inventory was confirmed for and reports a phase-C result", () => {
    const saveAnswer = vi.fn();
    const result = completePunctuation({ evidenceKey: "tag|base", saveAnswer });
    expect(result.phase).toBe("C");
    expect(saveAnswer).toHaveBeenCalledWith(
      PUNCTUATION_STEP_ID,
      PUNCTUATION_INVENTORY_ANSWER_ID,
      expect.objectContaining({ evidenceKey: "tag|base", answerType: "char-list", origin: "confirmed" }),
    );
  });
});

describe("isPunctuationChar", () => {
  it("accepts punctuation and rejects letters", () => {
    expect(isPunctuationChar(".")).toBe(true);
    expect(isPunctuationChar("a")).toBe(false);
  });
});
