// see spec.md §7.2 §9 — filterFor() unit tests
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pattern, BaseKeyboard, DiscoveryAxisVector } from "@keyboard-studio/contracts";
import { filterFor } from "./filterFor.js";

// Minimal Pattern factory for test doubles
function makePattern(
  overrides: Partial<Pattern> & Pick<Pattern, "id">
): Pattern {
  return {
    title: overrides.id,
    description: "",
    category: "deadkey",
    appliesTo: [],
    tests: [],
    kmnFragment: "",
    ...overrides,
  } as unknown as Pattern;
}

vi.mock("./loader.js", () => ({
  getPatterns: vi.fn(),
}));

import { getPatterns } from "./loader.js";
const mockGetPatterns = vi.mocked(getPatterns);

const latinBase: BaseKeyboard = { script: "Latn" } as unknown as BaseKeyboard;
const arabicBase: BaseKeyboard = { script: "Arab" } as unknown as BaseKeyboard;

describe("filterFor()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("axes absent — returns all eligible patterns as appliesTo-match", async () => {
    const patterns: Pattern[] = [
      makePattern({ id: "p1", appliesTo: [] }),
      makePattern({ id: "p2", appliesTo: ["Latn"] }),
      makePattern({ id: "p3", appliesTo: ["Arab"] }),
    ];
    mockGetPatterns.mockReturnValue(patterns);

    const result = await filterFor(latinBase, undefined);

    // p1 (universal) and p2 (Latin) match; p3 (Arab) does not
    expect(result).toHaveLength(2);
    expect(result.every(m => m.reason === "appliesTo-match")).toBe(true);
    expect(result.map(m => m.patternId)).toEqual(["p1", "p2"]);
    expect(result[0]!.rank).toBe(1);
    expect(result[1]!.rank).toBe(2);
  });

  it("axes present — ranks by primary-strategy, secondary-strategy, then appliesTo-match", async () => {
    const patterns: Pattern[] = [
      makePattern({ id: "primary-p", appliesTo: [], strategyId: "S-02" }),
      makePattern({ id: "secondary-p", appliesTo: [], strategyId: "S-04" }),
      makePattern({ id: "applies-p", appliesTo: [] }),
      makePattern({ id: "off-strategy-p", appliesTo: [], strategyId: "S-12" }),
    ];
    mockGetPatterns.mockReturnValue(patterns);

    // Rule 7: stacking-combining + small/medium → S-02 primary, S-04 secondary
    const axes: DiscoveryAxisVector = {
      diacriticBehavior: "stacking-combining",
      scale: "small",
    } as unknown as DiscoveryAxisVector;

    const result = await filterFor(arabicBase, axes);

    expect(result).toHaveLength(3);
    expect(result[0]!.patternId).toBe("primary-p");
    expect(result[0]!.reason).toBe("primary-strategy");
    expect(result[1]!.patternId).toBe("secondary-p");
    expect(result[1]!.reason).toBe("secondary-strategy");
    expect(result[2]!.patternId).toBe("applies-p");
    expect(result[2]!.reason).toBe("appliesTo-match");
    expect(result[0]!.rank).toBe(1);
    expect(result[2]!.rank).toBe(3);
    expect(result.map(m => m.patternId)).not.toContain("off-strategy-p");
  });

  it("Latin script — reorder-category patterns are excluded", async () => {
    const patterns: Pattern[] = [
      makePattern({ id: "reorder-p", category: "reorder", appliesTo: [] }),
      makePattern({ id: "deadkey-p", category: "deadkey", appliesTo: [] }),
    ];
    mockGetPatterns.mockReturnValue(patterns);

    const result = await filterFor(latinBase, undefined);

    expect(result.map(m => m.patternId)).toEqual(["deadkey-p"]);
  });
});
