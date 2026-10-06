import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredNormalizationStep } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import * as ct from "@keyboard-studio/engine/context-tolerance";
import { getOrProposeNormalizationStep, resetNormalizationStepCacheForTests } from "./normalizationStepCache.ts";

vi.mock("@keyboard-studio/engine/context-tolerance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@keyboard-studio/engine/context-tolerance")>();
  return { ...actual, proposeNormalizationStep: vi.fn(actual.proposeNormalizationStep) };
});

const KMN = `store(&VERSION) '10.0'
store(&NAME) 'T'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > U+00E1
+ [K_E] > U+0065 U+0301
`;

const propose = vi.mocked(ct.proposeNormalizationStep);

describe("getOrProposeNormalizationStep", () => {
  beforeEach(() => {
    resetNormalizationStepCacheForTests();
    propose.mockClear();
  });

  it("generates once, then serves memory hits without calling the generator", async () => {
    const ir = parseKmn(KMN).ir;
    const first = await getOrProposeNormalizationStep(ir, null);
    expect(first.source).toBe("generated");
    expect(propose).toHaveBeenCalledTimes(1);
    const second = await getOrProposeNormalizationStep(ir, null);
    expect(second.source).toBe("memory");
    expect(second.result).toBe(first.result);
    expect(propose).toHaveBeenCalledTimes(1);
  });

  it("serves a snapshot hit without calling the generator, in under 1 s", async () => {
    const ir = parseKmn(KMN).ir;
    const seeded = await getOrProposeNormalizationStep(ir, null);
    resetNormalizationStepCacheForTests();
    propose.mockClear();
    const t0 = performance.now();
    const hit = await getOrProposeNormalizationStep(ir, seeded.stored);
    expect(seeded.stored).not.toBeNull();
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(hit.source).toBe("snapshot");
    expect(hit.result).toBe(seeded.stored?.result);
    expect(propose).not.toHaveBeenCalled();
  });

  it("ignores a stale snapshot cacheKey and replaces it", async () => {
    const ir = parseKmn(KMN).ir;
    const seeded = await getOrProposeNormalizationStep(ir, null);
    resetNormalizationStepCacheForTests();
    propose.mockClear();
    const stale: StoredNormalizationStep = { cacheKey: "old|0", result: { kind: "refused", reason: "no-alternates" } };
    const out = await getOrProposeNormalizationStep(ir, stale);
    expect(out.source).toBe("generated");
    expect(propose).toHaveBeenCalledTimes(1);
    expect(out.stored?.cacheKey).toBe(seeded.cacheKey);
    expect(out.cacheKey).not.toBe(stale.cacheKey);
  });

  it("caches a time-bound refusal neither in memory nor in the snapshot", async () => {
    const ir = parseKmn(KMN).ir;
    propose.mockResolvedValueOnce({ kind: "refused", reason: "time-bound" });
    const refused = await getOrProposeNormalizationStep(ir, null);
    expect(refused.result).toEqual({ kind: "refused", reason: "time-bound" });
    expect(refused.stored).toBeNull();
    const retry = await getOrProposeNormalizationStep(ir, null);
    expect(retry.source).toBe("generated");
    expect(propose).toHaveBeenCalledTimes(2);
  });
});
