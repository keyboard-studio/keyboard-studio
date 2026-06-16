import { describe, it, expect } from "vitest";
import { formatVKeyModifiers, formatDkName, toUPlus } from "./utils.js";

describe("formatVKeyModifiers", () => {
  it("returns empty string when there are no modifiers", () => {
    expect(formatVKeyModifiers([])).toBe("");
  });

  it("returns a single modifier with a trailing space", () => {
    expect(formatVKeyModifiers(["SHIFT"])).toBe("SHIFT ");
  });

  it("joins multiple modifiers with single spaces and a trailing space", () => {
    expect(formatVKeyModifiers(["SHIFT", "RALT"])).toBe("SHIFT RALT ");
  });

  it("preserves modifier order", () => {
    expect(formatVKeyModifiers(["RALT", "SHIFT"])).toBe("RALT SHIFT ");
  });
});

describe("formatDkName", () => {
  it("zero-pads to four hex digits", () => {
    expect(formatDkName(0)).toBe("dk_0000");
  });

  it("formats 0x60 as uppercase hex (dk_0060)", () => {
    expect(formatDkName(0x60)).toBe("dk_0060");
  });

  it("uppercases hex digits above 9", () => {
    expect(formatDkName(0x00ab)).toBe("dk_00AB");
  });

  it("does not truncate ids wider than four hex digits", () => {
    expect(formatDkName(0x10000)).toBe("dk_10000");
  });
});

// toUPlus shares the same uppercase/zero-pad idiom as formatDkName; a smoke
// case here guards the helper module as a whole against regression.
describe("toUPlus", () => {
  it("formats a single BMP codepoint", () => {
    expect(toUPlus("a")).toBe("U+0061");
  });

  it("formats multiple codepoints space-separated", () => {
    expect(toUPlus("ab")).toBe("U+0061 U+0062");
  });
});
