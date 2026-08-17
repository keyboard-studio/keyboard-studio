import { describe, it, expect } from "vitest";
import { checkContextTolerance } from "./check-19-x-context-tolerance.js";
import type { KeyboardIR, ToleranceReport } from "@keyboard-studio/contracts";

function makeIR(): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "test",
      name: "Test",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

const LOCATION = { file: "test", line: 3 };

// "a with acute" precomposed (single codepoint, U+00E1) vs. "a" + combining
// acute U+0301 (two codepoints) — the two canonically-equivalent forms this
// feature exists to reconcile.
const PRECOMPOSED = "á".normalize("NFC");
const DECOMPOSED = "á";

describe("checkContextTolerance (19.x KM_WARN_CONTEXT_NOT_TOLERANT / KM_HINT_CONTEXT_NOT_ANALYSED)", () => {
  it("returns [] when the report is absent, and does not throw", () => {
    expect(checkContextTolerance(makeIR(), undefined)).toEqual([]);
  });

  it("returns [] for a clean report (all rules tolerant)", () => {
    const report: ToleranceReport = {
      findings: [{ ruleId: "r1", location: LOCATION, status: "tolerant" }],
      notAnalysedCount: 0,
    };
    expect(checkContextTolerance(makeIR(), report)).toEqual([]);
  });

  it("returns [] for a report where every gap has already been made tolerant", () => {
    const report: ToleranceReport = {
      findings: [{ ruleId: "r1", location: LOCATION, status: "made-tolerant" }],
      notAnalysedCount: 0,
    };
    expect(checkContextTolerance(makeIR(), report)).toEqual([]);
  });

  it("emits KM_WARN_CONTEXT_NOT_TOLERANT for a diagnosed gap, naming the rule's location and both outputs", () => {
    const report: ToleranceReport = {
      findings: [
        {
          ruleId: "acute-rule",
          location: LOCATION,
          status: "not-analysed",
          failingKeystrokes: [{ vkey: "K_QUOTE", modifiers: [] }],
          precomposedOutput: PRECOMPOSED,
          decomposedOutput: DECOMPOSED,
        },
      ],
      notAnalysedCount: 0,
    };
    const findings = checkContextTolerance(makeIR(), report);
    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.code).toBe("KM_WARN_CONTEXT_NOT_TOLERANT");
    expect(finding.severity).toBe("warning");
    expect(finding.layer).toBe("C");
    expect(finding.location).toEqual(LOCATION);
    expect(finding.message).toContain("acute-rule");
    expect(finding.message).toContain("U+00E1");
    expect(finding.message).toContain("U+0301");
    expect(finding.message).not.toMatch(/NFC|NFD/);
  });

  it("emits KM_HINT_CONTEXT_NOT_ANALYSED for an opaque or unresolved-pairing rule", () => {
    const report: ToleranceReport = {
      findings: [
        {
          ruleId: "opaque-rule",
          location: LOCATION,
          status: "not-analysed",
          notAnalysedReason: "rule contains an opaque construct",
        },
      ],
      notAnalysedCount: 1,
    };
    const findings = checkContextTolerance(makeIR(), report);
    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.code).toBe("KM_HINT_CONTEXT_NOT_ANALYSED");
    expect(finding.severity).toBe("hint");
    expect(finding.layer).toBe("C");
    expect(finding.message).toContain("opaque-rule");
    expect(finding.message).toContain("rule contains an opaque construct");
  });
});
