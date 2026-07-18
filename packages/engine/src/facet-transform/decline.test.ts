// Polish — honest declines + refusals (T032 / FR-004 / quickstart Scenario 4).
// Each returns a TransformRefusal with a verbatim reason; none reaches `proposed`.

import { describe, it, expect } from "vitest";
import { proposeFacetTransform } from "./propose.js";
import { makeMeasurement } from "./__fixtures__/measurements.js";
import { parseKeyboard, MIXED_ENCODING_KMN } from "./__fixtures__/keyboards.js";
import type { TransformRefusal } from "./types.js";

const ir = parseKeyboard(MIXED_ENCODING_KMN, "Decline");

describe("honest declines + refusals (T032 / FR-004)", () => {
  it("refuses gate facets source.mnemonic-vs-positional and source.casing", () => {
    for (const facetId of ["source.mnemonic-vs-positional", "source.casing"]) {
      const m = makeMeasurement({ facetId, dominantValue: "x" });
      const r = proposeFacetTransform(ir, m, { facetId, toValue: "y" });
      expect(r.kind).toBe("refusal");
      expect((r as TransformRefusal).refusalKind).toBe("gate");
      expect((r as TransformRefusal).reason).toBeTruthy();
    }
  });

  it("permanently declines match-kind key-ref → char-ref with a verbatim reason", () => {
    const m = makeMeasurement({
      facetId: "source.encoding.input-match-kind",
      dominantValue: "key-ref",
    });
    const r = proposeFacetTransform(ir, m, {
      facetId: "source.encoding.input-match-kind",
      toValue: "char-ref",
    });
    expect(r.kind).toBe("refusal");
    expect((r as TransformRefusal).refusalKind).toBe("permanent");
    expect((r as TransformRefusal).reason).toMatch(/match-kind/i);
  });

  it("permanently declines any pair touching os-compose", () => {
    const m = makeMeasurement({
      facetId: "source.desktop-combo-mechanism",
      dominantValue: "deadkey",
    });
    const r = proposeFacetTransform(ir, m, {
      facetId: "source.desktop-combo-mechanism",
      toValue: "os-compose",
    });
    expect(r.kind).toBe("refusal");
    expect((r as TransformRefusal).refusalKind).toBe("permanent");
    expect((r as TransformRefusal).reason).toMatch(/os-compose/i);
  });

  it("defers nfc → nfd with a reason", () => {
    const m = makeMeasurement({
      facetId: "source.normalization-posture",
      dominantValue: "nfc",
    });
    const r = proposeFacetTransform(ir, m, {
      facetId: "source.normalization-posture",
      toValue: "nfd",
    });
    expect(r.kind).toBe("refusal");
    expect((r as TransformRefusal).refusalKind).toBe("deferred");
    expect((r as TransformRefusal).reason).toMatch(/decompos/i);
  });

  it("declines an undetermined measurement — never guesses", () => {
    const m = makeMeasurement({
      facetId: "source.normalization-posture",
      dominantValue: "nfd",
      confidenceClass: "undetermined",
    });
    const r = proposeFacetTransform(ir, m, {
      facetId: "source.normalization-posture",
      toValue: "nfc",
    });
    expect(r.kind).toBe("refusal");
    expect((r as TransformRefusal).refusalKind).toBe("undetermined");
  });
});
