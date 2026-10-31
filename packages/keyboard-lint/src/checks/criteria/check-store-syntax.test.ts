import { describe, it, expect } from "vitest";
import { checkStoreSyntax } from "./check-store-syntax.js";

const PATH = "source/demo.kmn";

describe("checkStoreSyntax (7.10)", () => {
  it("passes balanced store literals", () => {
    const kmn = [
      "store(&VERSION) '10.0'",
      "store(vowels) 'aeiou'",
      'store(marks) "abc"',
    ].join("\n");
    expect(checkStoreSyntax(kmn, PATH).findings).toEqual([]);
  });

  it("flags an unbalanced quote in a store line, naming the line", () => {
    const kmn = ["store(&VERSION) '10.0'", "store(vowels) 'aeiou"].join("\n");
    const { findings } = checkStoreSyntax(kmn, PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_STORE_SYNTAX_INVALID");
    expect(findings[0]!.message).toContain("Line 2");
  });

  it("treats a doubled delimiter as an escaped quote, not a close", () => {
    const kmn = "store(quote) 'it''s'";
    expect(checkStoreSyntax(kmn, PATH).findings).toEqual([]);
  });

  it("ignores apostrophes in a trailing comment", () => {
    const kmn = "store(vowels) 'aeiou' c the author's vowels";
    expect(checkStoreSyntax(kmn, PATH).findings).toEqual([]);
  });

  it("does not scan non-store lines (rules are the compiler's domain)", () => {
    const kmn = "+ [K_A] > 'a";
    expect(checkStoreSyntax(kmn, PATH).findings).toEqual([]);
  });

  it("flags a store declaration missing its closing paren", () => {
    const { findings } = checkStoreSyntax("store(vowels 'aeiou'", PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("closing");
  });
});
