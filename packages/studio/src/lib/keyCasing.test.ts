// Unit tests for the shared keycap single-letter lowercase rule — the ONE
// definition of "a bare single-letter key label is the unshifted glyph, so it
// reads lowercase" that both keyLabel.ts and irToCarveNodes.ts import.

import { describe, it, expect } from "vitest";
import { lowerBareLetter } from "./keyCasing.ts";

describe("lowerBareLetter", () => {
  it("lowercases a bare single uppercase letter (Q -> q)", () => {
    expect(lowerBareLetter("Q")).toBe("q");
  });

  it("leaves a single digit unchanged (5 -> 5)", () => {
    expect(lowerBareLetter("5")).toBe("5");
  });

  it("leaves a single symbol unchanged ([ -> [)", () => {
    expect(lowerBareLetter("[")).toBe("[");
  });

  it("leaves a multi-character named label unchanged (Backspace)", () => {
    expect(lowerBareLetter("Backspace")).toBe("Backspace");
  });

  it("leaves an already-lowercase letter unchanged (q -> q)", () => {
    expect(lowerBareLetter("q")).toBe("q");
  });
});
