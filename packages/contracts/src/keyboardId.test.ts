import { describe, it, expect } from "vitest";
import { slugifyKeyboardId, validateKeyboardId } from "./keyboardId.js";

describe("slugifyKeyboardId", () => {
  it("simple lowercase word", () => {
    expect(slugifyKeyboardId("Ewondo")).toBe("ewondo");
  });

  it("strips combining marks and trailing underscore", () => {
    // Fe'fe' — apostrophe becomes _, then trailing _ is stripped
    expect(slugifyKeyboardId("Fe'fe'")).toBe("fe_fe");
  });

  it("strips combining marks from accented characters", () => {
    // Ghomálá' — á (NFD: a + combining acute) -> a, apostrophe -> _, trailing _ stripped
    expect(slugifyKeyboardId("Ghomálá'")).toBe("ghomala");
  });

  it("replaces spaces with underscores and collapses runs", () => {
    expect(slugifyKeyboardId("Cameroon QWERTY")).toBe("cameroon_qwerty");
  });

  it("empty string returns empty string", () => {
    expect(slugifyKeyboardId("")).toBe("");
  });

  it("strips leading digits", () => {
    expect(slugifyKeyboardId("123abc")).toBe("abc");
  });

  it("strips leading and trailing underscores", () => {
    expect(slugifyKeyboardId("___foo___")).toBe("foo");
  });

  it("truncates to 40 characters", () => {
    const long = "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz"; // 52 chars
    const result = slugifyKeyboardId(long);
    expect(result.length).toBe(40);
    expect(result).toBe("abcdefghijklmnopqrstuvwxyzabcdefghijklmn");
  });

  it("returns empty string when all characters are stripped", () => {
    expect(slugifyKeyboardId("123")).toBe("");
    expect(slugifyKeyboardId("___")).toBe("");
  });
});

describe("validateKeyboardId", () => {
  it("valid simple id", () => {
    expect(validateKeyboardId("ewondo").valid).toBe(true);
  });

  it("valid id with digits and underscores", () => {
    expect(validateKeyboardId("my_layout_123").valid).toBe(true);
  });

  it("rejects empty string", () => {
    const result = validateKeyboardId("");
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("rejects id starting with digit", () => {
    const result = validateKeyboardId("123abc");
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("rejects id with space", () => {
    const result = validateKeyboardId("foo bar");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/invalid characters/);
  });

  it("accepts id containing 'keyboard' as substring (convention only, not enforced)", () => {
    // docs/criteria.md cites avoiding 'keyboard' as a naming convention, not a hard rule.
    // KD's isValidKeymanKeyboardId does not ban it either.
    const result = validateKeyboardId("my_keyboard");
    expect(result.valid).toBe(true);
  });

  it("accepts id starting with underscore (aligned with KD isValidKeymanKeyboardId)", () => {
    const result = validateKeyboardId("_foo");
    expect(result.valid).toBe(true);
  });

  it("rejects id over 254 characters", () => {
    const result = validateKeyboardId("a".repeat(255));
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("accepts id of exactly 254 characters (max)", () => {
    // Pattern is /^[a-z_][a-z0-9_]{0,253}$/ — max total length is 1 + 253 = 254
    const result = validateKeyboardId("a" + "b".repeat(253));
    expect(result.valid).toBe(true);
  });

});
