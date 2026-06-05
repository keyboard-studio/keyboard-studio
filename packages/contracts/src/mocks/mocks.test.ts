import { describe, it, expect } from "vitest";
import { mockBaseBrowser } from "./mockBaseBrowser";
import { mockPatternLibrary } from "./mockPatternLibrary";
import { mockValidator } from "./mockValidator";
import { mockCompiler } from "./mockCompiler";
import { mockScaffolder } from "./mockScaffolder";
import { mockLintEngine } from "./mockLintEngine";
import { mockOutputService } from "./mockOutputService";
import { makeMockVirtualFS, scaffoldedFS } from "./mockVirtualFS";
import {
  basicKbdus,
  silEuroLatin,
  silDevanagariPhonetic,
  sampleBaseKeyboards,
  latinDeadkeyAcuteSingle,
  samplePatterns,
  layerCFindings,
  validatorFindings,
  mixedDiagnosticsResult,
} from "../fixtures/index";
import type { LintFinding } from "../lintFinding";

// ---------------------------------------------------------------------------
// mockBaseBrowser
// ---------------------------------------------------------------------------

describe("mockBaseBrowser", () => {
  it("listAll returns non-empty array containing the basic_kbdus fixture", async () => {
    const all = await mockBaseBrowser.listAll();
    expect(all.length).toBeGreaterThanOrEqual(3);
    const ids = all.map((kb) => kb.id);
    expect(ids).toContain("basic_kbdus");
  });

  it("listAll result contains elements with required BaseKeyboard shape", async () => {
    const all = await mockBaseBrowser.listAll();
    const first = all[0]!;
    expect(typeof first.id).toBe("string");
    expect(typeof first.path).toBe("string");
    expect(typeof first.script).toBe("string");
    expect(Array.isArray(first.targets)).toBe(true);
    expect(typeof first.displayName).toBe("string");
    expect(typeof first.version).toBe("string");
  });

  it("getById('basic_kbdus') returns the basic_kbdus fixture", async () => {
    const result = await mockBaseBrowser.getById("basic_kbdus");
    expect(result).toBeDefined();
    expect(result!.id).toBe("basic_kbdus");
    expect(result!.path).toBe("release/basic/basic_kbdus");
    expect(result!.script).toBe("Latn");
  });

  it("getById('sil_euro_latin') returns the sil_euro_latin fixture", async () => {
    const result = await mockBaseBrowser.getById("sil_euro_latin");
    expect(result).toBeDefined();
    expect(result!.script).toBe("Latn");
  });

  it("getById('sil_devanagari_phonetic') returns the Devanagari fixture", async () => {
    const result = await mockBaseBrowser.getById("sil_devanagari_phonetic");
    expect(result).toBeDefined();
    expect(result!.script).toBe("Deva");
  });

  it("getById('unknown') returns undefined", async () => {
    const result = await mockBaseBrowser.getById("unknown");
    expect(result).toBeUndefined();
  });

  it("search by query matches id case-insensitively", async () => {
    const results = await mockBaseBrowser.search("BASIC_KBDUS");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.id).toBe("basic_kbdus");
  });

  it("search with script filter returns only matching script", async () => {
    const results = await mockBaseBrowser.search("", { script: "Deva" });
    expect(results.every((kb) => kb.script === "Deva")).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("search with target filter includes only keyboards with that target", async () => {
    const results = await mockBaseBrowser.search("", { target: "mobile" });
    expect(results.every((kb) => kb.targets.includes("mobile"))).toBe(true);
  });

  it("search with empty query and no filters returns all keyboards", async () => {
    const all = await mockBaseBrowser.listAll();
    const searched = await mockBaseBrowser.search("");
    expect(searched.length).toBe(all.length);
  });
});

// ---------------------------------------------------------------------------
// mockPatternLibrary
// ---------------------------------------------------------------------------

describe("mockPatternLibrary", () => {
  it("listAll returns non-empty array containing the worked-example pattern", async () => {
    const all = await mockPatternLibrary.listAll();
    expect(all.length).toBeGreaterThanOrEqual(3);
    const ids = all.map((p) => p.id);
    expect(ids).toContain("latin_deadkey_acute_single");
  });

  it("listAll result elements have required Pattern shape", async () => {
    const all = await mockPatternLibrary.listAll();
    const first = all[0]!;
    expect(typeof first.id).toBe("string");
    expect(typeof first.title).toBe("string");
    expect(typeof first.description).toBe("string");
    expect(["desktop", "touch", "reorder"]).toContain(first.category);
    expect(Array.isArray(first.appliesTo)).toBe(true);
    expect(Array.isArray(first.questions)).toBe(true);
    expect(typeof first.kmnFragment).toBe("string");
    expect(Array.isArray(first.tests)).toBe(true);
  });

  it("getById('latin_deadkey_acute_single') returns the spec §6 worked example", async () => {
    const result = await mockPatternLibrary.getById("latin_deadkey_acute_single");
    expect(result).toBeDefined();
    expect(result!.strategyId).toBe("S-02");
    expect(result!.combinesWith).toEqual(["S-04", "S-08", "S-11"]);
    expect(result!.category).toBe("desktop");
    expect(result!.questions).toHaveLength(5);
  });

  it("getById('nfd_normalization') returns the reorder pattern", async () => {
    const result = await mockPatternLibrary.getById("nfd_normalization");
    expect(result).toBeDefined();
    expect(result!.category).toBe("reorder");
  });

  it("getById('longpress_alternates') returns the touch pattern", async () => {
    const result = await mockPatternLibrary.getById("longpress_alternates");
    expect(result).toBeDefined();
    expect(result!.category).toBe("touch");
  });

  it("getById('unknown') returns undefined", async () => {
    const result = await mockPatternLibrary.getById("unknown");
    expect(result).toBeUndefined();
  });

  it("filterFor without axes returns PatternMatch[] with reason 'appliesTo-match'", async () => {
    const results = await mockPatternLibrary.filterFor(basicKbdus);
    expect(results.length).toBeGreaterThanOrEqual(1);
    // PatternMatch shape: patternId + rank + reason; strategyId is optional
    const first = results[0]!;
    expect(typeof first.patternId).toBe("string");
    expect(first.rank).toBe(1);
    expect(first.reason).toBe("appliesTo-match");
    // Ranks are 1-based and ascending
    results.forEach((m, i) => {
      expect(m.rank).toBe(i + 1);
    });
  });

  it("filterFor with multi-family diacriticBehavior ranks S-02 first with reason 'primary-strategy'", async () => {
    const axes = {
      scale: "small" as const,
      scriptClass: "alphabetic" as const,
      phoneticIntuition: "strong" as const,
      diacriticBehavior: "multi-family" as const,
      multiMode: "single" as const,
      constraintEnforcement: "none" as const,
      spareKeyAvailability: "many" as const,
    };
    const results = await mockPatternLibrary.filterFor(silEuroLatin, axes);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const top = results[0]!;
    expect(top.rank).toBe(1);
    expect(top.reason).toBe("primary-strategy");
    expect(top.strategyId).toBe("S-02");
    // Lower-ranked matches carry the non-primary reason
    const lowerRanked = results.slice(1);
    lowerRanked.forEach((m) => {
      expect(m.reason).toBe("appliesTo-match");
    });
  });
});

// ---------------------------------------------------------------------------
// mockValidator
// ---------------------------------------------------------------------------

describe("mockValidator", () => {
  it("validate returns non-empty LintFinding array", async () => {
    const findings = await mockValidator.validate("c Test KMN\n");
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("validate returns only Layer A and Layer B findings", async () => {
    const findings = await mockValidator.validate("c Test KMN\n");
    const layers = new Set(findings.map((f) => f.layer));
    expect(layers.has("A") || layers.has("B")).toBe(true);
    expect(layers.has("C")).toBe(false);
  });

  it("validate result contains at least one error-severity finding (Layer A)", async () => {
    const findings = await mockValidator.validate("c Test\n");
    const hasError = findings.some((f) => f.severity === "error");
    expect(hasError).toBe(true);
  });

  it("validate result contains at least one warn-severity finding", async () => {
    const findings = await mockValidator.validate("c Test\n");
    const hasWarn = findings.some((f) => f.severity === "warning");
    expect(hasWarn).toBe(true);
  });

  it("validate result contains at least one hint-severity finding (Layer B)", async () => {
    const findings = await mockValidator.validate("c Test\n");
    const hasHint = findings.some((f) => f.severity === "hint");
    expect(hasHint).toBe(true);
  });

  it("validateFragment returns only Layer A findings", async () => {
    const findings = await mockValidator.validateFragment(
      "+ [K_A] > 'a'\n",
      { triggerKey: "K_A" }
    );
    const layers = new Set(findings.map((f) => f.layer));
    expect(layers.has("B")).toBe(false);
    expect(layers.has("C")).toBe(false);
    // Layer A must be present (fixture has A findings)
    expect(layers.has("A")).toBe(true);
  });

  it("LintFinding shape includes required fields", async () => {
    const findings = await mockValidator.validate("c Test\n");
    const f: LintFinding = findings[0]!;
    expect(typeof f.code).toBe("string");
    expect(typeof f.severity).toBe("string");
    expect(typeof f.layer).toBe("string");
    expect(typeof f.message).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// mockLintEngine
// ---------------------------------------------------------------------------

describe("mockLintEngine", () => {
  it("lint returns non-empty Layer C findings", async () => {
    const findings = await mockLintEngine.lint(scaffoldedFS, "my_keyboard");
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("lint returns ONLY Layer C findings", async () => {
    const findings = await mockLintEngine.lint(scaffoldedFS, "my_keyboard");
    const nonC = findings.filter((f) => f.layer !== "C");
    expect(nonC).toHaveLength(0);
  });

  it("lint result contains at least one error-severity finding", async () => {
    const findings = await mockLintEngine.lint(scaffoldedFS, "my_keyboard");
    const hasError = findings.some((f) => f.severity === "error");
    expect(hasError).toBe(true);
  });

  it("lint result contains at least one warn-severity finding", async () => {
    const findings = await mockLintEngine.lint(scaffoldedFS, "my_keyboard");
    const hasWarn = findings.some((f) => f.severity === "warning");
    expect(hasWarn).toBe(true);
  });

  it("lint result contains at least one info-severity finding", async () => {
    const findings = await mockLintEngine.lint(scaffoldedFS, "my_keyboard");
    const hasInfo = findings.some((f) => f.severity === "info");
    expect(hasInfo).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mockCompiler
// ---------------------------------------------------------------------------

describe("mockCompiler", () => {
  it("compile returns a CompileResult with required fields", async () => {
    const result = await mockCompiler.compile(scaffoldedFS, "my_keyboard");
    expect(typeof result.success).toBe("boolean");
    expect(Array.isArray(result.artifacts)).toBe(true);
    expect(Array.isArray(result.diagnostics)).toBe(true);
    expect(typeof result.compileMs).toBe("number");
    expect(typeof result.isWarmCompile).toBe("boolean");
  });

  it("compile returns at least one artifact", async () => {
    const result = await mockCompiler.compile(scaffoldedFS, "my_keyboard");
    expect(result.artifacts.length).toBeGreaterThanOrEqual(1);
  });

  it("compile artifact has filename, url, and sizeBytes", async () => {
    const result = await mockCompiler.compile(scaffoldedFS, "my_keyboard");
    const a = result.artifacts[0]!;
    expect(typeof a.filename).toBe("string");
    expect(typeof a.url).toBe("string");
    expect(typeof a.sizeBytes).toBe("number");
  });

  it("compile diagnostics contain at least one error-severity finding", async () => {
    const result = await mockCompiler.compile(scaffoldedFS, "my_keyboard");
    const hasError = result.diagnostics.some((d) => d.severity === "error");
    expect(hasError).toBe(true);
  });

  it("compile diagnostics contain at least one warning-severity finding", async () => {
    const result = await mockCompiler.compile(scaffoldedFS, "my_keyboard");
    const hasWarning = result.diagnostics.some(
      (d) => d.severity === "warning"
    );
    expect(hasWarning).toBe(true);
  });

  it("compile diagnostics contain at least one hint-severity finding", async () => {
    // 'info' is Layer C only; the WASM oracle (Layer A) never emits it.
    // See #88 (severity rename) and #96 (KM_INFO_COMPILE_START removal).
    const result = await mockCompiler.compile(scaffoldedFS, "my_keyboard");
    const hasHint = result.diagnostics.some((d) => d.severity === "hint");
    expect(hasHint).toBe(true);
  });

  it("compileMs is a positive number", async () => {
    const result = await mockCompiler.compile(scaffoldedFS, "my_keyboard");
    expect(result.compileMs).toBeGreaterThan(0);
  });

  it("init() is idempotent and isReady() reflects load state", async () => {
    // mockCompiler is module-scoped; init() may have been called by a
    // previous test in this describe block. Either way the test asserts
    // the idempotency contract: repeat init() returns the same promise,
    // and after the promise resolves isReady() is true.
    const a = mockCompiler.init();
    const b = mockCompiler.init();
    expect(a).toBe(b); // same promise returned on repeat call
    await a;
    expect(mockCompiler.isReady()).toBe(true);
  });

  it("compile() returns a Layer-A-only diagnostic stream", async () => {
    const result = await mockCompiler.compile(scaffoldedFS, "my_keyboard");
    // CompilerDiagnostic = LintFinding & { layer: "A" }. Every diagnostic in
    // the array MUST have layer === "A"; B and C come from other services.
    result.diagnostics.forEach((d) => {
      expect(d.layer).toBe("A");
    });
  });
});

// ---------------------------------------------------------------------------
// mockScaffolder
// ---------------------------------------------------------------------------

describe("mockScaffolder", () => {
  it("scaffold returns a VirtualFS with required keyboard source paths", async () => {
    const fs = await mockScaffolder.scaffold(basicKbdus, "my_keyboard", "My Keyboard");
    expect(fs.get("source/my_keyboard.kmn")).toBeDefined();
    expect(fs.get("LICENSE.md")).toBeDefined();
    expect(fs.get("HISTORY.md")).toBeDefined();
    expect(fs.get("README.md")).toBeDefined();
  });

  it("scaffold list() returns a non-empty path list", async () => {
    const fs = await mockScaffolder.scaffold(basicKbdus, "my_keyboard", "My Keyboard");
    const paths = fs.list();
    expect(paths.length).toBeGreaterThanOrEqual(1);
  });

  it("listTemplates returns the three §9 routing-group templates", async () => {
    const templates = await mockScaffolder.listTemplates();
    expect(templates.length).toBe(3);
    expect(templates).toContain("qwerty-qwertz");
  });

  it("listTemplates includes 'non-roman'", async () => {
    const templates = await mockScaffolder.listTemplates();
    expect(templates).toContain("non-roman");
  });
});

// ---------------------------------------------------------------------------
// mockOutputService
// ---------------------------------------------------------------------------

describe("mockOutputService", () => {
  it("toZip returns a Uint8Array", async () => {
    const bytes = await mockOutputService.toZip(scaffoldedFS);
    expect(bytes).toBeInstanceOf(Uint8Array);
  });

  it("toZip returns non-empty bytes", async () => {
    const bytes = await mockOutputService.toZip(scaffoldedFS);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("publishPR returns an object with prUrl and commitSha strings", async () => {
    const result = await mockOutputService.publishPR(scaffoldedFS, {
      token: "ghp_mock_token",
      forkOwner: "mock-user",
      branchName: "add/my_keyboard",
      commitMessage: "Add my_keyboard 1.0",
      prTitle: "Add My Keyboard 1.0",
      prBody: "## Summary\n- Mock PR body\n",
    });
    expect(typeof result.prUrl).toBe("string");
    expect(typeof result.commitSha).toBe("string");
    expect(result.prUrl.startsWith("https://")).toBe(true);
    expect(result.commitSha.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// makeMockVirtualFS (internal helper)
// ---------------------------------------------------------------------------

describe("makeMockVirtualFS", () => {
  it("get returns the entry for a path that was set", () => {
    const fs = makeMockVirtualFS([{ path: "source/test.kmn", content: "c test\n" }]);
    const entry = fs.get("source/test.kmn");
    expect(entry).toBeDefined();
    expect(entry!.path).toBe("source/test.kmn");
    expect(entry!.isBinary).toBe(false);
  });

  it("get returns undefined for a missing path", () => {
    const fs = makeMockVirtualFS([]);
    expect(fs.get("nonexistent.kmn")).toBeUndefined();
  });

  it("set then get round-trips content", () => {
    const fs = makeMockVirtualFS([]);
    fs.set("source/new.kmn", "c new file\n");
    const entry = fs.get("source/new.kmn");
    expect(entry).toBeDefined();
    expect(entry!.content).toBe("c new file\n");
  });

  it("delete removes an entry and returns true", () => {
    const fs = makeMockVirtualFS([{ path: "source/del.kmn", content: "" }]);
    expect(fs.delete("source/del.kmn")).toBe(true);
    expect(fs.get("source/del.kmn")).toBeUndefined();
  });

  it("delete returns false for non-existent path", () => {
    const fs = makeMockVirtualFS([]);
    expect(fs.delete("nope.kmn")).toBe(false);
  });

  it("list without prefix returns all paths", () => {
    const fs = makeMockVirtualFS([
      { path: "source/a.kmn", content: "" },
      { path: "LICENSE.md", content: "" },
    ]);
    expect(fs.list().length).toBe(2);
  });

  it("list with prefix filters to matching paths", () => {
    const fs = makeMockVirtualFS([
      { path: "source/a.kmn", content: "" },
      { path: "source/b.kps", content: "" },
      { path: "LICENSE.md", content: "" },
    ]);
    const sourceFiles = fs.list("source/");
    expect(sourceFiles.length).toBe(2);
    expect(sourceFiles.every((p) => p.startsWith("source/"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fixture cross-checks
// ---------------------------------------------------------------------------

describe("fixture cross-checks", () => {
  it("sampleBaseKeyboards has exactly 3 entries", () => {
    expect(sampleBaseKeyboards).toHaveLength(3);
  });

  it("basicKbdus path matches spec §4", () => {
    expect(basicKbdus.path).toBe("release/basic/basic_kbdus");
  });

  it("silEuroLatin is at the release/sil path (spec §7.5)", () => {
    expect(silEuroLatin.path).toBe("release/sil/sil_euro_latin");
  });

  it("silDevanagariPhonetic has Deva script (spec §7.5)", () => {
    expect(silDevanagariPhonetic.script).toBe("Deva");
  });

  it("samplePatterns has exactly 3 entries", () => {
    expect(samplePatterns).toHaveLength(3);
  });

  it("latinDeadkeyAcuteSingle matches spec §6 fields", () => {
    expect(latinDeadkeyAcuteSingle.id).toBe("latin_deadkey_acute_single");
    expect(latinDeadkeyAcuteSingle.strategyId).toBe("S-02");
    expect(latinDeadkeyAcuteSingle.combinesWith).toEqual(["S-04", "S-08", "S-11"]);
    expect(latinDeadkeyAcuteSingle.category).toBe("desktop");
    expect(latinDeadkeyAcuteSingle.tests[0]?.expectedOutput).toBe("á");
  });

  it("validatorFindings has only layer A and B entries", () => {
    const nonAB = validatorFindings.filter(
      (f) => f.layer !== "A" && f.layer !== "B"
    );
    expect(nonAB).toHaveLength(0);
  });

  it("layerCFindings has only layer C entries", () => {
    const nonC = layerCFindings.filter((f) => f.layer !== "C");
    expect(nonC).toHaveLength(0);
  });

  it("mixedDiagnosticsResult covers error / warning / hint (Layer A severity bands)", () => {
    // 'info' is Layer C only after #88; mixedDiagnosticsResult is a Layer A
    // compiler-output fixture so it must NOT contain 'info'. Bands present:
    // error (KM_ERROR_DUPLICATE_STORE), warning (KM_WARN_DEPRECATED_STORE_ID),
    // hint (KM_HINT_INDEX_STORE_LONG — see #96).
    const severities = new Set(
      mixedDiagnosticsResult.diagnostics.map((d) => d.severity)
    );
    expect(severities.has("error")).toBe(true);
    expect(severities.has("warning")).toBe(true);
    expect(severities.has("hint")).toBe(true);
    expect(severities.has("info")).toBe(false);
  });
});
