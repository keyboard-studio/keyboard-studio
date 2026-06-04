import { describe, it, expect } from "vitest";
import {
  CODE_MAP,
  translatePassthrough,
  translateWasmFinding,
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
