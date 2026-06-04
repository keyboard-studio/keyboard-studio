import { describe, it, expect } from "vitest";
import { checkCodepointFormat } from "./codepointFormat.js";

// lint.md check #10 — Compiler.cpp:3746-3770
// U+XXXX literals must be in range 0..0x10FFFF, excluding surrogates
// (0xD800–0xDFFF), non-chars (0xFDD0–0xFDEF), 0xFFFE and 0xFFFF.

describe("checkCodepointFormat", () => {
  // Passing cases
  it("accepts a typical ASCII codepoint", () => {
    expect(checkCodepointFormat("+ U+0041 > U+0061")).toEqual([]);
  });

  it("accepts codepoint U+003B (the semicolon from the lint.md example)", () => {
    expect(checkCodepointFormat("platform('hardware') dk(003b) dk(003b) > U+003b")).toEqual([]);
  });

  it("accepts the maximum valid codepoint U+10FFFF", () => {
    expect(checkCodepointFormat("+ U+10FFFF > U+0020")).toEqual([]);
  });

  it("accepts U+0000 (null codepoint)", () => {
    expect(checkCodepointFormat("+ U+0000 > U+0020")).toEqual([]);
  });

  it("accepts boundary codepoints just outside surrogate range", () => {
    const source = "+ U+D7FF > U+E000";
    expect(checkCodepointFormat(source)).toEqual([]);
  });

  it("accepts boundary codepoints just outside non-character range", () => {
    const source = "+ U+FDCF > U+FDF0";
    expect(checkCodepointFormat(source)).toEqual([]);
  });

  it("returns empty array when source contains no U+ literals", () => {
    expect(checkCodepointFormat('store(s) "hello"')).toEqual([]);
  });

  // Failing cases — surrogates
  it("rejects a high surrogate U+D800", () => {
    const findings = checkCodepointFormat("+ U+D800 > U+0020");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_INVALID_CODEPOINT");
  });

  it("rejects a low surrogate U+DFFF", () => {
    const findings = checkCodepointFormat("+ U+DFFF > U+0020");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_INVALID_CODEPOINT");
  });

  it("rejects a mid-surrogate U+DC00", () => {
    const findings = checkCodepointFormat("+ U+DC00 > U+0020");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_INVALID_CODEPOINT");
  });

  // Failing cases — non-characters
  it("rejects U+FDD0 (first non-character)", () => {
    const findings = checkCodepointFormat("+ U+FDD0 > U+0020");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_INVALID_CODEPOINT");
  });

  it("rejects U+FDEF (last FDD0–FDEF non-character)", () => {
    const findings = checkCodepointFormat("+ U+FDEF > U+0020");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_INVALID_CODEPOINT");
  });

  it("rejects U+FFFE", () => {
    const findings = checkCodepointFormat("+ U+FFFE > U+0020");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_INVALID_CODEPOINT");
  });

  it("rejects U+FFFF", () => {
    const findings = checkCodepointFormat("+ U+FFFF > U+0020");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_INVALID_CODEPOINT");
  });

  it("rejects a codepoint above U+10FFFF", () => {
    const findings = checkCodepointFormat("+ U+110000 > U+0020");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_INVALID_CODEPOINT");
  });

  // Location accuracy
  it("reports the correct line number", () => {
    const source = "+ U+0041 > U+0061\n+ U+D800 > U+0020";
    const findings = checkCodepointFormat(source);
    expect(findings[0]?.location?.line).toBe(2);
  });

  it("reports the correct column number", () => {
    const source = "  + U+D800 > U+0020";
    const findings = checkCodepointFormat(source);
    expect(findings[0]?.location?.column).toBe(5);
  });

  it("reports multiple errors on a single line", () => {
    const source = "+ U+D800 > U+FFFF";
    const findings = checkCodepointFormat(source);
    expect(findings).toHaveLength(2);
  });

  it("includes the codepoint value in the message", () => {
    const findings = checkCodepointFormat("+ U+D800 > U+0020");
    expect(findings[0]?.message).toContain("D800");
  });
});
