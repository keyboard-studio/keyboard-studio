// The context-tolerance analysis with the normalization step (spec 086
// FR-017..FR-019): gap findings propose the step; a refusal other than
// `no-alternates` falls back to the 062 variants and says why; `no-alternates`
// proposes nothing; a committed verification verdict of `regressed` forces the
// fallback.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeyboardIR, NormalizationStepResult } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";

import { analyseContextTolerance } from "./contextToleranceAnalysis.ts";
import * as cache from "./normalizationStepCache.ts";

vi.mock("./normalizationStepCache.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./normalizationStepCache.ts")>();
  return { ...actual, getOrProposeNormalizationStep: vi.fn(actual.getOrProposeNormalizationStep) };
});

const getStep = vi.mocked(cache.getOrProposeNormalizationStep);

// A mnemonic keyboard whose acute key only works on the joined a-grave: the
// separate-character form falls through to the bare fallback (a gap).
const KMN = [
  "store(&NAME) 'Analysis'",
  "store(&VERSION) '14.0'",
  "store(&TARGETS) 'any'",
  "store(&mnemoniclayout) '1'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "store(base) U+00E0",
  "store(acute) U+00E2",
  "store(key.act) ']'",
  "any(base) + any(key.act) > index(acute,1)",
  "+ ']' > U+00B4",
  "",
].join("\n");

const parse = (): KeyboardIR => parseKmn(KMN, "analysis_fixture").ir;

async function analyse(options = {}) {
  const result = await analyseContextTolerance(parse(), () => true, null, options);
  if (result === null) throw new Error("analysis was superseded");
  return result;
}

function forceResult(result: NormalizationStepResult): void {
  getStep.mockResolvedValueOnce({ result, stored: { cacheKey: "k|v", result }, source: "generated" });
}

beforeEach(() => {
  cache.resetNormalizationStepCacheForTests();
  getStep.mockClear();
});

describe("analyseContextTolerance with the normalization step (spec 086)", () => {
  it("proposes the step as the single all-or-nothing site when there are gap findings", async () => {
    const stored: string[] = [];
    const result = await analyse({ onNormalizationStored: (s: { cacheKey: string }) => stored.push(s.cacheKey) });
    expect(result.normalizationStep).toBeDefined();
    expect(result.normalizationStep?.ruleCount).toBeGreaterThan(0);
    expect(result.fallbackReason).toBeUndefined();
    expect(result.fixableRuleIds).toEqual(["normalization-step"]);
    expect(result.siteKeys).toEqual({ "normalization-step": "normalization-step" });
    expect(result.proposal.variants).toEqual([]);
    expect(stored).toHaveLength(1);
  }, 60_000);

  it("falls back to the 062 variants on a refusal other than no-alternates, carrying the reason", async () => {
    forceResult({ kind: "refused", reason: "opaque-output-store" });
    const result = await analyse();
    expect(result.normalizationStep).toBeUndefined();
    expect(result.fallbackReason).toBe("opaque-output-store");
    expect(result.proposal.variants.length).toBeGreaterThan(0);
    expect(result.fixableRuleIds.length).toBeGreaterThan(0);
    expect(result.fixableRuleIds).not.toContain("normalization-step");
  }, 60_000);

  it("proposes nothing on no-alternates: neither the step nor the fallback", async () => {
    forceResult({ kind: "refused", reason: "no-alternates" });
    const result = await analyse();
    expect(result.normalizationStep).toBeUndefined();
    expect(result.fallbackReason).toBeUndefined();
    expect(result.proposal.variants).toEqual([]);
    expect(result.fixableRuleIds).toEqual([]);
  }, 60_000);

  it("forces the fallback when the injected verification lookup reports regressed", async () => {
    const lookup = vi.fn(() => "regressed" as const);
    const result = await analyse({ verificationLookup: lookup });
    expect(lookup).toHaveBeenCalledWith("analysis_fixture");
    expect(result.normalizationStep).toBeUndefined();
    expect(result.fallbackReason).toBe("verification-regressed");
    expect(result.proposal.variants.length).toBeGreaterThan(0);
  }, 60_000);

  it("keeps the step when the lookup reports verified or unknown", async () => {
    for (const verdict of ["verified", "unknown"] as const) {
      const result = await analyse({ verificationLookup: () => verdict });
      expect(result.normalizationStep).toBeDefined();
    }
  }, 60_000);
});
