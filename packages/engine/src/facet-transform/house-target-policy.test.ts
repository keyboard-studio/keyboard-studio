// US1 — house-target provenance (T012). The chip renders ONLY when a non-default
// target fires (US1 AC1).

import { describe, it, expect } from "vitest";
import { resolveHouseTarget } from "./house-target-policy.js";
import { proposeFacetTransform } from "./propose.js";
import { makeMeasurement } from "./__fixtures__/measurements.js";
import { parseKeyboard, MIXED_ENCODING_KMN } from "./__fixtures__/keyboards.js";
import type { TransformProposal } from "./types.js";

describe("house-target decision-table (T012)", () => {
  it("resolves the default target (quoted-literal) with isDefault=true", () => {
    const res = resolveHouseTarget("source.encoding.output-spelling", {});
    expect(res.target).toBe("quoted-literal");
    expect(res.isDefault).toBe(true);
  });

  it("resolves the non-default target (u-notation) for a hard-to-display script", () => {
    const res = resolveHouseTarget("source.encoding.output-spelling", {
      displayDifficulty: "hard",
    });
    expect(res.target).toBe("u-notation");
    expect(res.isDefault).toBe(false);
    expect(res.explanation).toMatch(/renders poorly|U\+/);
  });
});

describe("provenance chip surfaces only for non-default targets (US1 AC1)", () => {
  const ir = parseKeyboard(MIXED_ENCODING_KMN, "MixedEncoding");
  const measurement = makeMeasurement({
    facetId: "source.encoding.output-spelling",
    confidenceClass: "mixed",
  });

  it("omits houseTargetProvenance when the default target fires", () => {
    const p = proposeFacetTransform(ir, measurement, {
      facetId: "source.encoding.output-spelling",
      preset: "house-style",
    }) as TransformProposal;
    expect(p.kind).toBe("proposal");
    expect(p.houseTargetProvenance).toBeUndefined();
  });

  it("includes houseTargetProvenance when a non-default target fires", () => {
    const p = proposeFacetTransform(
      ir,
      measurement,
      { facetId: "source.encoding.output-spelling", preset: "house-style" },
      { houseTargetInputs: { displayDifficulty: "hard" } },
    ) as TransformProposal;
    expect(p.kind).toBe("proposal");
    expect(p.houseTargetProvenance).toBeDefined();
    expect(p.houseTargetProvenance!.isDefault).toBe(false);
    expect(p.transitionId.toValue).toBe("u-notation");
  });
});
