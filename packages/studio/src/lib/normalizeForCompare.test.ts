import { describe, it, expect } from "vitest";
import { normalizeForCompare } from "./normalizeForCompare.ts";

describe("normalizeForCompare", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeForCompare("  Hausa  ")).toBe("hausa");
  });

  it("normalizes NFD to NFC so combining-mark variants compare equal", () => {
    // "a" + combining acute (U+0061 U+0301) vs precomposed "á".
    const precomposed = "Café";
    const decomposed = "Café";
    expect(precomposed).not.toBe(decomposed); // sanity: distinct code-unit sequences
    expect(normalizeForCompare(precomposed)).toBe(normalizeForCompare(decomposed));
  });

  it("lowercases the result", () => {
    expect(normalizeForCompare("FRANCAIS")).toBe("francais");
  });

  it("composes trim, NFC-normalize, and lowercase together", () => {
    const decomposed = "  CAFÉ  ";
    expect(normalizeForCompare(decomposed)).toBe("café");
  });
});
