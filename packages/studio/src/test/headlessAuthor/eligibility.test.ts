import { describe, expect, it } from "vitest";
import { eligibility, type EligibilityDeps } from "./eligibility.ts";

const table: Record<string, { group?: string; status?: string; script?: string }> = {
  ok_latin: { group: "o", status: "clean", script: "Latn" },
  ok_opaque: { group: "o", status: "clean-with-opaque", script: "Latn" },
  ok_cyrl: { group: "o", status: "clean", script: "Cyrl" },
  diverges: { group: "d", status: "round-trip-divergence", script: "Latn" },
  amharic: { group: "e", status: "clean", script: "Ethi" },
  mandarin: { group: "z", status: "clean", script: "Hans" },
  unlisted: { group: "u", script: "Latn" },
};

const deps: EligibilityDeps = {
  groupOf: (b) => table[b]?.group,
  importStatus: (b) => table[b]?.status,
  scriptOf: (b) => table[b]?.script,
};

describe("eligibility", () => {
  it("accepts clean and clean-with-opaque keyboards", () => {
    expect(eligibility("ok_latin", "all-eligible", deps)).toEqual({ eligible: true, group: "o" });
    expect(eligibility("ok_opaque", undefined, deps)).toEqual({ eligible: true, group: "o" });
  });

  it("skips: missing", () => {
    expect(eligibility("nope", "all-eligible", deps)).toEqual({ eligible: false, reason: "missing" });
  });

  it("skips: not-codec-clean (divergent or unlisted)", () => {
    expect(eligibility("diverges", "all-eligible", deps)).toEqual({ eligible: false, reason: "not-codec-clean" });
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
