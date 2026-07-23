import { describe, it, expect } from "vitest";
import { selectStrategy } from "./index.js";
import type { DiscoveryAxisVector } from "@keyboard-studio/contracts";

/**
 * Build a DiscoveryAxisVector from partial overrides, filling in safe defaults.
 * `clusterSensitivity`, `remapPosture`, and `markInputOrder` are optional —
 * they are only included when the caller provides them explicitly (satisfies
 * exactOptionalPropertyTypes).
 */
function axes(overrides: Partial<DiscoveryAxisVector>): DiscoveryAxisVector {
  const defaults: Omit<
    DiscoveryAxisVector,
    "clusterSensitivity" | "remapPosture"
  > = {
    scale: "small",
    scriptClass: "alphabetic",
    phoneticIntuition: "weak",
    diacriticBehavior: "none",
    multiMode: "single",
    constraintEnforcement: "none",
    spareKeyAvailability: "many",
  };

  const base: DiscoveryAxisVector = { ...defaults, remapPosture: "addition" };

  // Build result, applying overrides. For optional fields, only include them
  // when they appear in the overrides object (satisfies exactOptionalPropertyTypes).
  const result: DiscoveryAxisVector = {
    scale: overrides.scale ?? base.scale,
    scriptClass: overrides.scriptClass ?? base.scriptClass,
    phoneticIntuition: overrides.phoneticIntuition ?? base.phoneticIntuition,
    diacriticBehavior: overrides.diacriticBehavior ?? base.diacriticBehavior,
    multiMode: overrides.multiMode ?? base.multiMode,
    constraintEnforcement:
      overrides.constraintEnforcement ?? base.constraintEnforcement,
    spareKeyAvailability:
      overrides.spareKeyAvailability ?? base.spareKeyAvailability,
    ...("remapPosture" in overrides
      ? overrides.remapPosture !== undefined
        ? { remapPosture: overrides.remapPosture }
        : {}
      : { remapPosture: "addition" }),
    ...("clusterSensitivity" in overrides &&
    overrides.clusterSensitivity !== undefined
      ? { clusterSensitivity: overrides.clusterSensitivity }
      : {}),
    ...("markInputOrder" in overrides && overrides.markInputOrder !== undefined
      ? { markInputOrder: overrides.markInputOrder }
      : {}),
  };

  return result;
}

// ---------------------------------------------------------------------------
// Primary rule tests
// ---------------------------------------------------------------------------

describe("selectStrategy — primary rules", () => {
  it.each([
    { rule: 1, desc: "massive + logographic", axes: { scale: "massive", scriptClass: "logographic" }, expectPrimary: "S-12", expectRule: 1, expectSecondaries: [] },
    { rule: 2, desc: "abjad", axes: { scriptClass: "abjad" }, expectPrimary: "S-09", expectRule: 2, expectSecondaries: [] },
    { rule: "2b", desc: "abugida+clusters+strong", axes: { scriptClass: "abugida", clusterSensitivity: true, phoneticIntuition: "strong" }, expectPrimary: "S-09", expectRule: 2, expectSecondaries: ["S-05"] },
    { rule: 3, desc: "diacriticBehavior=replacing-cycling", axes: { diacriticBehavior: "replacing-cycling" }, expectPrimary: "S-07", expectRule: 3, expectSecondaries: ["S-04"] },
    { rule: "3a", desc: "alphabetic+strong+postfix", axes: { scriptClass: "alphabetic", phoneticIntuition: "strong", markInputOrder: "postfix" }, expectPrimary: "S-03", expectRule: "3a", expectSecondaries: ["S-04"] },
    { rule: "3a-dormant", desc: "alphabetic+strong+medium+prefix (rule 3a dormant)", axes: { scriptClass: "alphabetic", phoneticIntuition: "strong", scale: "medium", markInputOrder: "prefix" }, expectPrimary: "S-05", expectRule: 5, expectSecondaries: ["S-04"] },
    { rule: 4, desc: "multiMode=two-orthography", axes: { multiMode: "two-orthography" }, expectPrimary: "S-11", expectRule: 4, expectSecondaries: [] },
    { rule: 5, desc: "phoneticIntuition=strong+scale=medium", axes: { phoneticIntuition: "strong", scale: "medium" }, expectPrimary: "S-05", expectRule: 5, expectSecondaries: ["S-04"] },
    { rule: 6, desc: "diacriticBehavior=multi-family+scale=large", axes: { diacriticBehavior: "multi-family", scale: "large" }, expectPrimary: "S-06", expectRule: 6, expectSecondaries: ["S-04"] },
    { rule: 7, desc: "diacriticBehavior=stacking-combining+scale=small", axes: { diacriticBehavior: "stacking-combining", scale: "small" }, expectPrimary: "S-02", expectRule: 7, expectSecondaries: ["S-04"] },
    { rule: 8, desc: "alphabetic+remapPosture=full-remap", axes: { scriptClass: "alphabetic", remapPosture: "full-remap" }, expectPrimary: "S-06", expectRule: 8, expectSecondaries: ["S-04", "S-08"] },
    { rule: 9, desc: "constraintEnforcement=loud (secondary)", axes: { constraintEnforcement: "loud" }, expectPrimary: undefined, expectRule: undefined, expectSecondaries: ["S-10"] },
    { rule: 10, desc: "spareKeyAvailability=fully booked (secondary)", axes: { spareKeyAvailability: "fully booked" }, expectPrimary: undefined, expectRule: undefined, expectSecondaries: ["S-08"] },
    { rule: 11, desc: "scale=tiny+phoneticIntuition=strong", axes: { scale: "tiny", phoneticIntuition: "strong" }, expectPrimary: "S-01", expectRule: 11, expectSecondaries: [] },
    { rule: 12, desc: "all defaults (fallback)", axes: {}, expectPrimary: "S-03", expectRule: 12, expectSecondaries: [] },
  ])(
    "Rule $rule: $desc",
    ({ expectPrimary, expectRule, expectSecondaries, axes: axesOverrides }) => {
      const result = selectStrategy(axes(axesOverrides));
      if (expectPrimary !== undefined) expect(result.primary).toBe(expectPrimary);
      if (expectRule !== undefined) expect(result.triggeredRule).toBe(expectRule);
      expectSecondaries.forEach((s) => expect(result.secondaries).toContain(s));
      if (expectSecondaries.length > 0) {
        expect(result.secondaries).toHaveLength(expectSecondaries.length);
      } else if (expectPrimary !== undefined) {
        expect(result.secondaries).toEqual([]);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// S-11 wrapper test
// ---------------------------------------------------------------------------

describe("selectStrategy — S-11 wrapper", () => {
  it("S-11 wrapper: abugida+clusters+strong+two-orthography → primary S-09, secondaries include S-05 and S-11", () => {
    const result = selectStrategy(
      axes({
        scriptClass: "abugida",
        clusterSensitivity: true,
        phoneticIntuition: "strong",
        multiMode: "two-orthography",
      }),
    );
    expect(result.primary).toBe("S-09");
    expect(result.triggeredRule).toBe(2);
    expect(result.secondaries).toContain("S-05");
    expect(result.secondaries).toContain("S-11");
  });
});

// ---------------------------------------------------------------------------
// §7.5 seed fixtures
// ---------------------------------------------------------------------------

describe("§7.5 seed fixtures", () => {
  it.each([
    { name: "akan", axes: { scale: "tiny", scriptClass: "alphabetic", phoneticIntuition: "strong", diacriticBehavior: "none", multiMode: "single", constraintEnforcement: "none", spareKeyAvailability: "many", remapPosture: "addition" }, expectPrimary: "S-01", expectRule: 11, expectSecondaries: [] },
    { name: "sil_euro_latin", axes: { scale: "large", scriptClass: "alphabetic", phoneticIntuition: "strong", diacriticBehavior: "multi-family", multiMode: "single", constraintEnforcement: "none", spareKeyAvailability: "RAlt only", remapPosture: "addition" }, expectPrimary: "S-05", expectRule: 5, expectSecondaries: ["S-04"] },
    { name: "sil_ipa", axes: { scale: "medium", scriptClass: "alphabetic", phoneticIntuition: "strong", diacriticBehavior: "none", multiMode: "single", constraintEnforcement: "none", spareKeyAvailability: "many", remapPosture: "addition", markInputOrder: "postfix" }, expectPrimary: "S-03", expectRule: "3a", expectSecondaries: ["S-04"] },
    { name: "sil_devanagari_phonetic", axes: { scale: "medium", scriptClass: "abugida", clusterSensitivity: true, phoneticIntuition: "strong", diacriticBehavior: "none", multiMode: "single", constraintEnforcement: "none", spareKeyAvailability: "many" }, expectPrimary: "S-09", expectRule: 2, expectSecondaries: ["S-05"] },
    { name: "vietnamese_telex", axes: { scale: "medium", scriptClass: "alphabetic", phoneticIntuition: "strong", diacriticBehavior: "replacing-cycling", multiMode: "single", constraintEnforcement: "none", spareKeyAvailability: "many", remapPosture: "addition" }, expectPrimary: "S-07", expectRule: 3, expectSecondaries: ["S-04"] },
    { name: "sil_yoruba8", axes: { scale: "medium", scriptClass: "alphabetic", phoneticIntuition: "strong", diacriticBehavior: "multi-family", multiMode: "two-orthography", constraintEnforcement: "none", spareKeyAvailability: "many", remapPosture: "addition" }, expectPrimary: "S-11", expectRule: 4, expectSecondaries: [] },
    { name: "armenian_mnemonic_r", axes: { scale: "medium", scriptClass: "alphabetic", phoneticIntuition: "weak", diacriticBehavior: "none", multiMode: "single", constraintEnforcement: "none", spareKeyAvailability: "RAlt only", remapPosture: "full-remap" }, expectPrimary: "S-06", expectRule: 8, expectSecondaries: ["S-04", "S-08"] },
    { name: "el_pasifika", axes: { scale: "small", scriptClass: "alphabetic", phoneticIntuition: "strong", diacriticBehavior: "stacking-combining", multiMode: "single", constraintEnforcement: "loud", spareKeyAvailability: "many", remapPosture: "addition" }, expectPrimary: "S-02", expectRule: 7, expectSecondaries: ["S-04", "S-10"] },
    { name: "cs_pinyin", axes: { scale: "massive", scriptClass: "logographic", phoneticIntuition: "weak", diacriticBehavior: "none", multiMode: "single", constraintEnforcement: "none", spareKeyAvailability: "many" }, expectPrimary: "S-12", expectRule: 1, expectSecondaries: [] },
    { name: "itrans_devanagari_hindi", axes: { scale: "large", scriptClass: "abugida", clusterSensitivity: true, phoneticIntuition: "strong", diacriticBehavior: "none", multiMode: "two-orthography", constraintEnforcement: "none", spareKeyAvailability: "many" }, expectPrimary: "S-09", expectRule: 2, expectSecondaries: ["S-05", "S-11"] },
    { name: "sil_pan_africa_mnemonic", axes: { scale: "large", scriptClass: "alphabetic", phoneticIntuition: "weak", diacriticBehavior: "multi-family", multiMode: "single", constraintEnforcement: "none", spareKeyAvailability: "many", remapPosture: "addition" }, expectPrimary: "S-06", expectRule: 6, expectSecondaries: ["S-04"] },
    { name: "arabic_izza", axes: { scale: "medium", scriptClass: "abjad", phoneticIntuition: "weak", diacriticBehavior: "none", multiMode: "single", constraintEnforcement: "none", spareKeyAvailability: "many" }, expectPrimary: "S-09", expectRule: 2, expectSecondaries: [] },
    { name: "russian_mnemonic_r", axes: { scale: "medium", scriptClass: "alphabetic", phoneticIntuition: "weak", diacriticBehavior: "none", multiMode: "single", constraintEnforcement: "none", spareKeyAvailability: "RAlt only", remapPosture: "full-remap" }, expectPrimary: "S-06", expectRule: 8, expectSecondaries: ["S-04", "S-08"] },
  ])(
    "$name",
    ({ expectPrimary, expectRule, expectSecondaries, axes: axesOverrides }) => {
      const result = selectStrategy(axes(axesOverrides));
      expect(result.primary).toBe(expectPrimary);
      expect(result.triggeredRule).toBe(expectRule);
      expectSecondaries.forEach((s) => expect(result.secondaries).toContain(s));
      if (expectSecondaries.length > 0) {
        expect(result.secondaries).toHaveLength(expectSecondaries.length);
      } else {
        expect(result.secondaries).toEqual([]);
      }
    }
  );
});
