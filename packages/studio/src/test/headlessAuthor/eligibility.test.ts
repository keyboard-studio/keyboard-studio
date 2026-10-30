import { describe, expect, it } from "vitest";
import { eligibility, type EligibilityDeps } from "./eligibility.ts";

// `parses`: the codec parses it completely (no parse errors, I1 complete).
const table: Record<string, { group?: string; parses?: boolean; script?: string }> = {
  ok_latin: { group: "o", parses: true, script: "Latn" },
  ok_cyrl: { group: "o", parses: true, script: "Cyrl" },
  // round-trip-divergence still parses completely: eligible.
  diverges: { group: "d", parses: true, script: "Latn" },
  partial: { group: "p", parses: false, script: "Latn" },
  amharic: { group: "e", parses: true, script: "Ethi" },
  mandarin: { group: "z", parses: true, script: "Hans" },
  unlisted: { group: "u", script: "Latn" },
};

const deps: EligibilityDeps = {
  groupOf: (b) => table[b]?.group,
  parsesCompletely: (b) => table[b]?.parses,
  scriptOf: (b) => table[b]?.script,
};

describe("eligibility", () => {
  it("accepts any keyboard the codec parses completely, round-trip divergent or not", () => {
    expect(eligibility("ok_latin", "all-eligible", deps)).toEqual({ eligible: true, group: "o" });
    expect(eligibility("diverges", undefined, deps)).toEqual({ eligible: true, group: "d" });
  });

  it("skips: missing", () => {
    expect(eligibility("nope", "all-eligible", deps)).toEqual({ eligible: false, reason: "missing" });
  });

  it("skips: not-codec-clean (incomplete parse or unlisted)", () => {
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
});
