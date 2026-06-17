/**
 * Tests for the Layer A' entry-point barrel (index-import-fidelity.ts)
 * and the buildImportReport assembler (import-keyboard.ts).
 *
 * Covers:
 *   - runImportFidelityParseChecks → returns I1 + I4 findings (no I2, no I3)
 *   - runImportFidelityEmitChecks  → returns I2-stub + I3 findings (no I1, no I4)
 *   - buildImportReport status mapping:
 *       ParseFailure       (parseError set)
 *       RoundTripDivergence (hasRoundTripDivergence = true — future-wired branch)
 *       CleanWithOpaque     (opaqueFeatures present)
 *       Clean               (no errors, no opaque)
 *   - recognizedRatio + opaqueFeatureInventory are surfaced on the report
 *   - checkSidecarHash re-export from the barrel
 */

import { describe, it, expect } from "vitest";
import {
  runImportFidelityParseChecks,
  runImportFidelityEmitChecks,
  checkSidecarHash,
} from "./index-import-fidelity.js";
import { buildImportReport } from "../codec/import-keyboard.js";
import { parse } from "../codec/parse.js";
import { ImportStatus } from "@keyboard-studio/contracts";
import type { KeyboardIR } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const CLEAN_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Test Keyboard'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2024 SIL'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > U+0061
`;

const _OPAQUE_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Opaque KB'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2024 SIL'
store(&KEYBOARDVERSION) '1.0'
store(myFlag) 'x'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > U+0061
+ [K_B] > save(myFlag, 1)
`;

/** A minimal KeyboardIR with all required header fields. */
function makeIR(): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "test-kb",
      name: "Test Keyboard",
      bcp47: ["en"],
      copyright: "(c) 2024 SIL",
      version: "1.0",
      targets: ["any"],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

/** A canonical emitted .kmn produced by emit(). */
const EMITTED_WITH_HEADERS = [
  "store(&VERSION) '10.0'",
  "store(&NAME) 'Test Keyboard'",
  "store(&COPYRIGHT) '(c) 2024 SIL'",
  "store(&KEYBOARDVERSION) '1.0'",
  "",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "",
  "+ [K_A] > 'a'",
].join("\n");

// ---------------------------------------------------------------------------
// runImportFidelityParseChecks
// ---------------------------------------------------------------------------

describe("runImportFidelityParseChecks", () => {
  it("returns at least one finding (the I4 inventory finding is always present)", () => {
    const parseResult = parse(CLEAN_KMN, "test");
    const findings = runImportFidelityParseChecks(parseResult, CLEAN_KMN);
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("includes the KM_INFO_OPAQUE_FEATURE_INVENTORY (I4) finding", () => {
    const parseResult = parse(CLEAN_KMN, "test");
    const findings = runImportFidelityParseChecks(parseResult, CLEAN_KMN);
    const codes = findings.map((f) => f.code);
    expect(codes).toContain("KM_INFO_OPAQUE_FEATURE_INVENTORY");
  });

  it("does NOT include I2 (KM_HINT_ROUND_TRIP_DEFERRED) — that is an emit-stage check", () => {
    const parseResult = parse(CLEAN_KMN, "test");
    const findings = runImportFidelityParseChecks(parseResult, CLEAN_KMN);
    const codes = findings.map((f) => f.code);
    expect(codes).not.toContain("KM_HINT_ROUND_TRIP_DEFERRED");
  });

  it("does NOT include I3 (KM_WARN_HEADER_FIELD_MISSING) — that is an emit-stage check", () => {
    const parseResult = parse(CLEAN_KMN, "test");
    const findings = runImportFidelityParseChecks(parseResult, CLEAN_KMN);
    const codes = findings.map((f) => f.code);
    expect(codes).not.toContain("KM_WARN_HEADER_FIELD_MISSING");
  });

  it("includes KM_ERROR_PARSE_INCOMPLETE (I1) when source has more tokens than IR nodes", () => {
    const parseResult = parse(CLEAN_KMN, "test");
    // Append extra rule tokens that parse() never saw
    const extendedSource = CLEAN_KMN + "+ [K_C] > U+0063\n";
    const findings = runImportFidelityParseChecks(parseResult, extendedSource);
    const codes = findings.map((f) => f.code);
    expect(codes).toContain("KM_ERROR_PARSE_INCOMPLETE");
  });

  it("does NOT include KM_ERROR_PARSE_INCOMPLETE when source and IR agree", () => {
    const parseResult = parse(CLEAN_KMN, "test");
    const findings = runImportFidelityParseChecks(parseResult, CLEAN_KMN);
    const codes = findings.map((f) => f.code);
    expect(codes).not.toContain("KM_ERROR_PARSE_INCOMPLETE");
  });
});

// ---------------------------------------------------------------------------
// runImportFidelityEmitChecks
// ---------------------------------------------------------------------------

describe("runImportFidelityEmitChecks", () => {
  it("includes KM_HINT_ROUND_TRIP_DEFERRED (I2 stub) finding", async () => {
    const ir = makeIR();
    const findings = await runImportFidelityEmitChecks(ir, EMITTED_WITH_HEADERS);
    const codes = findings.map((f) => f.code);
    expect(codes).toContain("KM_HINT_ROUND_TRIP_DEFERRED");
  });

  it("does NOT include I1 (KM_ERROR_PARSE_INCOMPLETE) -- parse-stage only", async () => {
    const ir = makeIR();
    const findings = await runImportFidelityEmitChecks(ir, EMITTED_WITH_HEADERS);
    const codes = findings.map((f) => f.code);
    expect(codes).not.toContain("KM_ERROR_PARSE_INCOMPLETE");
  });

  it("does NOT include I4 (KM_INFO_OPAQUE_FEATURE_INVENTORY) -- parse-stage only", async () => {
    const ir = makeIR();
    const findings = await runImportFidelityEmitChecks(ir, EMITTED_WITH_HEADERS);
    const codes = findings.map((f) => f.code);
    expect(codes).not.toContain("KM_INFO_OPAQUE_FEATURE_INVENTORY");
  });

  it("returns at least 1 finding (the I2 deferred hint)", async () => {
    const ir = makeIR();
    const findings = await runImportFidelityEmitChecks(ir, EMITTED_WITH_HEADERS);
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("returns a finding with severity 'hint' for the I2 stub", async () => {
    const ir = makeIR();
    const findings = await runImportFidelityEmitChecks(ir, EMITTED_WITH_HEADERS);
    const hintFinding = findings.find((f) => f.code === "KM_HINT_ROUND_TRIP_DEFERRED");
    expect(hintFinding?.severity).toBe("hint");
  });
});

// ---------------------------------------------------------------------------
// checkSidecarHash re-export
// ---------------------------------------------------------------------------

describe("checkSidecarHash re-export from index-import-fidelity", () => {
  it("is exported and callable", async () => {
    // If the barrel re-exports it, this call resolves without error.
    const findings = await checkSidecarHash("test", "sidecar text",
      "0000000000000000000000000000000000000000000000000000000000000000");
    // Hash mismatch expected (stale zeros vs real hash of 'sidecar text')
    expect(findings[0]?.code).toBe("KM_ERROR_SIDECAR_HASH_MISMATCH");
  });
});

// ---------------------------------------------------------------------------
// buildImportReport — status mapping
// ---------------------------------------------------------------------------

describe("buildImportReport", () => {
  it("status is ParseFailure when parseError is set", () => {
    const report = buildImportReport({
      keyboardId: "kb",
      parseError: "unexpected token at line 5",
      opaqueFeatures: [],
      recognizedRatio: 0,
      hasRoundTripDivergence: false,
    });
    expect(report.status).toBe(ImportStatus.ParseFailure);
  });

  it("parseErrors array contains the error message when parseError is set", () => {
    const errMsg = "unexpected token at line 5";
    const report = buildImportReport({
      keyboardId: "kb",
      parseError: errMsg,
      opaqueFeatures: [],
      recognizedRatio: 0,
      hasRoundTripDivergence: false,
    });
    expect(report.parseErrors).toContain(errMsg);
  });

  it("status is RoundTripDivergence when hasRoundTripDivergence is true (future-wired branch)", () => {
    const report = buildImportReport({
      keyboardId: "kb",
      parseError: null,
      opaqueFeatures: [],
      recognizedRatio: 1,
      hasRoundTripDivergence: true,
    });
    expect(report.status).toBe(ImportStatus.RoundTripDivergence);
  });

  it("status is CleanWithOpaque when opaqueFeatures.length > 0 and no errors", () => {
    const report = buildImportReport({
      keyboardId: "kb",
      parseError: null,
      opaqueFeatures: [{ feature: "option-store-directive", count: 2 }],
      recognizedRatio: 0.8,
      hasRoundTripDivergence: false,
    });
    expect(report.status).toBe(ImportStatus.CleanWithOpaque);
  });

  it("status is Clean when no errors and no opaque features", () => {
    const report = buildImportReport({
      keyboardId: "kb",
      parseError: null,
      opaqueFeatures: [],
      recognizedRatio: 1.0,
      hasRoundTripDivergence: false,
    });
    expect(report.status).toBe(ImportStatus.Clean);
  });

  it("ParseFailure takes priority over RoundTripDivergence", () => {
    // parseError is set AND hasRoundTripDivergence is true → ParseFailure wins
    const report = buildImportReport({
      keyboardId: "kb",
      parseError: "boom",
      opaqueFeatures: [],
      recognizedRatio: 0,
      hasRoundTripDivergence: true,
    });
    expect(report.status).toBe(ImportStatus.ParseFailure);
  });

  it("ParseFailure takes priority over CleanWithOpaque", () => {
    const report = buildImportReport({
      keyboardId: "kb",
      parseError: "boom",
      opaqueFeatures: [{ feature: "option-store-directive", count: 1 }],
      recognizedRatio: 0,
      hasRoundTripDivergence: false,
    });
    expect(report.status).toBe(ImportStatus.ParseFailure);
  });

  it("RoundTripDivergence takes priority over CleanWithOpaque", () => {
    const report = buildImportReport({
      keyboardId: "kb",
      parseError: null,
      opaqueFeatures: [{ feature: "option-store-directive", count: 1 }],
      recognizedRatio: 0.5,
      hasRoundTripDivergence: true,
    });
    expect(report.status).toBe(ImportStatus.RoundTripDivergence);
  });

  it("opaqueFeatureInventory is populated on the report", () => {
    const features = [
      { feature: "option-store-directive", count: 3 },
      { feature: "outs-expansion", count: 1 },
    ];
    const report = buildImportReport({
      keyboardId: "kb",
      parseError: null,
      opaqueFeatures: features,
      recognizedRatio: 0.6,
      hasRoundTripDivergence: false,
    });
    expect(report.opaqueFeatureInventory).toEqual(features);
  });

  it("recognizedRatio is surfaced on the report", () => {
    const report = buildImportReport({
      keyboardId: "kb",
      parseError: null,
      opaqueFeatures: [],
      recognizedRatio: 0.75,
      hasRoundTripDivergence: false,
    });
    expect(report.recognizedRatio).toBe(0.75);
  });

  it("keyboardId is reflected on the report", () => {
    const report = buildImportReport({
      keyboardId: "my-special-keyboard",
      parseError: null,
      opaqueFeatures: [],
      recognizedRatio: 1,
      hasRoundTripDivergence: false,
    });
    expect(report.keyboardId).toBe("my-special-keyboard");
  });

  it("parseErrors is empty array when parseError is null", () => {
    const report = buildImportReport({
      keyboardId: "kb",
      parseError: null,
      opaqueFeatures: [],
      recognizedRatio: 1,
      hasRoundTripDivergence: false,
    });
    expect(report.parseErrors).toEqual([]);
  });

  it("synthetic RoundTripDiff: report does NOT include roundTripDiff when status is Clean", () => {
    // The buildImportReport function doesn't accept a roundTripDiff directly;
    // it only sets status. Confirm roundTripDiff is absent on Clean reports.
    const report = buildImportReport({
      keyboardId: "kb",
      parseError: null,
      opaqueFeatures: [],
      recognizedRatio: 1,
      hasRoundTripDivergence: false,
    });
    expect(report.roundTripDiff).toBeUndefined();
  });
});
