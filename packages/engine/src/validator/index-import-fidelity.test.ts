/**
 * Tests for the Layer A' entry-point barrel (index-import-fidelity.ts).
 *
 * Covers:
 *   - runImportFidelityParseChecks → returns I1 + I4 findings (no I2, no I3)
 *   - the split emit stage: runImportFidelityEmitChecksSync (I3 + I6, no I2)
 *     and runImportFidelityRoundTripCheck (I2 only)
 *   - checkSidecarHash re-export from the barrel
 */

import { describe, it, expect } from "vitest";
import {
  runImportFidelityParseChecks,
  runImportFidelityEmitChecksSync,
  runImportFidelityRoundTripCheck,
  checkSidecarHash,
} from "./index-import-fidelity.js";
import { parse } from "../codec/parse.js";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";

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
  return makeTestIR({
    header: {
      keyboardId: "test-kb",
      name: "Test Keyboard",
      bcp47: ["en"],
      copyright: "(c) 2024 SIL",
      targets: ["any"],
    },
  });
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

  it("does NOT include I2 (KM_HINT_ROUND_TRIP_UNAVAILABLE) — that is an emit-stage check", () => {
    const parseResult = parse(CLEAN_KMN, "test");
    const findings = runImportFidelityParseChecks(parseResult, CLEAN_KMN);
    const codes = findings.map((f) => f.code);
    expect(codes).not.toContain("KM_HINT_ROUND_TRIP_UNAVAILABLE");
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
// The split emit stage (publish-after-ready): the studio's pre-`ready` path
// runs only the sync half; I2 runs separately after `ready` publishes.
// ---------------------------------------------------------------------------

/** Emitted text missing the &COPYRIGHT store the IR header carries — I3 fires. */
const EMITTED_MISSING_COPYRIGHT = [
  "store(&VERSION) '10.0'",
  "store(&NAME) 'Test Keyboard'",
  "store(&KEYBOARDVERSION) '1.0'",
  "",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "",
  "+ [K_A] > 'a'",
].join("\n");

describe("runImportFidelityEmitChecksSync / runImportFidelityRoundTripCheck", () => {
  it("sync half carries the emit-stage checks but NO I2 finding of any kind", () => {
    const ir = makeIR();
    const findings = runImportFidelityEmitChecksSync(ir, EMITTED_MISSING_COPYRIGHT);
    const codes = findings.map((f) => f.code);
    expect(codes).toContain("KM_WARN_HEADER_FIELD_MISSING");
    expect(codes.some((c) => c.includes("ROUND_TRIP"))).toBe(false);
  });

  it("sync half reports no header finding when the emitted text preserves the headers", () => {
    const ir = makeIR();
    const findings = runImportFidelityEmitChecksSync(ir, EMITTED_WITH_HEADERS);
    const codes = findings.map((f) => f.code);
    expect(codes).not.toContain("KM_WARN_HEADER_FIELD_MISSING");
  });

  it("round-trip half returns only I2 findings (unavailable hint without a harness)", async () => {
    const ir = makeIR();
    const findings = await runImportFidelityRoundTripCheck(ir);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.every((f) => f.code.includes("ROUND_TRIP"))).toBe(true);
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
