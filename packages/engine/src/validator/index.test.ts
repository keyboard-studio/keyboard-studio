import { describe, it, expect } from "vitest";
import { runLexicalChecks } from "./index.js";

describe("runLexicalChecks", () => {
  it("returns an empty array for clean source", () => {
    const source = [
      'store(MyStore) "hello"',
      "group(main) using keys",
      '+ "a" > "b"',
    ].join("\n");
    expect(runLexicalChecks(source)).toEqual([]);
  });

  it("returns a flat array combining findings from all checks", () => {
    const source = [
      'store(MyStore) "hello"',
      'store(MyStore) "world"',     // KM_ERROR_DUPLICATE_STORE
      "group(main) using keys",
      "group(main)",                 // KM_ERROR_DUPLICATE_GROUP
      "store(&LANGUAGE) using keys", // KM_ERROR_DEPRECATED_STORE
      "group(bad name)",             // KM_ERROR_INVALID_IDENTIFIER
    ].join("\n");

    const findings = runLexicalChecks(source);
    const codes = findings.map((f) => f.code);

    expect(codes).toContain("KM_ERROR_DUPLICATE_STORE");
    expect(codes).toContain("KM_ERROR_DUPLICATE_GROUP");
    expect(codes).toContain("KM_ERROR_DEPRECATED_STORE");
    expect(codes).toContain("KM_ERROR_INVALID_IDENTIFIER");
  });

  it("returns a true flat array (no nested arrays)", () => {
    const source = 'store(MyStore) "a"\nstore(MyStore) "b"';
    const findings = runLexicalChecks(source);
    expect(Array.isArray(findings)).toBe(true);
    findings.forEach((f) => expect(Array.isArray(f)).toBe(false));
  });
});
