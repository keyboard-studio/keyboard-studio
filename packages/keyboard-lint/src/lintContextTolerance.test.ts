import { describe, it, expect } from "vitest";
import { createVirtualFS, type KeyboardIR, type ToleranceReport } from "@keyboard-studio/contracts";
import { lintContextTolerance, lintWithContext } from "./index.js";

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

const LOCATION = { file: "test.kmn", line: 3 };

const REPORT: ToleranceReport = {
  findings: [
    { ruleId: "r-tolerant", location: LOCATION, status: "tolerant" },
    { ruleId: "r-fixed", location: LOCATION, status: "made-tolerant" },
    {
      ruleId: "r-gap",
      location: LOCATION,
      status: "not-analysed",
      failingKeystrokes: [{ vkey: "K_RBRKT", modifiers: [] }],
      precomposedOutput: "ọ́",
      decomposedOutput: "ọ".normalize("NFD") + "´",
    },
    { ruleId: "r-opaque", location: LOCATION, status: "not-analysed", notAnalysedReason: "rule uses notany()" },
  ],
  notAnalysedCount: 0,
};

const TOLERANCE_CODES = new Set(["KM_WARN_CONTEXT_NOT_TOLERANT", "KM_HINT_CONTEXT_NOT_ANALYSED"]);

describe("lintContextTolerance (spec 078 narrow Layer C entry)", () => {
  it("returns exactly one warning per gap and one hint per unanalysed rule", () => {
    const findings = lintContextTolerance(makeIR(), REPORT);
    expect(findings.map((f) => f.code)).toEqual(["KM_WARN_CONTEXT_NOT_TOLERANT", "KM_HINT_CONTEXT_NOT_ANALYSED"]);
    expect(findings.every((f) => f.layer === "C")).toBe(true);
  });

  it("returns nothing for a clean report", () => {
    expect(lintContextTolerance(makeIR(), { findings: [REPORT.findings[0]!], notAnalysedCount: 0 })).toEqual([]);
  });

  it("carries no finding from any other Layer C check, even where the full suite reports some", async () => {
    const full = await lintWithContext(createVirtualFS(), "test", { keyboardIR: makeIR(), toleranceReport: REPORT });
    const narrow = lintContextTolerance(makeIR(), REPORT);

    expect(narrow.every((f) => TOLERANCE_CODES.has(f.code))).toBe(true);
    expect(narrow).toEqual(full.filter((f) => TOLERANCE_CODES.has(f.code)));
  });
});
