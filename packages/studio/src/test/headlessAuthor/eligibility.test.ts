import { describe, expect, it } from "vitest";
import { eligibility, MAX_SWEEP_RULE_COUNT, type EligibilityDeps } from "./eligibility.ts";

// `parses`: the codec parses it without error.
const table: Record<string, { group?: string; parses?: boolean; script?: string; rules?: number }> = {
  ok_latin: { group: "o", parses: true, script: "Latn" },
  ok_cyrl: { group: "o", parses: true, script: "Cyrl" },
  // round-trip-divergence still parses completely: eligible.
  diverges: { group: "d", parses: true, script: "Latn" },
  partial: { group: "p", parses: false, script: "Latn" },
  amharic: { group: "e", parses: true, script: "Ethi" },
  mandarin: { group: "z", parses: true, script: "Hans" },
  huge: { group: "h", parses: true, script: "Latn", rules: MAX_SWEEP_RULE_COUNT + 1 },
  atCap: { group: "h", parses: true, script: "Latn", rules: MAX_SWEEP_RULE_COUNT },
  unlisted: { group: "u", script: "Latn" },
};

const deps: EligibilityDeps = {
  groupOf: (b) => table[b]?.group,
  parsesCompletely: (b) => table[b]?.parses,
  scriptOf: (b) => table[b]?.script,
  ruleCountOf: (b) => table[b]?.rules,
};

describe("eligibility", () => {
  it("accepts any keyboard the codec parses, round-trip divergent or not", () => {
    expect(eligibility("ok_latin", "all-eligible", deps)).toEqual({ eligible: true, group: "o" });
    expect(eligibility("diverges", undefined, deps)).toEqual({ eligible: true, group: "d" });
  });

  it("skips: missing", () => {
    expect(eligibility("nope", "all-eligible", deps)).toEqual({ eligible: false, reason: "missing" });
  });

  it("skips: not-codec-clean (parse errors or unlisted)", () => {
    expect(eligibility("partial", "all-eligible", deps)).toEqual({ eligible: false, reason: "not-codec-clean" });
    expect(eligibility("unlisted", "all-eligible", deps)).toEqual({ eligible: false, reason: "not-codec-clean" });
  });

  it("skips: unsupported-script-stub (Ethiopic and CJK)", () => {
    for (const id of ["amharic", "mandarin"]) {
      expect(eligibility(id, "all-eligible", deps)).toEqual({ eligible: false, reason: "unsupported-script-stub" });
    }
  });

  it("skips: outside-slice", () => {
    expect(eligibility("ok_cyrl", "latin", deps)).toEqual({ eligible: false, reason: "outside-slice" });
    expect(eligibility("ok_latin", { ids: ["ok_opaque"] }, deps)).toEqual({ eligible: false, reason: "outside-slice" });
    expect(eligibility("ok_latin", "latin", deps).eligible).toBe(true);
    expect(eligibility("ok_latin", { ids: ["ok_latin"] }, deps).eligible).toBe(true);
  });

  it("skips: too-large only when the size cap is requested", () => {
    expect(eligibility("huge", "all-eligible", deps, { sizeCap: true })).toEqual({ eligible: false, reason: "too-large" });
    expect(eligibility("huge", "latin", deps, { sizeCap: true })).toEqual({ eligible: false, reason: "too-large" });
    expect(eligibility("atCap", "all-eligible", deps, { sizeCap: true }).eligible).toBe(true);
    // Explicit runs (no cap) still accept it, and an unlisted rule count is not a skip.
    expect(eligibility("huge", "all-eligible", deps).eligible).toBe(true);
    expect(eligibility("ok_latin", "all-eligible", deps, { sizeCap: true }).eligible).toBe(true);
  });

  it("checks cheaper reasons before too-large", () => {
    const d: EligibilityDeps = { ...deps, ruleCountOf: () => MAX_SWEEP_RULE_COUNT + 1 };
    expect(eligibility("amharic", "all-eligible", d, { sizeCap: true })).toEqual({ eligible: false, reason: "unsupported-script-stub" });
    expect(eligibility("ok_cyrl", "latin", d, { sizeCap: true })).toEqual({ eligible: false, reason: "outside-slice" });
  });
});
