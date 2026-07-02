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
  it("Rule 1: massive + logographic → S-12", () => {
    const result = selectStrategy(
      axes({ scale: "massive", scriptClass: "logographic" }),
    );
    expect(result.primary).toBe("S-12");
    expect(result.triggeredRule).toBe(1);
  });

  it("Rule 2a (abjad): scriptClass=abjad → S-09", () => {
    const result = selectStrategy(axes({ scriptClass: "abjad" }));
    expect(result.primary).toBe("S-09");
    expect(result.triggeredRule).toBe(2);
    expect(result.secondaries).toEqual([]);
  });

  it("Rule 2b (abugida+clusters+strong): abugida + clusterSensitivity + strong → S-09 with S-05", () => {
    const result = selectStrategy(
      axes({
        scriptClass: "abugida",
        clusterSensitivity: true,
        phoneticIntuition: "strong",
      }),
    );
    expect(result.primary).toBe("S-09");
    expect(result.triggeredRule).toBe(2);
    expect(result.secondaries).toContain("S-05");
  });

  it("Rule 3: diacriticBehavior=replacing-cycling → S-07 with S-04", () => {
    const result = selectStrategy(
      axes({ diacriticBehavior: "replacing-cycling" }),
    );
    expect(result.primary).toBe("S-07");
    expect(result.triggeredRule).toBe(3);
    expect(result.secondaries).toEqual(["S-04"]);
  });

  it("Rule 3a: alphabetic + strong + postfix → S-03 with S-04", () => {
    const result = selectStrategy(
      axes({
        scriptClass: "alphabetic",
        phoneticIntuition: "strong",
        markInputOrder: "postfix",
      }),
    );
    expect(result.primary).toBe("S-03");
    expect(result.triggeredRule).toBe("3a");
    expect(result.secondaries).toEqual(["S-04"]);
  });

  it("Rule 3a dormant for prefix: alphabetic + strong + medium + prefix → falls through to rule 5 (S-05)", () => {
    const result = selectStrategy(
      axes({
        scriptClass: "alphabetic",
        phoneticIntuition: "strong",
        scale: "medium",
        markInputOrder: "prefix",
      }),
    );
    expect(result.primary).toBe("S-05");
    expect(result.triggeredRule).toBe(5);
    expect(result.secondaries).toEqual(["S-04"]);
  });

  it("Rule 4: multiMode=two-orthography → S-11 (primary)", () => {
    const result = selectStrategy(axes({ multiMode: "two-orthography" }));
    expect(result.primary).toBe("S-11");
    expect(result.triggeredRule).toBe(4);
    expect(result.secondaries).toEqual([]);
  });

  it("Rule 5: phoneticIntuition=strong + scale=medium → S-05 with S-04", () => {
    const result = selectStrategy(
      axes({ phoneticIntuition: "strong", scale: "medium" }),
    );
    expect(result.primary).toBe("S-05");
    expect(result.triggeredRule).toBe(5);
    expect(result.secondaries).toEqual(["S-04"]);
  });

  it("Rule 6: diacriticBehavior=multi-family + scale=large → S-06 with S-04", () => {
    const result = selectStrategy(
      axes({ diacriticBehavior: "multi-family", scale: "large" }),
    );
    expect(result.primary).toBe("S-06");
    expect(result.triggeredRule).toBe(6);
    expect(result.secondaries).toEqual(["S-04"]);
  });

  it("Rule 7: diacriticBehavior=stacking-combining + scale=small → S-02 with S-04", () => {
    const result = selectStrategy(
      axes({ diacriticBehavior: "stacking-combining", scale: "small" }),
    );
    expect(result.primary).toBe("S-02");
    expect(result.triggeredRule).toBe(7);
    expect(result.secondaries).toEqual(["S-04"]);
  });

  it("Rule 8: scriptClass=alphabetic + remapPosture=full-remap → S-06 with S-04, S-08", () => {
    const result = selectStrategy(
      axes({ scriptClass: "alphabetic", remapPosture: "full-remap" }),
    );
    expect(result.primary).toBe("S-06");
    expect(result.triggeredRule).toBe(8);
    expect(result.secondaries).toEqual(["S-04", "S-08"]);
  });

  it("Rule 9 (secondary): constraintEnforcement=loud → secondaries includes S-10", () => {
    const result = selectStrategy(axes({ constraintEnforcement: "loud" }));
    expect(result.secondaries).toContain("S-10");
  });

  it("Rule 10 (secondary): spareKeyAvailability=fully booked → secondaries includes S-08", () => {
    const result = selectStrategy(
      axes({ spareKeyAvailability: "fully booked" }),
    );
    expect(result.secondaries).toContain("S-08");
  });

  it("Rule 11: scale=tiny + phoneticIntuition=strong → S-01", () => {
    const result = selectStrategy(
      axes({ scale: "tiny", phoneticIntuition: "strong" }),
    );
    expect(result.primary).toBe("S-01");
    expect(result.triggeredRule).toBe(11);
  });

  it("Rule 12 (fallback): all defaults → S-03", () => {
    const result = selectStrategy(axes({}));
    expect(result.primary).toBe("S-03");
    expect(result.triggeredRule).toBe(12);
  });
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
  it("akan", () => {
    const result = selectStrategy(
      axes({
        scale: "tiny",
        scriptClass: "alphabetic",
        phoneticIntuition: "strong",
        diacriticBehavior: "none",
        multiMode: "single",
        constraintEnforcement: "none",
        spareKeyAvailability: "many",
        remapPosture: "addition",
      }),
    );
    expect(result.primary).toBe("S-01");
    expect(result.triggeredRule).toBe(11);
    expect(result.secondaries).toEqual([]);
  });

  it("sil_euro_latin", () => {
    const result = selectStrategy(
      axes({
        scale: "large",
        scriptClass: "alphabetic",
        phoneticIntuition: "strong",
        diacriticBehavior: "multi-family",
        multiMode: "single",
        constraintEnforcement: "none",
        spareKeyAvailability: "RAlt only",
        remapPosture: "addition",
      }),
    );
    expect(result.primary).toBe("S-05");
    expect(result.triggeredRule).toBe(5);
    expect(result.secondaries).toContain("S-04");
  });

  it("sil_ipa", () => {
    const result = selectStrategy(
      axes({
        scale: "medium",
        scriptClass: "alphabetic",
        phoneticIntuition: "strong",
        diacriticBehavior: "none",
        multiMode: "single",
        constraintEnforcement: "none",
        spareKeyAvailability: "many",
        remapPosture: "addition",
        markInputOrder: "postfix",
      }),
    );
    expect(result.primary).toBe("S-03");
    expect(result.triggeredRule).toBe("3a");
    expect(result.secondaries).toContain("S-04");
  });

  it("sil_devanagari_phonetic", () => {
    const result = selectStrategy(
      axes({
        scale: "medium",
        scriptClass: "abugida",
        clusterSensitivity: true,
        phoneticIntuition: "strong",
        diacriticBehavior: "none",
        multiMode: "single",
        constraintEnforcement: "none",
        spareKeyAvailability: "many",
      }),
    );
    expect(result.primary).toBe("S-09");
    expect(result.triggeredRule).toBe(2);
    expect(result.secondaries).toContain("S-05");
  });

  it("vietnamese_telex", () => {
    const result = selectStrategy(
      axes({
        scale: "medium",
        scriptClass: "alphabetic",
        phoneticIntuition: "strong",
        diacriticBehavior: "replacing-cycling",
        multiMode: "single",
        constraintEnforcement: "none",
        spareKeyAvailability: "many",
        remapPosture: "addition",
      }),
    );
    expect(result.primary).toBe("S-07");
    expect(result.triggeredRule).toBe(3);
    expect(result.secondaries).toContain("S-04");
  });

  it("sil_yoruba8", () => {
    const result = selectStrategy(
      axes({
        scale: "medium",
        scriptClass: "alphabetic",
        phoneticIntuition: "strong",
        diacriticBehavior: "multi-family",
        multiMode: "two-orthography",
        constraintEnforcement: "none",
        spareKeyAvailability: "many",
        remapPosture: "addition",
      }),
    );
    expect(result.primary).toBe("S-11");
    expect(result.triggeredRule).toBe(4);
    expect(result.secondaries).toEqual([]);
  });

  it("armenian_mnemonic_r", () => {
    const result = selectStrategy(
      axes({
        scale: "medium",
        scriptClass: "alphabetic",
        phoneticIntuition: "weak",
        diacriticBehavior: "none",
        multiMode: "single",
        constraintEnforcement: "none",
        spareKeyAvailability: "RAlt only",
        remapPosture: "full-remap",
      }),
    );
    expect(result.primary).toBe("S-06");
    expect(result.triggeredRule).toBe(8);
    expect(result.secondaries).toContain("S-04");
    expect(result.secondaries).toContain("S-08");
  });

  it("el_pasifika", () => {
    const result = selectStrategy(
      axes({
        scale: "small",
        scriptClass: "alphabetic",
        phoneticIntuition: "strong",
        diacriticBehavior: "stacking-combining",
        multiMode: "single",
        constraintEnforcement: "loud",
        spareKeyAvailability: "many",
        remapPosture: "addition",
      }),
    );
    expect(result.primary).toBe("S-02");
    expect(result.triggeredRule).toBe(7);
    expect(result.secondaries).toContain("S-04");
    expect(result.secondaries).toContain("S-10");
  });

  it("cs_pinyin", () => {
    const result = selectStrategy(
      axes({
        scale: "massive",
        scriptClass: "logographic",
        phoneticIntuition: "weak",
        diacriticBehavior: "none",
        multiMode: "single",
        constraintEnforcement: "none",
        spareKeyAvailability: "many",
      }),
    );
    expect(result.primary).toBe("S-12");
    expect(result.triggeredRule).toBe(1);
    expect(result.secondaries).toEqual([]);
  });

  it("itrans_devanagari_hindi", () => {
    const result = selectStrategy(
      axes({
        scale: "large",
        scriptClass: "abugida",
        clusterSensitivity: true,
        phoneticIntuition: "strong",
        diacriticBehavior: "none",
        multiMode: "two-orthography",
        constraintEnforcement: "none",
        spareKeyAvailability: "many",
      }),
    );
    expect(result.primary).toBe("S-09");
    expect(result.triggeredRule).toBe(2);
    expect(result.secondaries).toContain("S-05");
    expect(result.secondaries).toContain("S-11");
  });

  it("sil_pan_africa_mnemonic", () => {
    const result = selectStrategy(
      axes({
        scale: "large",
        scriptClass: "alphabetic",
        phoneticIntuition: "weak",
        diacriticBehavior: "multi-family",
        multiMode: "single",
        constraintEnforcement: "none",
        spareKeyAvailability: "many",
        remapPosture: "addition",
      }),
    );
    expect(result.primary).toBe("S-06");
    expect(result.triggeredRule).toBe(6);
    expect(result.secondaries).toContain("S-04");
  });

  it("arabic_izza", () => {
    const result = selectStrategy(
      axes({
        scale: "medium",
        scriptClass: "abjad",
        phoneticIntuition: "weak",
        diacriticBehavior: "none",
        multiMode: "single",
        constraintEnforcement: "none",
        spareKeyAvailability: "many",
      }),
    );
    expect(result.primary).toBe("S-09");
    expect(result.triggeredRule).toBe(2);
    expect(result.secondaries).toEqual([]);
  });

  it("russian_mnemonic_r", () => {
    const result = selectStrategy(
      axes({
        scale: "medium",
        scriptClass: "alphabetic",
        phoneticIntuition: "weak",
        diacriticBehavior: "none",
        multiMode: "single",
        constraintEnforcement: "none",
        spareKeyAvailability: "RAlt only",
        remapPosture: "full-remap",
      }),
    );
    expect(result.primary).toBe("S-06");
    expect(result.triggeredRule).toBe(8);
    expect(result.secondaries).toContain("S-04");
    expect(result.secondaries).toContain("S-08");
  });
});
