// Tests for the §7.2 script-class default-fill prior (issue #890: rule 3a +
// default-fill prior). Two groups:
//
//   1. Rule 3a firing behavior (selectStrategy) — the direct acceptance
//      criterion: A2=alphabetic AND A3=strong AND A3a=postfix must select
//      S-03 (+S-04) via triggeredRule "3a", and must NOT fire on prefix or
//      unelicited markInputOrder.
//
//   2. The §7.5 round-trip lock — defaultFillAxes() composed with
//      selectStrategy() must reproduce every §7.5 exemplar row's documented
//      "Tree -> strategy" outcome when phase-gated-unelicited axes are
//      ABSENT (not blanked to a specific value) on the input, mirroring what
//      the survey produces today. This is the regression guarantee that the
//      prior's "off/unmarked-only" invariant (never emits `postfix`) holds
//      for every fixture, not just the direct rule-3a case.
//
// Placement: co-located as a sibling of index.test.ts (which pins
// selectStrategy() alone) rather than folded into it, because this file's
// second group exercises a distinct unit (defaultFillAxes) composed with
// selectStrategy — a different function boundary than index.test.ts covers.
// Group 1 (rule 3a via selectStrategy directly) is included here rather than
// in index.test.ts to keep all issue #890 coverage (rule 3a + the prior that
// must never leak postfix) in one file.

import { describe, it, expect } from "vitest";
import { selectStrategy } from "./index.js";
import { defaultFillAxes } from "./default-fill.js";
import type {
  AxisFill,
  DiscoveryAxisVector,
  PrimaryRuleNumber,
  StrategyId,
} from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Group 1 — rule 3a acceptance criterion
// ---------------------------------------------------------------------------

describe("selectStrategy — rule 3a (A3a=postfix intercept)", () => {
  const ipaShaped: DiscoveryAxisVector = {
    scale: "medium",
    scriptClass: "alphabetic",
    phoneticIntuition: "strong",
    markInputOrder: "postfix",
    diacriticBehavior: "none",
    multiMode: "single",
    constraintEnforcement: "none",
    spareKeyAvailability: "many",
    remapPosture: "addition",
  };

  it("fires on A2=alphabetic AND A3=strong AND A3a=postfix -> S-03 (+S-04), triggeredRule 3a", () => {
    const result = selectStrategy(ipaShaped);
    expect(result.primary).toBe("S-03");
    expect(result.secondaries).toContain("S-04");
    expect(result.triggeredRule).toBe("3a");
  });

  it("does NOT fire when A3a=prefix (same vector otherwise) — falls through to rule 5 (medium+strong) -> S-05", () => {
    const prefixVariant: DiscoveryAxisVector = { ...ipaShaped, markInputOrder: "prefix" };
    const result = selectStrategy(prefixVariant);
    expect(result.triggeredRule).not.toBe("3a");
    expect(result.triggeredRule).toBe(5);
    expect(result.primary).toBe("S-05");
    expect(result.secondaries).toContain("S-04");
  });

  it("does NOT fire when A3a is undefined (unelicited) — falls through to rule 5 -> S-05", () => {
    const { markInputOrder: _omit, ...rest } = ipaShaped;
    const unelicited = rest as DiscoveryAxisVector;
    const result = selectStrategy(unelicited);
    expect(result.triggeredRule).not.toBe("3a");
    expect(result.triggeredRule).toBe(5);
    expect(result.primary).toBe("S-05");
    expect(result.secondaries).toContain("S-04");
  });
});

// ---------------------------------------------------------------------------
// Group 2 — §7.5 round-trip lock: survey-shaped partial -> defaultFillAxes ->
// selectStrategy must equal the documented "Tree -> strategy" outcome.
// ---------------------------------------------------------------------------

interface RoundTripCase {
  name: string;
  /** Exactly what the survey elicits today: scale/scriptClass/phoneticIntuition/
   * spareKeyAvailability always present, plus whichever phase-gated axes this
   * exemplar's row explicitly marks as elicited. Every other phase-gated axis
   * is ABSENT (not present as a key) so defaultFillAxes must supply it. */
  partial: Partial<DiscoveryAxisVector>;
  expected: {
    triggeredRule: PrimaryRuleNumber;
    primary: StrategyId;
    secondaries: StrategyId[];
  };
}

// §7.5 main table (specs/007-strategy-selection/spec.md ~lines 434-448).
const ROUND_TRIP_CASES: RoundTripCase[] = [
  {
    name: "akan",
    partial: {
      scale: "tiny",
      scriptClass: "alphabetic",
      phoneticIntuition: "strong",
      spareKeyAvailability: "many",
    },
    expected: { triggeredRule: 11, primary: "S-01", secondaries: [] },
  },
  {
    // NOTE: the §7.5 table text (specs/007-strategy-selection/spec.md line 437)
    // reads "rule 6 -> S-06" in its "Tree -> strategy" column, but the *actual*
    // PRIMARY_RULES firing order matches rule 5 (A3=strong AND A1 in
    // {medium,large}) BEFORE rule 6 is ever reached for this vector — rule 5
    // precedes rule 6 in rules.ts, and this vector satisfies both predicates.
    // index.test.ts's own pre-existing "sil_euro_latin" fixture (this suite's
    // sibling file) already pins S-05/rule 5 as the real selectStrategy()
    // output, consistent with spec.md's own EuroLatin discussion (§7.5 line
    // 454, "Reclassified 2026-06-15 as out-of-scope (MML), not a tree gap" —
    // EuroLatin is documented as an acknowledged real-keyboard divergence, not
    // a fixture the tree is expected to reproduce exactly). This case locks
    // the CODE's actual behavior (rule 5) through default-fill, matching the
    // pre-existing pinned unit test, rather than the table's aspirational
    // "rule 6" text.
    name: "sil_euro_latin",
    partial: {
      scale: "large",
      scriptClass: "alphabetic",
      phoneticIntuition: "strong",
      diacriticBehavior: "multi-family",
      spareKeyAvailability: "RAlt only",
    },
    expected: { triggeredRule: 5, primary: "S-05", secondaries: ["S-04"] },
  },
  {
    name: "sil_ipa",
    partial: {
      scale: "medium",
      scriptClass: "alphabetic",
      phoneticIntuition: "strong",
      markInputOrder: "postfix",
      spareKeyAvailability: "many",
    },
    expected: { triggeredRule: "3a", primary: "S-03", secondaries: ["S-04"] },
  },
  {
    name: "sil_devanagari_phonetic",
    partial: {
      scale: "medium",
      scriptClass: "abugida",
      clusterSensitivity: true,
      phoneticIntuition: "strong",
      spareKeyAvailability: "many",
    },
    expected: { triggeredRule: 2, primary: "S-09", secondaries: ["S-05"] },
  },
  {
    name: "vietnamese_telex",
    partial: {
      scale: "medium",
      scriptClass: "alphabetic",
      phoneticIntuition: "strong",
      diacriticBehavior: "replacing-cycling",
      spareKeyAvailability: "many",
    },
    expected: { triggeredRule: 3, primary: "S-07", secondaries: ["S-04"] },
  },
  {
    name: "sil_yoruba8",
    partial: {
      scale: "medium",
      scriptClass: "alphabetic",
      phoneticIntuition: "strong",
      diacriticBehavior: "multi-family",
      multiMode: "two-orthography",
      spareKeyAvailability: "many",
    },
    expected: { triggeredRule: 4, primary: "S-11", secondaries: [] },
  },
  {
    name: "armenian_mnemonic_r",
    partial: {
      scale: "medium",
      scriptClass: "alphabetic",
      phoneticIntuition: "weak",
      remapPosture: "full-remap",
      spareKeyAvailability: "RAlt only",
    },
    expected: { triggeredRule: 8, primary: "S-06", secondaries: ["S-04", "S-08"] },
  },
  {
    name: "el_pasifika",
    partial: {
      scale: "small",
      scriptClass: "alphabetic",
      phoneticIntuition: "strong",
      diacriticBehavior: "stacking-combining",
      constraintEnforcement: "loud",
      spareKeyAvailability: "many",
    },
    expected: { triggeredRule: 7, primary: "S-02", secondaries: ["S-04", "S-10"] },
  },
  {
    name: "cs_pinyin",
    partial: {
      scale: "massive",
      scriptClass: "logographic",
      phoneticIntuition: "weak",
      spareKeyAvailability: "many",
    },
    expected: { triggeredRule: 1, primary: "S-12", secondaries: [] },
  },
  {
    name: "itrans_devanagari_hindi",
    partial: {
      scale: "large",
      scriptClass: "abugida",
      clusterSensitivity: true,
      phoneticIntuition: "strong",
      multiMode: "two-orthography",
      spareKeyAvailability: "many",
    },
    expected: { triggeredRule: 2, primary: "S-09", secondaries: ["S-05", "S-11"] },
  },
  {
    name: "sil_pan_africa_mnemonic",
    partial: {
      scale: "large",
      scriptClass: "alphabetic",
      phoneticIntuition: "weak",
      diacriticBehavior: "multi-family",
      spareKeyAvailability: "many",
    },
    expected: { triggeredRule: 6, primary: "S-06", secondaries: ["S-04"] },
  },
  {
    name: "arabic_izza",
    partial: {
      scale: "medium",
      scriptClass: "abjad",
      phoneticIntuition: "weak",
      spareKeyAvailability: "many",
    },
    expected: { triggeredRule: 2, primary: "S-09", secondaries: [] },
  },
  {
    name: "russian_mnemonic_r",
    partial: {
      scale: "medium",
      scriptClass: "alphabetic",
      phoneticIntuition: "weak",
      remapPosture: "full-remap",
      spareKeyAvailability: "RAlt only",
    },
    expected: { triggeredRule: 8, primary: "S-06", secondaries: ["S-04", "S-08"] },
  },
];

describe("§7.5 round-trip lock — defaultFillAxes() + selectStrategy()", () => {
  it.each(ROUND_TRIP_CASES)(
    "$name: survey-shaped partial default-fills and selects the documented strategy",
    ({ partial, expected }) => {
      const { axes, axisFills } = defaultFillAxes(partial);
      const result = selectStrategy(axes);

      expect(
        result,
        `expected ${expected.triggeredRule} -> ${expected.primary} (+${expected.secondaries.join(",")}) but got ${result.triggeredRule} -> ${result.primary} (+${result.secondaries.join(",")})`,
      ).toEqual({
        primary: expected.primary,
        secondaries: expected.secondaries,
        triggeredRule: expected.triggeredRule,
      });

      // LOAD-BEARING INVARIANT: the prior must never fill markInputOrder as
      // "postfix" — that is a marked/rule-triggering value and may only come
      // from an elicited survey answer, never a default. If any row's fill
      // list contains this, the prior itself is broken.
      const leakedPostfix = axisFills.find(
        (f: AxisFill) => f.axis === "markInputOrder" && f.value === "postfix",
      );
      expect(
        leakedPostfix,
        `defaultFillAxes must never fill markInputOrder="postfix" (found on row "${partial.scriptClass}/${partial.scale}")`,
      ).toBeUndefined();
    },
  );

  it("sil_ipa: the elicited postfix value is preserved on the filled axes and is NOT recorded as a prior fill", () => {
    const ipaRow = ROUND_TRIP_CASES.find((c) => c.name === "sil_ipa");
    if (ipaRow === undefined) {
      throw new Error("sil_ipa fixture missing from ROUND_TRIP_CASES");
    }

    const { axes, axisFills } = defaultFillAxes(ipaRow.partial);

    // Elicited value survives default-fill untouched.
    expect(axes.markInputOrder).toBe("postfix");

    // Because it was already present on the partial, defaultFillAxes must
    // skip it entirely — it must not appear in the provenance list at all
    // (elicited, not filled).
    const markInputOrderFill = axisFills.find((f: AxisFill) => f.axis === "markInputOrder");
    expect(markInputOrderFill).toBeUndefined();
  });

  it("every round-trip case's scale+scriptClass pair actually appears in the axis-priors table (fixture sanity)", () => {
    // Guards against a fixture typo silently passing because defaultFillAxes
    // would throw for a missing scale/scriptClass — this just documents that
    // every case supplies both, which defaultFillAxes requires.
    for (const { name, partial } of ROUND_TRIP_CASES) {
      expect(partial.scale, `${name}: missing scale`).toBeDefined();
      expect(partial.scriptClass, `${name}: missing scriptClass`).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// defaultFillAxes() unit behavior
// ---------------------------------------------------------------------------

describe("defaultFillAxes — unit behavior", () => {
  it("throws when scale is missing", () => {
    expect(() => defaultFillAxes({ scriptClass: "alphabetic" })).toThrow();
  });

  it("throws when scriptClass is missing", () => {
    expect(() => defaultFillAxes({ scale: "medium" })).toThrow();
  });

  it("never overwrites a phase-gated axis value already present on the partial", () => {
    const { axes, axisFills } = defaultFillAxes({
      scale: "medium",
      scriptClass: "alphabetic",
      diacriticBehavior: "multi-family", // explicitly elicited, non-default value
    });

    expect(axes.diacriticBehavior).toBe("multi-family");
    expect(axisFills.find((f: AxisFill) => f.axis === "diacriticBehavior")).toBeUndefined();
  });

  it("fills markInputOrder/remapPosture only for alphabetic scriptClass (N/A axes stay undefined for abugida)", () => {
    const { axes, axisFills } = defaultFillAxes({
      scale: "medium",
      scriptClass: "abugida",
    });

    expect(axes.markInputOrder).toBeUndefined();
    expect(axes.remapPosture).toBeUndefined();
    expect(axisFills.some((f: AxisFill) => f.axis === "markInputOrder")).toBe(false);
    expect(axisFills.some((f: AxisFill) => f.axis === "remapPosture")).toBe(false);
  });

  it("fills markInputOrder='prefix' (never postfix) and remapPosture='addition' for alphabetic scriptClass", () => {
    const { axes, axisFills } = defaultFillAxes({
      scale: "medium",
      scriptClass: "alphabetic",
    });

    expect(axes.markInputOrder).toBe("prefix");
    expect(axes.remapPosture).toBe("addition");
    expect(axisFills).toEqual(
      expect.arrayContaining([
        { axis: "markInputOrder", value: "prefix", source: "script-class-prior" },
        { axis: "remapPosture", value: "addition", source: "script-class-prior" },
      ]),
    );
  });

  it("all axisFills carry source 'script-class-prior'", () => {
    const { axisFills } = defaultFillAxes({ scale: "small", scriptClass: "alphabetic" });
    expect(axisFills.length).toBeGreaterThan(0);
    for (const fill of axisFills) {
      expect(fill.source).toBe("script-class-prior");
    }
  });
});
