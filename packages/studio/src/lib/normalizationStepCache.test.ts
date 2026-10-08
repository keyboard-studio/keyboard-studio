import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredNormalizationStep } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import * as ct from "@keyboard-studio/engine/context-tolerance";
import {
  getOrProposeNormalizationStep,
  NORMALIZATION_STEP_MEMORY_LIMIT,
  normalizationStepMemorySizeForTests,
  resetNormalizationStepCacheForTests,
} from "./normalizationStepCache.ts";

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

  it("never persists a time-bound refusal, and does not re-run the generator for the same source", async () => {
    const ir = parseKmn(KMN).ir;
    propose.mockResolvedValueOnce({ kind: "refused", reason: "time-bound" });
    const refused = await getOrProposeNormalizationStep(ir, null);
    expect(refused.result).toEqual({ kind: "refused", reason: "time-bound" });
    expect(refused.stored).toBeNull();
    const retry = await getOrProposeNormalizationStep(ir, null);
    expect(retry.stored).toBeNull();
    expect(retry.result).toEqual({ kind: "refused", reason: "time-bound" });
    expect(propose).toHaveBeenCalledTimes(1);
    // An edit changes the key, which lifts the refusal.
    const edited = parseKmn(KMN.replace("U+00E1", "U+00E0")).ir;
    const after = await getOrProposeNormalizationStep(edited, null);
    expect(after.source).toBe("generated");
    expect(propose).toHaveBeenCalledTimes(2);
  });

  it("shares one generator run between concurrent calls on the same key", async () => {
    const ir = parseKmn(KMN).ir;
    const [a, b, c] = await Promise.all([
      getOrProposeNormalizationStep(ir, null),
      getOrProposeNormalizationStep(ir, null),
      getOrProposeNormalizationStep(ir, null),
    ]);
    expect(propose).toHaveBeenCalledTimes(1);
    expect(b.result).toBe(a.result);
    expect(c.result).toBe(a.result);
    // Settled runs leave nothing in flight: a later call is a memory hit.
    expect((await getOrProposeNormalizationStep(ir, null)).source).toBe("memory");
  });

  it("evicts the least recently used entry beyond the memory limit", async () => {
    const irs = Array.from({ length: NORMALIZATION_STEP_MEMORY_LIMIT + 2 }, (_, i) =>
      parseKmn(KMN.replace("U+00E1", `U+00${(0xe0 + i).toString(16).toUpperCase()}`)).ir,
    );
    for (const ir of irs) await getOrProposeNormalizationStep(ir, null);
    expect(normalizationStepMemorySizeForTests()).toBe(NORMALIZATION_STEP_MEMORY_LIMIT);
    propose.mockClear();
    const first = irs[0];
    const last = irs[irs.length - 1];
    if (first === undefined || last === undefined) throw new Error("fixture");
    expect((await getOrProposeNormalizationStep(last, null)).source).toBe("memory");
    expect((await getOrProposeNormalizationStep(first, null)).source).toBe("generated");
  });
});
