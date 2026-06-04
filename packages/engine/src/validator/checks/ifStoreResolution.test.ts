import { describe, it, expect } from "vitest";
import { checkIfStoreResolution } from "./ifStoreResolution.js";

// lint.md check #9 — Compiler.cpp:2833-2906
// Store referenced in if() must be declared in the source.
// Unresolved user-store reference = error; recognised system stores are always valid.

describe("checkIfStoreResolution", () => {
  // Passing cases
  it("accepts an if() referencing a declared store", () => {
    const source = 'store(myMode) "on"\nif(myMode = "on") + "a" > "b"';
    expect(checkIfStoreResolution(source)).toEqual([]);
  });

  it("accepts an if() referencing &platform (system store)", () => {
    const source = 'if(&platform = "hardware") + "a" > "b"';
    expect(checkIfStoreResolution(source)).toEqual([]);
  });

  it("accepts an if() referencing &layer", () => {
    const source = 'if(&layer = "default") + "a" > "b"';
    expect(checkIfStoreResolution(source)).toEqual([]);
  });

  it("accepts an if() referencing &baselayout", () => {
    const source = 'if(&baselayout = "us") + "a" > "b"';
    expect(checkIfStoreResolution(source)).toEqual([]);
  });

  it("accepts when there are no if() conditions at all", () => {
    const source = 'store(s) "x"\n+ "a" > "b"';
    expect(checkIfStoreResolution(source)).toEqual([]);
  });

  it("accepts case-insensitive store name match", () => {
    const source = 'store(MyMode) "on"\nif(mymode = "on") + "a" > "b"';
    expect(checkIfStoreResolution(source)).toEqual([]);
  });

  // Failing cases
  it("rejects an if() referencing an undeclared store", () => {
    const source = 'if(undeclaredStore = "on") + "a" > "b"';
    const findings = checkIfStoreResolution(source);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_UNRESOLVED_IF_STORE");
  });

  it("rejects an if() referencing an unknown system store", () => {
    const source = 'if(&unknownsys = "x") + "a" > "b"';
    const findings = checkIfStoreResolution(source);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_UNRESOLVED_IF_STORE");
  });

  it("reports the correct line number for the unresolved reference", () => {
    const source = 'store(ok) "x"\nif(missing = "on") + "a" > "b"';
    const findings = checkIfStoreResolution(source);
    expect(findings[0]?.location?.line).toBe(2);
  });

  it("reports the correct column for the if() token", () => {
    const source = '  if(missing = "on") + "a" > "b"';
    const findings = checkIfStoreResolution(source);
    expect(findings[0]?.location?.column).toBe(3);
  });

  it("reports multiple errors for multiple unresolved stores", () => {
    const source = [
      'if(missingA = "on") + "a" > "b"',
      'if(missingB = "off") + "c" > "d"',
    ].join("\n");
    const findings = checkIfStoreResolution(source);
    expect(findings).toHaveLength(2);
  });

  it("includes the store name in the message", () => {
    const source = 'if(ghostStore = "on") + "a" > "b"';
    const findings = checkIfStoreResolution(source);
    expect(findings[0]?.message).toContain("ghostStore");
  });
});
