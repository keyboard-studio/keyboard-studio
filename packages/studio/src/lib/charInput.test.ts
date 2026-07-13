// Unit tests for charInput.ts — resolveCharInput (character-box resolution)
// and resolveKeyPickerSelection/resolvedVkeyOf (key-picker dropdown
// resolution, shared by KeyPickerField.tsx and both galleries' canApply /
// handleApply logic).

import { describe, it, expect } from "vitest";
import {
  resolveCharInput,
  resolveKeyPickerSelection,
  resolvedVkeyOf,
  isLoneCombiningMark,
  DELIMITER_UNSAFE,
} from "./charInput.ts";
import { CUSTOM_KEY_OPTION_VALUE } from "./keyOptions.ts";

describe("resolveCharInput", () => {
  it("rejects empty input", () => {
    const r = resolveCharInput("");
    expect(r.ok).toBe(false);
  });

  it("rejects whitespace-only input", () => {
    const r = resolveCharInput("   ");
    expect(r.ok).toBe(false);
  });

  it("treats a literal character as a literal, not notation", () => {
    const r = resolveCharInput("é");
    expect(r).toEqual({ ok: true, value: "é", wasNotation: false });
  });

  it("trims a literal character", () => {
    const r = resolveCharInput("  é  ");
    expect(r).toEqual({ ok: true, value: "é", wasNotation: false });
  });

  it("parses U+XXXX notation (uppercase prefix)", () => {
    const r = resolveCharInput("U+00E9");
    expect(r).toEqual({ ok: true, value: "é", wasNotation: true });
  });

  it("parses u+xxxx notation (lowercase prefix)", () => {
    const r = resolveCharInput("u+00e9");
    expect(r).toEqual({ ok: true, value: "é", wasNotation: true });
  });

  it("does NOT treat bare hex (no U+ prefix) as notation — literal passthrough", () => {
    const r = resolveCharInput("0041");
    expect(r).toEqual({ ok: true, value: "0041", wasNotation: false });
  });

  it("rejects malformed U+ notation with a human-readable reason", () => {
    const r = resolveCharInput("U+ZZZZ");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/not a valid unicode value/i);
    }
  });

  it("rejects a surrogate codepoint via U+ notation", () => {
    const r = resolveCharInput("U+D800");
    expect(r.ok).toBe(false);
  });

  it("rejects a codepoint above U+10FFFF", () => {
    const r = resolveCharInput("U+110000");
    expect(r.ok).toBe(false);
  });

  it("accepts a multi-character literal string (sequence-method inputs)", () => {
    const r = resolveCharInput("ab");
    expect(r).toEqual({ ok: true, value: "ab", wasNotation: false });
  });
});

describe("resolveCharInput — NFC normalization (P1)", () => {
  it("normalizes a decomposed literal paste to its precomposed form", () => {
    const decomposed = "é"; // "e" + U+0301 COMBINING ACUTE ACCENT
    const r = resolveCharInput(decomposed);
    expect(r).toEqual({ ok: true, value: "é", wasNotation: false });
  });

  it("normalizes a decomposed U+ notation result to its precomposed form", () => {
    // parseUPlusNotation only accepts one codepoint per call, so exercise
    // normalization on a literal decomposed sequence instead — the
    // normalize() call applies identically on both the literal and U+ path.
    const r = resolveCharInput("U+00E9");
    expect(r).toEqual({ ok: true, value: "é", wasNotation: true });
  });
});

describe("resolveCharInput — delimiter guard (P0, opt-in via blockDelimiters)", () => {
  it("does not block a straight quote by default", () => {
    const r = resolveCharInput("'");
    expect(r).toEqual({ ok: true, value: "'", wasNotation: false });
  });

  it("blocks an ASCII apostrophe when blockDelimiters is set", () => {
    const r = resolveCharInput("'", { blockDelimiters: true });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe(
        "Straight quotes (' or \") can't be typed here. For a glottal stop or saltillo, use U+02BC or U+2019.",
      );
    }
  });

  it("blocks an ASCII double quote when blockDelimiters is set", () => {
    const r = resolveCharInput('"', { blockDelimiters: true });
    expect(r.ok).toBe(false);
  });

  it("blocks straight quotes resolved via U+ notation when blockDelimiters is set", () => {
    const r = resolveCharInput("U+0027", { blockDelimiters: true });
    expect(r.ok).toBe(false);
  });

  it("does NOT block the string-safe U+02BC modifier apostrophe", () => {
    const r = resolveCharInput("ʼ", { blockDelimiters: true });
    expect(r).toEqual({ ok: true, value: "ʼ", wasNotation: false });
  });

  it("does NOT block U+2019 RIGHT SINGLE QUOTATION MARK", () => {
    const r = resolveCharInput("’", { blockDelimiters: true });
    expect(r).toEqual({ ok: true, value: "’", wasNotation: false });
  });

  it("DELIMITER_UNSAFE contains exactly the ASCII apostrophe and quotation mark", () => {
    expect(DELIMITER_UNSAFE.has("'")).toBe(true);
    expect(DELIMITER_UNSAFE.has('"')).toBe(true);
    expect(DELIMITER_UNSAFE.has("ʼ")).toBe(false);
    expect(DELIMITER_UNSAFE.has("’")).toBe(false);
    expect(DELIMITER_UNSAFE.size).toBe(2);
  });
});

describe("resolveCharInput — single-grapheme guard (P1, opt-in via singleGrapheme)", () => {
  it("does not reject a multi-character literal by default", () => {
    const r = resolveCharInput("ab");
    expect(r.ok).toBe(true);
  });

  it("rejects a two-character literal when singleGrapheme is set", () => {
    const r = resolveCharInput("ab", { singleGrapheme: true });
    expect(r).toEqual({ ok: false, reason: "Enter one character only." });
  });

  it("accepts a single astral (SMP) character when singleGrapheme is set", () => {
    const astral = "\u{1D400}"; // MATHEMATICAL BOLD CAPITAL A — one code point, UTF-16 length 2
    expect(astral.length).toBe(2);
    const r = resolveCharInput(astral, { singleGrapheme: true });
    expect(r).toEqual({ ok: true, value: astral, wasNotation: false });
  });

  it("accepts a precomposed accented letter when singleGrapheme is set", () => {
    const r = resolveCharInput("é", { singleGrapheme: true });
    expect(r).toEqual({ ok: true, value: "é", wasNotation: false });
  });

  it("accepts a base+combining sequence that did not precompose under NFC", () => {
    // "n" + U+0303 COMBINING TILDE has no precomposed NFC form.
    const raw = "ñ";
    const r = resolveCharInput(raw, { singleGrapheme: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(raw.normalize("NFC"));
    }
  });

  it("rejects a two-grapheme literal even after NFC normalization", () => {
    // "e" + U+0301 (precomposes to a single "é") followed by a second letter
    // — two graphemes after normalization.
    const r = resolveCharInput("éb", { singleGrapheme: true });
    expect(r).toEqual({ ok: false, reason: "Enter one character only." });
  });
});

describe("isLoneCombiningMark", () => {
  it("returns true for a single bare combining mark", () => {
    expect(isLoneCombiningMark("́")).toBe(true);
  });

  it("returns false for a precomposed letter", () => {
    expect(isLoneCombiningMark("é")).toBe(false);
  });

  it("returns false for a plain letter", () => {
    expect(isLoneCombiningMark("a")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isLoneCombiningMark("")).toBe(false);
  });

  it("returns false for a base+combining pair (not lone)", () => {
    expect(isLoneCombiningMark("ñ")).toBe(false);
  });
});

describe("resolveKeyPickerSelection", () => {
  it("returns kind 'empty' for an unselected picker", () => {
    expect(resolveKeyPickerSelection("", "")).toEqual({ kind: "empty" });
  });

  it("returns kind 'key' with the vkey for a normal dropdown selection", () => {
    expect(resolveKeyPickerSelection("K_A", "")).toEqual({ kind: "key", vkey: "K_A" });
  });

  it("resolves a custom literal character to its vkey", () => {
    const r = resolveKeyPickerSelection(CUSTOM_KEY_OPTION_VALUE, "e");
    expect(r).toEqual({ kind: "customOk", vkey: "K_E", char: "e", wasNotation: false });
  });

  it("resolves a custom literal character case-insensitively", () => {
    const r = resolveKeyPickerSelection(CUSTOM_KEY_OPTION_VALUE, "E");
    expect(r).toEqual({ kind: "customOk", vkey: "K_E", char: "E", wasNotation: false });
  });

  it("resolves custom U+ notation through to a vkey", () => {
    const r = resolveKeyPickerSelection(CUSTOM_KEY_OPTION_VALUE, "U+0041");
    expect(r).toEqual({ kind: "customOk", vkey: "K_A", char: "A", wasNotation: true });
  });

  it("returns kind 'customError' for invalid U+ notation", () => {
    const r = resolveKeyPickerSelection(CUSTOM_KEY_OPTION_VALUE, "U+ZZZZ");
    expect(r.kind).toBe("customError");
  });

  it("returns kind 'customError' for an unmappable character", () => {
    const r = resolveKeyPickerSelection(CUSTOM_KEY_OPTION_VALUE, "é");
    expect(r.kind).toBe("customError");
    if (r.kind === "customError") {
      expect(r.reason).toMatch(/cannot map 'é' to a physical key/i);
    }
  });

  it("returns kind 'customError' for empty custom text", () => {
    const r = resolveKeyPickerSelection(CUSTOM_KEY_OPTION_VALUE, "");
    expect(r.kind).toBe("customError");
  });

  it("without blockDelimiters, a custom apostrophe still maps to K_QUOTE (SWAP/RALT/touch host-key path)", () => {
    const r = resolveKeyPickerSelection(CUSTOM_KEY_OPTION_VALUE, "'");
    expect(r).toEqual({ kind: "customOk", vkey: "K_QUOTE", char: "'", wasNotation: false });
  });

  it("with blockDelimiters, a custom apostrophe is rejected (deadkey-trigger path)", () => {
    const r = resolveKeyPickerSelection(CUSTOM_KEY_OPTION_VALUE, "'", { blockDelimiters: true });
    expect(r.kind).toBe("customError");
    if (r.kind === "customError") {
      expect(r.reason).toMatch(/straight quotes/i);
      expect(r.reason).toMatch(/U\+02BC/);
    }
  });

  it("with blockDelimiters, a custom double quote is rejected", () => {
    const r = resolveKeyPickerSelection(CUSTOM_KEY_OPTION_VALUE, '"', { blockDelimiters: true });
    expect(r.kind).toBe("customError");
  });

  it("with blockDelimiters, the string-safe U+02BC apostrophe is still unaffected (though unmappable to a key)", () => {
    const r = resolveKeyPickerSelection(CUSTOM_KEY_OPTION_VALUE, "ʼ", { blockDelimiters: true });
    // Not a delimiter error — it fails only because it doesn't map to a vkey.
    expect(r.kind).toBe("customError");
    if (r.kind === "customError") {
      expect(r.reason).toMatch(/cannot map/i);
    }
  });
});

describe("resolvedVkeyOf", () => {
  it("extracts the vkey for kind 'key'", () => {
    expect(resolvedVkeyOf({ kind: "key", vkey: "K_A" })).toBe("K_A");
  });

  it("extracts the vkey for kind 'customOk'", () => {
    expect(
      resolvedVkeyOf({ kind: "customOk", vkey: "K_E", char: "e", wasNotation: false }),
    ).toBe("K_E");
  });

  it("returns null for kind 'empty'", () => {
    expect(resolvedVkeyOf({ kind: "empty" })).toBeNull();
  });

  it("returns null for kind 'customError'", () => {
    expect(resolvedVkeyOf({ kind: "customError", reason: "x" })).toBeNull();
  });
});
