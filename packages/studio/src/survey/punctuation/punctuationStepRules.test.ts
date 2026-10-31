import { describe, expect, it, vi } from "vitest";
import type { ExemplarInventory } from "../../lib/services.ts";
import {
  PUNCTUATION_BASE_SEED_PREFIX,
  PUNCTUATION_INVENTORY_ANSWER_ID,
  PUNCTUATION_STEP_ID,
  PUNCTUATION_TIER_SEED_PREFIX,
  baseCoverageOf,
  completePunctuation,
  isPunctuationAlreadyConfirmed,
  isPunctuationChar,
  seedPunctuationBase,
  seedPunctuationTier,
} from "./punctuationStepRules.ts";

function inventory(punctuation: string[]): ExemplarInventory {
  return {
    resolvedTag: "xx",
    source: "cldr",
    confidence: "approved",
    characters: [
      { char: "a", tier: "main", source: "cldr", confidence: "approved" },
      ...punctuation.map((char) => ({ char, tier: "punctuation" as const, source: "cldr" as const, confidence: "approved" as const })),
    ],
    digraphs: [],
  };
}

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

describe("baseCoverageOf", () => {
  it("is null with no working copy", () => {
    expect(baseCoverageOf(null)).toBeNull();
  });
});

describe("seedPunctuationTier", () => {
  it("is a no-op without an inventory", () => {
    const seedProposals = vi.fn();
    seedPunctuationTier({ inventory: null, alreadyConfirmed: false, seedProposals });
    expect(seedProposals).not.toHaveBeenCalled();
  });

  it("seeds the punctuation tier once per resolved locale", () => {
    const seedProposals = vi.fn();
    seedPunctuationTier({ inventory: inventory(["«", "»"]), alreadyConfirmed: false, seedProposals });
    expect(seedProposals).toHaveBeenCalledWith(["«", "»"], "cldr", PUNCTUATION_TIER_SEED_PREFIX + "xx");
  });

  it("records the key with nothing to seed once the step is already confirmed", () => {
    const seedProposals = vi.fn();
    seedPunctuationTier({ inventory: inventory(["«"]), alreadyConfirmed: true, seedProposals });
    expect(seedProposals).toHaveBeenCalledWith([], "cldr", PUNCTUATION_TIER_SEED_PREFIX + "xx");
  });
});

describe("seedPunctuationBase", () => {
  const known = (produced: string[]) => ({ produced, coverageComplete: true });

  it("is a no-op without base coverage", () => {
    const seedProposals = vi.fn();
    seedPunctuationBase({ inventory: null, baseCoverage: null, startKeyboardId: "kb", alreadyConfirmed: false, seedProposals });
    expect(seedProposals).not.toHaveBeenCalled();
  });

  it("seeds what the base produces minus the CLDR tier, keyed by the copied keyboard", () => {
    const seedProposals = vi.fn();
    seedPunctuationBase({
      inventory: inventory(["«"]),
      baseCoverage: known([".", ",", "«"]),
      startKeyboardId: "kb",
      alreadyConfirmed: false,
      seedProposals,
    });
    const [chars, source, key] = seedProposals.mock.calls[0]!;
    expect([...(chars as string[])].sort()).toEqual([",", "."]);
    expect(source).toBe("base");
    expect(key).toBe(PUNCTUATION_BASE_SEED_PREFIX + "kb");
  });

  it("falls back to the ASCII floor, without its symbols, when the base output is not fully known", () => {
    const seedProposals = vi.fn();
    seedPunctuationBase({
      inventory: null,
      baseCoverage: { produced: [], coverageComplete: false },
      startKeyboardId: undefined,
      alreadyConfirmed: false,
      seedProposals,
    });
    const [chars, source, key] = seedProposals.mock.calls[0]!;
    expect(source).toBe("ascii-floor");
    expect(key).toBe(PUNCTUATION_BASE_SEED_PREFIX + "working-copy");
    expect((chars as string[]).length).toBeGreaterThan(0);
    expect((chars as string[]).every(isPunctuationChar)).toBe(true);
    expect(chars).not.toContain("$");
  });

  it("records the key with nothing to seed once the step is already confirmed", () => {
    const seedProposals = vi.fn();
    seedPunctuationBase({ inventory: null, baseCoverage: known(["."]), startKeyboardId: "kb", alreadyConfirmed: true, seedProposals });
    expect(seedProposals).toHaveBeenCalledWith([], "base", PUNCTUATION_BASE_SEED_PREFIX + "kb");
  });
});
