// Ground-truth checks against the two keyboards a human already fixed for
// this exact bug. Hermetic: the four `.kmn` fixtures are vendored, so no
// corpus checkout is needed and CI can run this.
//
// Slow by test standards — three WASM compiles per fixture — but bounded and
// deterministic. The full-corpus sweep is the CLI, never a test.

import { describe, expect, it } from "vitest";

import { evaluateGroundTruth, GROUND_TRUTH } from "./ground-truth.js";

const fixture = (id: string) => GROUND_TRUTH.find((f) => f.id === id)!;

describe("haroi (hand-fixed in ed1c31f51, 2020)", () => {
  it("reproduces every input pair the hand fix repaired", async () => {
    const result = await evaluateGroundTruth(fixture("haroi"));

    // Guard the guard: if the probe enumeration ever stops reaching the
    // rules the human touched, "no mismatches" would be vacuously true.
    expect(result.humanFixedPairs).toBeGreaterThan(0);
    expect(result.mismatches).toEqual([]);
    expect(result.reproducedPairs).toBe(result.humanFixedPairs);
  });
});

describe("sil_kcho (hand-fixed in b58b9e62a, 2025)", () => {
  // CHARACTERIZATION TEST — it pins a SHORTFALL, not a passing behaviour.
  //
  // The human repaired 16 input pairs. The transform reproduces 8 of them —
  // the diaeresis-a family — and produces nothing at all for the other 8, the
  // diaeresis-u family. The cause is a refusal, not a bad fix: `vowelUK`
  // ('u-diaeresis', 'U-diaeresis') is read by index() against three separate
  // output stores (graveUO, acuteUO, macronUO), so the engine's
  // multi-store-pairing gate declines every rule that uses it as context.
  //
  // These numbers are asserted exactly so that improving the gate turns this
  // test RED and forces someone to re-verify and update it. Do not relax the
  // assertion to make a future run pass — re-measure and rewrite it.
  it("reproduces only 8 of the 16 pairs the hand fix repaired (multi-store-pairing gate)", async () => {
    const result = await evaluateGroundTruth(fixture("sil_kcho"));

    expect(result.humanFixedPairs).toBe(16);
    expect(result.reproducedPairs).toBe(8);
    expect(result.mismatches).toHaveLength(8);
    expect(result.refusals["multi-store-pairing"]).toBeGreaterThan(0);
  });

  it("declines the pairs it misses rather than mis-fixing them", async () => {
    // The distinction that matters for shipping: on sil_kcho the transform
    // leaves the broken decomposed path exactly as it found it. It does not
    // emit a different, well-formed, wrong character the way it does on
    // sil_yoruba8 — so this shortfall is under-reach, not corruption.
    const result = await evaluateGroundTruth(fixture("sil_kcho"));

    for (const mismatch of result.mismatches) {
      expect(mismatch.transformedDecomposed).toBe(mismatch.baselineDecomposed);
      expect(mismatch.transformedDecomposed).not.toBe(mismatch.handFixedDecomposed);
    }
  });
});
