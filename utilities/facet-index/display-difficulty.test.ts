import { describe, it, expect } from "vitest";
import {
  displayDifficultyOfScript,
  DISPLAY_DIFFICULTY_ERA_BOUNDARIES,
} from "./display-difficulty.ts";
import { firstVersionOfScript } from "./ucd/generated/scriptLookup.ts";

describe("displayDifficultyOfScript", () => {
  it("Basic Latin (old block) is well-supported (US3 AS-1)", () => {
    expect(displayDifficultyOfScript("Latn", { puaObserved: false })).toBe("well-supported");
  });

  it("other long-assigned mainstream scripts are well-supported", () => {
    for (const script of ["Arab", "Cyrl", "Grek", "Deva", "Thai", "Hani"]) {
      expect(displayDifficultyOfScript(script, { puaObserved: false })).toBe("well-supported");
    }
  });

  it("a 6.0–10.0 script is partially-supported", () => {
    // Adlam was first assigned in Unicode 9.0.
    expect(firstVersionOfScript("Adlm")?.[0]).toBe(9);
    expect(displayDifficultyOfScript("Adlm", { puaObserved: false })).toBe("partially-supported");
  });

  it("a ≥ 11.0 script is poorly-supported", () => {
    // Medefaidrin (11.0) and Wancho (12.0) are recently assigned.
    expect(firstVersionOfScript("Medf")?.[0]).toBeGreaterThanOrEqual(11);
    expect(displayDifficultyOfScript("Medf", { puaObserved: false })).toBe("poorly-supported");
    expect(displayDifficultyOfScript("Wcho", { puaObserved: false })).toBe("poorly-supported");
  });

  it("corpus PUA usage forces poorly-supported regardless of block age (US3 AS-2, FR-031)", () => {
    // Latin is the oldest block, yet observed PUA usage overrides to poorly.
    expect(displayDifficultyOfScript("Latn", { puaObserved: true })).toBe("poorly-supported");
    expect(displayDifficultyOfScript("Adlm", { puaObserved: true })).toBe("poorly-supported");
  });

  it("an unknown script falls back to the conservative middle tier", () => {
    expect(firstVersionOfScript("Zzzz")).toBeUndefined();
    expect(displayDifficultyOfScript("Zzzz", { puaObserved: false })).toBe("partially-supported");
  });

  it("era boundaries are contiguous and ordered (matches the YAML derivation params)", () => {
    const { partiallyFromMajor, poorlyFromMajor } = DISPLAY_DIFFICULTY_ERA_BOUNDARIES;
    expect(partiallyFromMajor).toBe(6);
    expect(poorlyFromMajor).toBe(11);
    expect(partiallyFromMajor).toBeLessThan(poorlyFromMajor);
  });
});
