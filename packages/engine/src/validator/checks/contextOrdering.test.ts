import { describe, it, expect } from "vitest";
import { checkContextOrdering } from "./contextOrdering.js";

// lint.md check #11 — Compiler.cpp:1509-1520
// Context ordering rules:
//   1. nul must be first in context.
//   2. if()/platform()/baselayout() must come before other content tokens.
//   3. No virtual keys [K_X] in context.

describe("checkContextOrdering", () => {
  // Passing cases
  it("accepts a simple rule with no context ordering issues", () => {
    expect(checkContextOrdering('+ "a" > "b"')).toEqual([]);
  });

  it("accepts a rule where nul is the first (only) context token", () => {
    expect(checkContextOrdering('nul + "a" > "b"')).toEqual([]);
  });

  it("accepts a rule with an if() guard before content", () => {
    expect(checkContextOrdering('if(&platform = "hardware") + "a" > "b"')).toEqual([]);
  });

  it("accepts a rule where platform() guard precedes a content token", () => {
    expect(checkContextOrdering('if(&layer = "default") "x" + "a" > "b"')).toEqual([]);
  });

  it("accepts a rule starting with + (no LHS context)", () => {
    expect(checkContextOrdering('+ [K_A] > "a"')).toEqual([]);
  });

  it("accepts a line that is not a rule (no + separator)", () => {
    expect(checkContextOrdering('store(s) "hello"')).toEqual([]);
  });

  // Failing cases — Rule 3: virtual key in context
  it("rejects a virtual key [K_A] in the context", () => {
    const source = '[K_A] + "a" > "b"';
    const findings = checkContextOrdering(source);
    expect(findings.some((f) => f.code === "KM_ERROR_VIRTUAL_KEY_IN_CONTEXT")).toBe(true);
  });

  it("rejects [K_SHIFT K_A] in the context", () => {
    const source = '[K_SHIFT K_A] + "a" > "b"';
    const findings = checkContextOrdering(source);
    expect(findings.some((f) => f.code === "KM_ERROR_VIRTUAL_KEY_IN_CONTEXT")).toBe(true);
  });

  // Failing cases — Rule 1: nul not first
  it("rejects nul when it is not the first context token", () => {
    const source = 'dk(acute) nul + "a" > "b"';
    const findings = checkContextOrdering(source);
    expect(findings.some((f) => f.code === "KM_ERROR_NUL_NOT_FIRST")).toBe(true);
  });

  // Failing cases — Rule 2: guard after content
  it("rejects an if() guard that appears after a dk() content token", () => {
    const source = 'dk(acute) if(&platform = "hardware") + "a" > "b"';
    const findings = checkContextOrdering(source);
    expect(findings.some((f) => f.code === "KM_ERROR_GUARD_AFTER_CONTENT")).toBe(true);
  });

  it("rejects a platform() guard after a quoted string content token", () => {
    const source = '"x" if(&layer = "default") + "a" > "b"';
    const findings = checkContextOrdering(source);
    expect(findings.some((f) => f.code === "KM_ERROR_GUARD_AFTER_CONTENT")).toBe(true);
  });

  // Regression — P0-1: quoted store value containing ')' must not produce false positive
  it("does not produce GUARD_AFTER_CONTENT when store value contains nested parens", () => {
    // if(s = "a(b)") — the ')' inside the quoted string is NOT the guard's closing paren.
    // A naive [^)]* regex would leave a stray ')' in ctxStripped and flag a false positive.
    const source = 'store(s) "a(b)"\nif(s = "a(b)") + "x" > "y"';
    const findings = checkContextOrdering(source);
    expect(findings.filter((f) => f.code === "KM_ERROR_GUARD_AFTER_CONTENT")).toHaveLength(0);
  });

  // Regression — P3-1: nul inside a guard argument must NOT produce NUL_NOT_FIRST
  it("does not produce NUL_NOT_FIRST when nul appears inside a guard argument", () => {
    // nul here is the string literal "nul" inside the if() argument, not a context token.
    const source = 'if(s = "nul") + "x" > "y"';
    const findings = checkContextOrdering(source);
    expect(findings.filter((f) => f.code === "KM_ERROR_NUL_NOT_FIRST")).toHaveLength(0);
  });

  // Location accuracy
  it("reports the correct line number for a virtual key error", () => {
    const source = '+ "a" > "b"\n[K_A] + "c" > "d"';
    const findings = checkContextOrdering(source);
    const vk = findings.find((f) => f.code === "KM_ERROR_VIRTUAL_KEY_IN_CONTEXT");
    expect(vk?.location?.line).toBe(2);
  });

  it("reports a column greater than 0 for virtual key error", () => {
    const source = '[K_A] + "a" > "b"';
    const findings = checkContextOrdering(source);
    expect(findings[0]?.location?.column).toBeGreaterThan(0);
  });
});
