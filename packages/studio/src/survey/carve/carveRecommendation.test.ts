// carveRecommendation — the lifted recommendation (spec 107 FR-040).

import { describe, it, expect } from "vitest";
import { carveRecommendation } from "./carveRecommendation.ts";

const NEEDED = { neededSet: new Set(["a"]), form: "NFC" as const, bcp47: "fr", hasSignal: true, blockCandidateChars: new Set<string>() };

describe("carveRecommendation", () => {
  it("is not ready, with no rows, before there is an IR, a mode and a signal", () => {
    expect(carveRecommendation({ ir: null, instantiationMode: "new-from-base", retainedConvenienceChars: undefined, needed: NEEDED }))
      .toEqual({ recommendationReady: false, recommended: [], primaryRows: [], optionalLatinRows: [] });
    expect(carveRecommendation({ ir: null, instantiationMode: null, retainedConvenienceChars: [], needed: NEEDED }).recommendationReady).toBe(false);
    expect(carveRecommendation({ ir: null, instantiationMode: "new-from-base", retainedConvenienceChars: [], needed: { ...NEEDED, hasSignal: false } }).recommendationReady).toBe(false);
  });
});
