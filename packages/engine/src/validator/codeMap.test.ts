import { describe, it, expect } from "vitest";
import {
  CODE_MAP,
  translatePassthrough,
  translateWasmFinding,
  isOracleInapplicable,
} from "./codeMap.js";

describe("CODE_MAP", () => {
  it("includes named aliases for the 5 WASM-only checks", () => {
    expect(CODE_MAP["WARN_KeyShouldIncludeNCaps"]?.code).toBe(
      "KM_WARN_NCAPS_CONSISTENCY"
    );
    expect(CODE_MAP["HINT_UnreachableRule"]?.code).toBe(
      "KM_HINT_UNREACHABLE_RULE"
    );
    expect(CODE_MAP["ERROR_InvalidIf"]?.code).toBe(
      "KM_ERROR_INVALID_PLATFORM_STRING"
    );
    expect(CODE_MAP["ERROR_ContextExHasInvalidOffset"]?.code).toBe(
      "KM_ERROR_INVALID_CONTEXT_OFFSET"
    );
    expect(CODE_MAP["ERROR_InvalidNamedCode"]?.code).toBe(
      "KM_ERROR_INVALID_NAMED_CODE_CONSTANT"
    );
  });

  it("places #10/#11/#12 in the behavior group", () => {
    expect(CODE_MAP["WARN_KeyShouldIncludeNCaps"]?.group).toBe("behavior");
    expect(CODE_MAP["HINT_UnreachableRule"]?.group).toBe("behavior");
    expect(CODE_MAP["ERROR_InvalidIf"]?.group).toBe("behavior");
  });

  it("places #13/#14 in the reference group", () => {
    expect(CODE_MAP["ERROR_ContextExHasInvalidOffset"]?.group).toBe(
      "reference"
    );
    expect(CODE_MAP["ERROR_InvalidNamedCode"]?.group).toBe("reference");
  });

  it("preserves upstream severity for known codes", () => {
    expect(CODE_MAP["WARN_KeyShouldIncludeNCaps"]?.severity).toBe("warning");
    expect(CODE_MAP["HINT_UnreachableRule"]?.severity).toBe("hint");
    expect(CODE_MAP["ERROR_InvalidIf"]?.severity).toBe("error");
  });
});

describe("translatePassthrough", () => {
  it("maps FATAL_* to fatal severity and KM_FATAL_KMCMP_ prefix", () => {
    const out = translatePassthrough("FATAL_BufferOverflow");
    expect(out.severity).toBe("fatal");
    expect(out.code).toBe("KM_FATAL_KMCMP_BUFFEROVERFLOW");
  });

  it("maps ERROR_* to error severity and KM_ERROR_KMCMP_ prefix", () => {
    const out = translatePassthrough("ERROR_SomethingBad");
    expect(out.severity).toBe("error");
    expect(out.code).toBe("KM_ERROR_KMCMP_SOMETHINGBAD");
  });

  it("maps WARN_* to warning severity", () => {
    const out = translatePassthrough("WARN_StrangeThing");
    expect(out.severity).toBe("warning");
    expect(out.code).toBe("KM_WARN_KMCMP_STRANGETHING");
  });

  it("maps HINT_* to hint severity", () => {
    const out = translatePassthrough("HINT_Maybe");
    expect(out.severity).toBe("hint");
    expect(out.code).toBe("KM_HINT_KMCMP_MAYBE");
  });

  it("downgrades INFO_* to hint (Layer A cannot emit info)", () => {
    const out = translatePassthrough("INFO_Whatever");
    expect(out.severity).toBe("hint");
    expect(out.code).toBe("KM_HINT_KMCMP_WHATEVER");
  });

  it("falls back to hint severity for unknown-prefix codes", () => {
    const out = translatePassthrough("ZZZ_NoSuchPrefix");
    expect(out.severity).toBe("hint");
    expect(out.code).toBe("KM_HINT_KMCMP_ZZZ_NOSUCHPREFIX");
  });

  it("does not collide with empty suffixes", () => {
    const out = translatePassthrough("ERROR_");
    expect(out.code).toBe("KM_ERROR_KMCMP_UNKNOWN");
  });
});

describe("translateWasmFinding", () => {
  it("uses CODE_MAP when the kmcmplib code is known", () => {
    const { finding, group } = translateWasmFinding(
      {
        kmcmpCode: "HINT_UnreachableRule",
        line: 7,
        column: 3,
        text: "Rule shadowed",
      },
      "file.kmn"
    );
    expect(finding.code).toBe("KM_HINT_UNREACHABLE_RULE");
    expect(finding.severity).toBe("hint");
    expect(finding.layer).toBe("A");
    expect(finding.location).toEqual({ file: "file.kmn", line: 7, column: 3 });
    expect(group).toBe("behavior");
  });

  it("routes unmapped codes through passthrough with group: passthrough", () => {
    const { finding, group } = translateWasmFinding(
      {
        kmcmpCode: "ERROR_NewlyAddedDiagnostic",
        line: 2,
        text: "some message",
      },
      "file.kmn"
    );
    expect(finding.code).toBe("KM_ERROR_KMCMP_NEWLYADDEDDIAGNOSTIC");
    expect(finding.severity).toBe("error");
    expect(finding.layer).toBe("A");
    expect(finding.location).toEqual({ file: "file.kmn", line: 2 });
    expect(group).toBe("passthrough");
  });
});

describe("isOracleInapplicable", () => {
  it("matches ERROR_CannotReadBitmapFile by its full numeric wire code", () => {
    // Error(0x500000) | KmnCompiler(0x2000) | 0x031 = 0x502031 = 5251121 —
    // the value observed from kmc-kmn's reportMessage.
    expect(isOracleInapplicable("5251121")).toBe(true);
  });

  it("matches regardless of the severity bits (upstream re-tag safe)", () => {
    // Same namespace|base with Warn(0x400000) instead of Error(0x500000).
    expect(isOracleInapplicable(String(0x402031))).toBe(true);
  });

  it("matches the symbolic alias", () => {
    expect(isOracleInapplicable("ERROR_CannotReadBitmapFile")).toBe(true);
  });

  // The other sibling-asset stores are the same class of file-read false
  // positive (finding: BITMAP-only exemption was half-applied). Codes are
  // severity | namespace | base; namespace is KmnCompiler(0x2000) except the
  // touch-layout check which is KmwCompiler(0x7000).
  it.each([
    ["ERROR_FileNotFound (&VISUALKEYBOARD)", 0x50290c, "ERROR_FileNotFound"],
    ["ERROR_TouchLayoutFileDoesNotExist (&LAYOUTFILE)", 0x507004, "ERROR_TouchLayoutFileDoesNotExist"],
    ["WARN_EmbedJsFileMissing (&KMW_EMBEDJS)", 0x402095, "WARN_EmbedJsFileMissing"],
    ["WARN_HelpFileMissing (&KMW_HELPFILE)", 0x402094, "WARN_HelpFileMissing"],
    ["ERROR_CannotLoadIncludeFile (&INCLUDECODES)", 0x502038, "ERROR_CannotLoadIncludeFile"],
  ])("exempts %s by numeric wire code and symbolic alias", (_label, wire, symbol) => {
    expect(isOracleInapplicable(String(wire))).toBe(true);
    expect(isOracleInapplicable(symbol)).toBe(true);
  });

  it("does not exempt content diagnostics that require a successfully-read file", () => {
    // These fire only AFTER a file is read, so they carry real signal and must
    // stay in the oracle's output (contrast the pure existence checks above).
    expect(isOracleInapplicable(String(0x50290b))).toBe(false); // ERROR_InvalidKvkFile
    expect(isOracleInapplicable("ERROR_InvalidKvkFile")).toBe(false);
    expect(isOracleInapplicable(String(0x507003))).toBe(false); // ERROR_InvalidTouchLayoutFileFormat
  });

  it("does not match neighbouring codes or other symbols", () => {
    expect(isOracleInapplicable(String(0x502032))).toBe(false);
    expect(isOracleInapplicable("ERROR_InvalidIf")).toBe(false);
  });

  it("does not match non-numeric junk", () => {
    expect(isOracleInapplicable("UNKNOWN")).toBe(false);
    expect(isOracleInapplicable("")).toBe(false);
  });

  it("short-circuits blank/whitespace input (Number('  ') coerces to 0)", () => {
    expect(isOracleInapplicable("   ")).toBe(false);
    expect(isOracleInapplicable("\t")).toBe(false);
  });
});
