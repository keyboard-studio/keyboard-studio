import { describe, it, expect } from "vitest";
import { checkDeadkeyResolution } from "./deadkeyResolution.js";

// lint.md check #7 — Compiler.cpp:2188-2205
// Deadkey identifiers must pass identifier validation rules.
// Auto-registration on first use is valid; this check only catches bad names.

describe("checkDeadkeyResolution", () => {
  // Passing cases
  it("accepts a valid dk() identifier", () => {
    expect(checkDeadkeyResolution("dk(003b)")).toEqual([]);
  });

  it("accepts a valid deadkey() identifier", () => {
    expect(checkDeadkeyResolution('deadkey(myKey) > "a"')).toEqual([]);
  });

  it("accepts a dk() on the output side (same name re-used)", () => {
    const source = 'dk(acute) dk(acute) > "á"';
    expect(checkDeadkeyResolution(source)).toEqual([]);
  });

  it("accepts dk() with a numeric-looking name (hex style from kmdecomp)", () => {
    expect(checkDeadkeyResolution("dk(0041)")).toEqual([]);
  });

  it("accepts multiple different valid deadkeys on one line", () => {
    const source = "dk(a) dk(b) > dk(c)";
    expect(checkDeadkeyResolution(source)).toEqual([]);
  });

  // Failing cases
  it("rejects a dk() with an empty identifier", () => {
    const findings = checkDeadkeyResolution("dk()");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_INVALID_DEADKEY_NAME");
  });

  it("rejects a dk() identifier containing a space", () => {
    const findings = checkDeadkeyResolution("dk(bad name)");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_INVALID_DEADKEY_NAME");
  });

  it("rejects a dk() identifier containing a comma", () => {
    const findings = checkDeadkeyResolution("dk(a,b)");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_INVALID_DEADKEY_NAME");
  });

  it("rejects a dk() identifier that is too long (>255 chars)", () => {
    const longName = "x".repeat(256);
    const findings = checkDeadkeyResolution(`dk(${longName})`);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_INVALID_DEADKEY_NAME");
  });

  it("reports the correct line number", () => {
    const source = 'dk(ok)\ndk(bad name)';
    const findings = checkDeadkeyResolution(source);
    expect(findings[0]?.location?.line).toBe(2);
  });

  it("reports the correct column number", () => {
    const source = "  dk(bad name)";
    const findings = checkDeadkeyResolution(source);
    expect(findings[0]?.location?.column).toBe(3);
  });

  it("reports multiple errors when multiple bad dk() appear on one line", () => {
    const source = "dk() dk(bad name)";
    const findings = checkDeadkeyResolution(source);
    expect(findings).toHaveLength(2);
  });
});
