// Digest of a generated normalization step's functional content (issue #2395):
// stable across identical generations, sensitive to the content the
// acceptance depends on, blind to cosmetic fields.

import { describe, expect, it } from "vitest";
import type { NormalizationStep } from "@keyboard-studio/contracts";

import { parseFixture, ALTERNATES_KMN } from "../__fixtures__/normalization.js";
import { normalizationStepFingerprint } from "./fingerprint.js";
import { proposeNormalizationStep } from "./index.js";

async function makeStep(): Promise<NormalizationStep> {
  const result = await proposeNormalizationStep(parseFixture(ALTERNATES_KMN));
  if (result.kind !== "step") throw new Error(`expected a step, got ${result.kind}`);
  return result.step;
}

describe("normalizationStepFingerprint", () => {
  it("is stable across two independent generations", async () => {
    expect(normalizationStepFingerprint(await makeStep())).toBe(normalizationStepFingerprint(await makeStep()));
  });

  it("changes when a generated rule changes", async () => {
    const step = await makeStep();
    const before = normalizationStepFingerprint(step);
    const edited: NormalizationStep = {
      ...step,
      rules: step.rules.map((r, i) => (i === 0 ? { ...r, output: [...r.output, r.output[0]!] } : r)),
    };
    expect(normalizationStepFingerprint(edited)).not.toBe(before);
  });

  it("changes when a generated store changes", async () => {
    const step = await makeStep();
    const before = normalizationStepFingerprint(step);
    const edited: NormalizationStep = {
      ...step,
      stores: step.stores.map((s, i) => (i === 0 ? { ...s, name: `${s.name}_x` } : s)),
    };
    expect(normalizationStepFingerprint(edited)).not.toBe(before);
  });

  it("changes when the original entry changes", async () => {
    const step = await makeStep();
    const before = normalizationStepFingerprint(step);
    expect(normalizationStepFingerprint({ ...step, originalEntry: "other" })).not.toBe(before);
  });

  it("ignores the cosmetic examples", async () => {
    const step = await makeStep();
    const before = normalizationStepFingerprint(step);
    expect(normalizationStepFingerprint({ ...step, examples: [] })).toBe(before);
    expect(
      normalizationStepFingerprint({ ...step, examples: [{ pasted: "x", result: "y" }] }),
    ).toBe(before);
  });
});
