import { describe, it, expect } from "vitest";
import { runLexicalChecks, runSemanticChecks, runAllChecks } from "./index.js";

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

describe("runSemanticChecks", () => {
  it("returns an empty array for clean source", () => {
    const source = [
      'store(MyStore) "hello"',
      "group(main) using keys",
      'if(MyStore = "hello") + "a" > "b"',
    ].join("\n");
    expect(runSemanticChecks(source)).toEqual([]);
  });

  it("returns findings from all 5 semantic checks", () => {
    const source = [
      "group(main) using keys",
      "dk(bad name)",                     // KM_ERROR_INVALID_DEADKEY_NAME
      'if(undeclaredStore = "on") + "a" > "b"', // KM_ERROR_UNRESOLVED_IF_STORE
      "+ U+D800 > U+0020",                // KM_ERROR_INVALID_CODEPOINT
      '[K_A] + "a" > "b"',               // KM_ERROR_VIRTUAL_KEY_IN_CONTEXT
      'index(ghostStore, 0)',             // KM_WARN_INDEX_STORE_UNDECLARED + KM_WARN_INDEX_OFFSET_INVALID
    ].join("\n");

    const findings = runSemanticChecks(source);
    const codes = findings.map((f) => f.code);

    expect(codes).toContain("KM_ERROR_INVALID_DEADKEY_NAME");
    expect(codes).toContain("KM_ERROR_UNRESOLVED_IF_STORE");
    expect(codes).toContain("KM_ERROR_INVALID_CODEPOINT");
    expect(codes).toContain("KM_ERROR_VIRTUAL_KEY_IN_CONTEXT");
    expect(codes).toContain("KM_WARN_INDEX_STORE_UNDECLARED");
  });

  it("returns a true flat array (no nested arrays)", () => {
    const source = "dk(bad name)";
    const findings = runSemanticChecks(source);
    expect(Array.isArray(findings)).toBe(true);
    findings.forEach((f) => expect(Array.isArray(f)).toBe(false));
  });
});

describe("runAllChecks", () => {
  it("returns an empty array for fully clean source", () => {
    const source = [
      'store(MyStore) "hello"',
      "group(main) using keys",
      '+ "a" > "b"',
    ].join("\n");
    expect(runAllChecks(source)).toEqual([]);
  });

  it("combines findings from both lexical and semantic checks", () => {
    const source = [
      'store(MyStore) "a"',
      'store(MyStore) "b"',     // KM_ERROR_DUPLICATE_STORE (lexical)
      "dk(bad name)",            // KM_ERROR_INVALID_DEADKEY_NAME (semantic)
    ].join("\n");

    const findings = runAllChecks(source);
    const codes = findings.map((f) => f.code);

    expect(codes).toContain("KM_ERROR_DUPLICATE_STORE");
    expect(codes).toContain("KM_ERROR_INVALID_DEADKEY_NAME");
  });

  it("returns a true flat array (no nested arrays)", () => {
    const source = 'store(MyStore) "a"\nstore(MyStore) "b"\ndk(bad name)';
    const findings = runAllChecks(source);
    expect(Array.isArray(findings)).toBe(true);
    findings.forEach((f) => expect(Array.isArray(f)).toBe(false));
  });

  it("result is the union of runLexicalChecks and runSemanticChecks", () => {
    const source = [
      'store(MyStore) "a"',
      'store(MyStore) "b"',
      "dk(bad name)",
    ].join("\n");

    const all = runAllChecks(source);
    const lexical = runLexicalChecks(source);
    const semantic = runSemanticChecks(source);

    expect(all).toHaveLength(lexical.length + semantic.length);
  });
});
