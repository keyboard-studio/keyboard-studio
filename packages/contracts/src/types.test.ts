// see spec.md sections 5, 7.2, 10, 11, 12 — type-coverage tests for the
// contract surface that pattern.test.ts does not already cover (#71 #78).
//
// Each describe block targets one exported type from packages/contracts/src.
// Tests are shape-only: they construct the type at the value level under
// strict tsconfig (exactOptionalPropertyTypes + noUncheckedIndexedAccess)
// and assert the literals / optional-field semantics that the team-shared
// contract guarantees.

import { describe, it, expect } from "vitest";
import type {
  VirtualFS,
  VirtualFSEntry,
} from "./virtualFS";
import type { LintFinding, LintSeverity, LintLayer } from "./lintFinding";
import type {
  CompileResult,
  CompileArtifact,
} from "./compileResult";
import { makeCompileResult } from "./compileResult";
import type {
  SurveyPhase,
  SurveyAnswer,
  SurveyPhaseResult,
} from "./surveyPhaseResult";
import type { Criterion, CriteriaBand } from "./criteria";
import type {
  StrategyRecommendation,
  PrimaryRuleNumber,
} from "./strategy";
import { makeMockVirtualFS } from "./mocks/mockVirtualFS";
import criteriaJsonRaw from "../data/criteria.json";
import { ALL_CRITERIA, CRITERIA_BY_BAND } from "./criteriaData";

// -----------------------------------------------------------------------------
// VirtualFS (spec §11)
// -----------------------------------------------------------------------------

describe("VirtualFS interface", () => {
  it("mock satisfies the interface and round-trips entries", async () => {
    const fs: VirtualFS = makeMockVirtualFS([]);
    fs.set("LICENSE.md", "Copyright © 2026 X");
    const entry = fs.get("LICENSE.md");
    expect(entry).toBeDefined();
    expect(entry?.path).toBe("LICENSE.md");
    expect(entry?.isBinary).toBe(false);
  });

  it("delete removes an entry and returns true; get returns undefined after", () => {
    const fs: VirtualFS = makeMockVirtualFS([]);
    fs.set("a/b.txt", "hi");
    expect(fs.delete("a/b.txt")).toBe(true);
    expect(fs.get("a/b.txt")).toBeUndefined();
  });

  it("list with a prefix returns matching paths only", () => {
    const fs: VirtualFS = makeMockVirtualFS([]);
    fs.set("source/x.kmn", "");
    fs.set("source/x.kvks", "");
    fs.set("LICENSE.md", "");
    const sources = fs.list("source/");
    expect(sources.length).toBe(2);
    expect(sources.every((p) => p.startsWith("source/"))).toBe(true);
  });

  it("VirtualFSEntry shape: path/isBinary required, content typed", () => {
    const e: VirtualFSEntry = {
      path: "source/x.kmn",
      content: "c Comment\n",
      isBinary: false,
    };
    expect(e.isBinary).toBe(false);
    expect(typeof e.content).toBe("string");
  });
});

// -----------------------------------------------------------------------------
// LintFinding (spec §10)
// -----------------------------------------------------------------------------

describe("LintFinding interface", () => {
  it("accepts every LintSeverity literal", () => {
    const severities: LintSeverity[] = ["info", "hint", "warning", "error", "fatal"];
    severities.forEach((sev) => {
      const f: LintFinding = {
        code: "TEST",
        severity: sev,
        layer: "A",
        message: "x",
      };
      expect(f.severity).toBe(sev);
    });
  });

  it("accepts every LintLayer literal", () => {
    const layers: LintLayer[] = ["A", "A-prime", "B", "C"];
    layers.forEach((l) => {
      const f: LintFinding = {
        code: "TEST",
        severity: "warning",
        layer: l,
        message: "x",
      };
      expect(f.layer).toBe(l);
    });
  });

  it("optional location + hint can be omitted (exactOptionalPropertyTypes)", () => {
    const f: LintFinding = {
      code: "TEST",
      severity: "warning",
      layer: "C",
      message: "x",
    };
    expect("location" in f).toBe(false);
    expect("hint" in f).toBe(false);
  });

  it("location accepts file + line; optional column/endLine/endColumn", () => {
    const f: LintFinding = {
      code: "TEST",
      severity: "error",
      layer: "A",
      message: "x",
      location: { file: "source/x.kmn", line: 3, column: 5 },
      hint: "did you mean X?",
    };
    expect(f.location?.line).toBe(3);
    expect(f.hint).toBe("did you mean X?");
  });
});

// -----------------------------------------------------------------------------
// CompileResult / CompileArtifact (spec §4, §8 step 11)
// -----------------------------------------------------------------------------

describe("CompileResult and CompileArtifact", () => {
  it("success:false with empty artifacts is a valid shape (parse-fatal)", () => {
    const r: CompileResult = makeCompileResult({
      success: false,
      artifacts: [],
      diagnostics: [],
      compileMs: 0,
      isWarmCompile: true,
    });
    expect(r.success).toBe(false);
    expect(r.artifacts).toEqual([]);
    expect(r.diagnostics).toEqual([]);
    expect(r.isWarmCompile).toBe(true);
  });

  it("diagnostics is typed as CompilerDiagnostic[] (Layer A only)", () => {
    const r: CompileResult = makeCompileResult({
      success: false,
      artifacts: [],
      diagnostics: [
        {
          code: "KM_ERROR_X",
          severity: "error",
          layer: "A",
          message: "boom",
        },
      ],
      compileMs: 137,
      isWarmCompile: true,
    });
    expect(r.diagnostics[0]?.severity).toBe("error");
    expect(r.diagnostics[0]?.layer).toBe("A");
    // layer is narrowed to the literal "A" — assigning "B" or "C" to a
    // CompilerDiagnostic is a TS error (verified by typecheck, not at runtime).
  });

  it("isWarmCompile=false is the cold-start indicator (#92)", () => {
    const cold: CompileResult = makeCompileResult({
      success: true,
      artifacts: [],
      diagnostics: [],
      compileMs: 2400, // 2.4 seconds — well outside the 100-300ms target
      isWarmCompile: false,
    });
    // Filtering on isWarmCompile === true is the documented contract for
    // applying the spec §4 perf target to telemetry. Cold-start compiles
    // are excluded from that comparison.
    expect(cold.isWarmCompile).toBe(false);
    expect(cold.compileMs).toBeGreaterThan(300);
  });

  it("CompileArtifact has filename + url + sizeBytes", () => {
    const a: CompileArtifact = {
      filename: "x.kmx",
      url: "blob:http://localhost/x",
      sizeBytes: 1024,
    };
    expect(a.filename).toBe("x.kmx");
    expect(typeof a.url).toBe("string");
    expect(a.sizeBytes).toBe(1024);
  });
});

// -----------------------------------------------------------------------------
// SurveyPhaseResult (spec §8)
// -----------------------------------------------------------------------------

describe("SurveyPhaseResult interface", () => {
  it("accepts all 8 SurveyPhase literals", () => {
    const phases: SurveyPhase[] = ["A", "B", "C", "C-prime", "D", "E", "F", "G"];
    phases.forEach((p) => {
      const r: SurveyPhaseResult = { phase: p, answers: [] };
      expect(r.phase).toBe(p);
    });
  });

  it("computedAxes accepts a Partial<DiscoveryAxisVector>", () => {
    const r: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "alphabetic" },
    };
    expect(r.computedAxes?.scriptClass).toBe("alphabetic");
    expect(r.computedAxes?.scale).toBeUndefined();
  });

  it("answers accepts SurveyAnswer[]", () => {
    const a: SurveyAnswer = { questionId: "triggerKey", answerType: "key-name", value: "K_QUOTE" };
    const r: SurveyPhaseResult = { phase: "B", answers: [a] };
    expect(r.answers).toHaveLength(1);
    expect(r.answers[0]?.questionId).toBe("triggerKey");
  });

  it("optional fields (computedAxes, selectedPatternIds) can be omitted", () => {
    const r: SurveyPhaseResult = { phase: "G", answers: [] };
    expect("computedAxes" in r).toBe(false);
    expect("selectedPatternIds" in r).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// SurveyAnswer discriminated union (#85)
// -----------------------------------------------------------------------------

describe("SurveyAnswer discriminated union", () => {
  it("char-list variant constructs with value: string[]", () => {
    const a: SurveyAnswer = { questionId: "baseChars", answerType: "char-list", value: ["a", "b", "c"] };
    expect(a.answerType).toBe("char-list");
    expect(Array.isArray(a.value)).toBe(true);
    expect(a.value).toEqual(["a", "b", "c"]);
  });

  it("char-single variant constructs with value: string", () => {
    const a: SurveyAnswer = { questionId: "deadkeyTrigger", answerType: "char-single", value: "´" };
    expect(a.answerType).toBe("char-single");
    expect(typeof a.value).toBe("string");
  });

  it("key-name variant constructs with value: string", () => {
    const a: SurveyAnswer = { questionId: "triggerKey", answerType: "key-name", value: "K_QUOTE" };
    expect(a.answerType).toBe("key-name");
    expect(typeof a.value).toBe("string");
  });

  it("store-content variant constructs with value: string", () => {
    const a: SurveyAnswer = { questionId: "vowelStore", answerType: "store-content", value: "aeiouAEIOU" };
    expect(a.answerType).toBe("store-content");
    expect(typeof a.value).toBe("string");
  });

  it("boolean variant constructs with value: boolean (not string)", () => {
    const aTrue: SurveyAnswer = { questionId: "hasDeadkeys", answerType: "boolean", value: true };
    const aFalse: SurveyAnswer = { questionId: "hasDeadkeys", answerType: "boolean", value: false };
    expect(typeof aTrue.value).toBe("boolean");
    expect(aTrue.value).toBe(true);
    expect(aFalse.value).toBe(false);
    expect(typeof aTrue.value === "string").toBe(false);
  });

  it("select variant constructs with value: string", () => {
    const a: SurveyAnswer = { questionId: "scriptClass", answerType: "select", value: "alphabetic" };
    expect(a.answerType).toBe("select");
    expect(typeof a.value).toBe("string");
  });

  it("text variant constructs with value: string", () => {
    const a: SurveyAnswer = { questionId: "keyboardName", answerType: "text", value: "My Latin Keyboard" };
    expect(a.answerType).toBe("text");
    expect(typeof a.value).toBe("string");
  });

  it("SurveyPhaseResult.answers holds a mixed array of all 7 answerType variants", () => {
    const answers: SurveyAnswer[] = [
      { questionId: "baseChars",   answerType: "char-list",     value: ["a", "e", "i"] },
      { questionId: "triggerKey",  answerType: "key-name",      value: "K_QUOTE"       },
      { questionId: "hasDeadkeys", answerType: "boolean",       value: true            },
      { questionId: "scriptClass", answerType: "select",        value: "alphabetic"    },
      { questionId: "vowelStore",  answerType: "store-content", value: "aeiou"         },
      { questionId: "deadChar",    answerType: "char-single",   value: "´"             },
      { questionId: "kbdName",     answerType: "text",          value: "Test"          },
    ];
    const r: SurveyPhaseResult = { phase: "B", answers };
    expect(r.answers).toHaveLength(7);
    const types = r.answers.map((a) => a.answerType);
    (["char-list", "key-name", "boolean", "select", "store-content", "char-single", "text"] as const)
      .forEach((t) => expect(types).toContain(t));
  });

  it("type-narrowing: answerType === 'boolean' makes value: boolean visible to TS without a cast", () => {
    const a: SurveyAnswer = { questionId: "hasDeadkeys", answerType: "boolean", value: true };
    if (a.answerType === "boolean") {
      const narrowedValue: boolean = a.value;
      expect(narrowedValue).toBe(true);
    } else {
      expect.fail("answerType guard did not match the constructed variant");
    }
  });

  it("type-narrowing: answerType === 'char-list' makes value: string[] visible to TS without a cast", () => {
    const a: SurveyAnswer = { questionId: "baseChars", answerType: "char-list", value: ["α", "β", "γ"] };
    if (a.answerType === "char-list") {
      const narrowedValue: string[] = a.value;
      expect(narrowedValue).toHaveLength(3);
      expect(narrowedValue[0]).toBe("α");
    } else {
      expect.fail("answerType guard did not match the constructed variant");
    }
  });
});

// -----------------------------------------------------------------------------
// Criterion (spec §11) + criteria.json schema validation
// -----------------------------------------------------------------------------

describe("Criterion discriminated union (#103)", () => {
  it("accepts each band variant with no hook populated", () => {
    const scaffolderBake: Criterion = {
      id: "1.1-x",
      section: "1. Test",
      band: "scaffolder-bake",
      description: "x",
    };
    const layerC: Criterion = {
      id: "1.2-x",
      section: "1. Test",
      band: "layer-c-enforce",
      description: "x",
    };
    const yellow: Criterion = {
      id: "1.3-x",
      section: "1. Test",
      band: "yellow-survey",
      description: "x",
    };
    const red: Criterion = {
      id: "1.4-x",
      section: "1. Test",
      band: "red-checklist",
      description: "x",
    };
    expect(scaffolderBake.band).toBe("scaffolder-bake");
    expect(layerC.band).toBe("layer-c-enforce");
    expect(yellow.band).toBe("yellow-survey");
    expect(red.band).toBe("red-checklist");
  });

  it("scaffolder-bake variant preserves scaffolderRule hook", () => {
    const c: Criterion = {
      id: "1.1-x",
      section: "1. Test",
      band: "scaffolder-bake",
      description: "x",
      scaffolderRule: "strip-ncaps",
    };
    expect(c.band).toBe("scaffolder-bake");
    if (c.band === "scaffolder-bake") {
      expect(c.scaffolderRule).toBe("strip-ncaps");
    }
  });

  it("layer-c-enforce variant preserves lintRuleId hook", () => {
    const c: Criterion = {
      id: "1.2-x",
      section: "1. Test",
      band: "layer-c-enforce",
      description: "x",
      lintRuleId: "KM_LINT_MISSING_LICENSE",
    };
    if (c.band === "layer-c-enforce") {
      expect(c.lintRuleId).toBe("KM_LINT_MISSING_LICENSE");
    }
  });

  it("yellow-survey variant preserves surveyQuestionId hook", () => {
    const c: Criterion = {
      id: "1.3-x",
      section: "1. Test",
      band: "yellow-survey",
      description: "x",
      surveyQuestionId: "phase-a-q3",
    };
    if (c.band === "yellow-survey") {
      expect(c.surveyQuestionId).toBe("phase-a-q3");
    }
  });

  it("red-checklist variant preserves preSubmitChecklistText hook", () => {
    const c: Criterion = {
      id: "1.4-x",
      section: "1. Test",
      band: "red-checklist",
      description: "x",
      preSubmitChecklistText: "I confirm I am the copyright holder.",
    };
    if (c.band === "red-checklist") {
      expect(c.preSubmitChecklistText).toBe(
        "I confirm I am the copyright holder."
      );
    }
  });
});

describe("criteria.json schema conformance", () => {
  // resolveJsonModule:true in tsconfig.base.json lets us import JSON;
  // we narrow to Criterion[] and assert per-record invariants.
  const records = criteriaJsonRaw as readonly Criterion[];
  const validBands: readonly CriteriaBand[] = [
    "scaffolder-bake",
    "layer-c-enforce",
    "yellow-survey",
    "red-checklist",
  ];

  it("loads as a non-empty Criterion[]", () => {
    expect(Array.isArray(records)).toBe(true);
    expect(records.length).toBeGreaterThan(0);
  });

  it("every record has the required fields with correct types", () => {
    records.forEach((c, i) => {
      expect(typeof c.id, `record ${i}.id`).toBe("string");
      expect(typeof c.section, `record ${i}.section`).toBe("string");
      expect(typeof c.description, `record ${i}.description`).toBe("string");
      expect(validBands, `record ${i}.band='${c.band}'`).toContain(c.band);
    });
  });

  it("every record's id is unique within the catalog", () => {
    const ids = records.map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("matches the expected per-band counts (38/66/32/10 after the flagged-criteria re-review)", () => {
    const counts = records.reduce<Record<string, number>>((acc, c) => {
      acc[c.band] = (acc[c.band] ?? 0) + 1;
      return acc;
    }, {});
    // Sanity check: every observed band is one of the four valid bands.
    Object.keys(counts).forEach((k) => {
      expect(validBands).toContain(k);
    });
    // 133 original repo-hygiene criteria + 12 section-18 DISCUS design
    // heuristics + 1 split row (7.7a) from the flagged-criteria re-review = 146 total.
    expect(records.length).toBe(146);
    expect(counts["scaffolder-bake"]).toBe(38);
    expect(counts["layer-c-enforce"]).toBe(66);
    expect(counts["yellow-survey"]).toBe(32);
    expect(counts["red-checklist"]).toBe(10);
  });

  it("section-18 DISCUS rows are present, tagged with a valid principle, and banded correctly", () => {
    const validPrinciples = [
      "discoverability",
      "intuition",
      "simplicity",
      "consistency",
      "usability",
      "standards",
    ];
    const section18 = records.filter((c) =>
      c.section.startsWith("18.")
    );
    expect(section18.length).toBe(12);
    section18.forEach((c) => {
      expect(validPrinciples, `${c.id}.principle`).toContain(c.principle);
    });
    // The seven auto-checkable heuristics are layer-c-enforce.
    expect(
      section18.filter((c) => c.band === "layer-c-enforce").length
    ).toBe(7);
  });

  it("every principle-tagged record uses a valid DiscusPrinciple value", () => {
    const validPrinciples = [
      "discoverability",
      "intuition",
      "simplicity",
      "consistency",
      "usability",
      "standards",
    ];
    records
      .filter((c) => c.principle !== undefined)
      .forEach((c) =>
        expect(validPrinciples, `${c.id}.principle`).toContain(c.principle)
      );
  });

  it("every record carries its band-appropriate hook field (populated)", () => {
    records.forEach((c) => {
      switch (c.band) {
        case "scaffolder-bake":
          expect(typeof c.scaffolderRule, `${c.id}.scaffolderRule`).toBe("string");
          expect(c.scaffolderRule.length, `${c.id}.scaffolderRule non-empty`).toBeGreaterThan(0);
          break;
        case "layer-c-enforce":
          expect(typeof c.lintRuleId, `${c.id}.lintRuleId`).toBe("string");
          expect(c.lintRuleId.length, `${c.id}.lintRuleId non-empty`).toBeGreaterThan(0);
          break;
        case "yellow-survey":
          expect(typeof c.surveyQuestionId, `${c.id}.surveyQuestionId`).toBe("string");
          expect(c.surveyQuestionId.length, `${c.id}.surveyQuestionId non-empty`).toBeGreaterThan(0);
          break;
        case "red-checklist":
          expect(typeof c.preSubmitChecklistText, `${c.id}.preSubmitChecklistText`).toBe("string");
          expect(c.preSubmitChecklistText.length, `${c.id}.preSubmitChecklistText non-empty`).toBeGreaterThan(0);
          break;
      }
    });
  });

  it("no record carries a sibling-band hook field", () => {
    records.forEach((c) => {
      if (c.band !== "scaffolder-bake")
        expect("scaffolderRule" in c, `${c.id} must not have scaffolderRule`).toBe(false);
      if (c.band !== "layer-c-enforce")
        expect("lintRuleId" in c, `${c.id} must not have lintRuleId`).toBe(false);
      if (c.band !== "yellow-survey")
        expect("surveyQuestionId" in c, `${c.id} must not have surveyQuestionId`).toBe(false);
      if (c.band !== "red-checklist")
        expect("preSubmitChecklistText" in c, `${c.id} must not have preSubmitChecklistText`).toBe(false);
    });
  });
});

// -----------------------------------------------------------------------------
// ALL_CRITERIA / CRITERIA_BY_BAND loader (#116)
// -----------------------------------------------------------------------------

describe("criteriaData loader (#116)", () => {
  it("ALL_CRITERIA is a non-empty readonly Criterion[]", () => {
    expect(Array.isArray(ALL_CRITERIA)).toBe(true);
    expect(ALL_CRITERIA.length).toBe(146);
  });

  it("CRITERIA_BY_BAND partitions ALL_CRITERIA across the four bands", () => {
    const sum =
      CRITERIA_BY_BAND["scaffolder-bake"].length +
      CRITERIA_BY_BAND["layer-c-enforce"].length +
      CRITERIA_BY_BAND["yellow-survey"].length +
      CRITERIA_BY_BAND["red-checklist"].length;
    expect(sum).toBe(ALL_CRITERIA.length);
  });

  it("CRITERIA_BY_BAND entries match their declared band", () => {
    CRITERIA_BY_BAND["scaffolder-bake"].forEach((c) =>
      expect(c.band).toBe("scaffolder-bake")
    );
    CRITERIA_BY_BAND["layer-c-enforce"].forEach((c) =>
      expect(c.band).toBe("layer-c-enforce")
    );
    CRITERIA_BY_BAND["yellow-survey"].forEach((c) =>
      expect(c.band).toBe("yellow-survey")
    );
    CRITERIA_BY_BAND["red-checklist"].forEach((c) =>
      expect(c.band).toBe("red-checklist")
    );
  });
});

// -----------------------------------------------------------------------------
// StrategyRecommendation (spec §7.2)
// -----------------------------------------------------------------------------

describe("StrategyRecommendation interface", () => {
  it("accepts empty secondaries array (no add-on rules fired)", () => {
    const r: StrategyRecommendation = {
      primary: "S-01",
      secondaries: [],
      triggeredRule: 11,
    };
    expect(r.secondaries).toEqual([]);
  });

  it("accepts all valid PrimaryRuleNumber values (rules 9-10 excluded by type)", () => {
    const validRules: PrimaryRuleNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 11, 12];
    validRules.forEach((rule) => {
      const r: StrategyRecommendation = {
        primary: "S-03",
        secondaries: [],
        triggeredRule: rule,
      };
      expect(r.triggeredRule).toBe(rule);
    });
    // Rules 9 and 10 are secondaries-only and intentionally absent from the
    // PrimaryRuleNumber union — the type system prevents them from being
    // assigned to triggeredRule. (No runtime assertion needed; the
    // assignment in the loop above would fail typecheck if rule 9 or 10
    // appeared in validRules.)
  });

  it("secondaries can carry rule-9 and rule-10 add-on strategies (S-10, S-08)", () => {
    const r: StrategyRecommendation = {
      primary: "S-02",
      secondaries: ["S-10", "S-08", "S-04"],
      triggeredRule: 7,
    };
    expect(r.secondaries).toContain("S-10");
    expect(r.secondaries).toContain("S-08");
  });
});
