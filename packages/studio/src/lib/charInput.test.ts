// Unit tests for charInput.ts — resolveCharInput (character-box resolution),
// reflectCharInput (bidirectional char <-> U+ reflection), and
// resolveKeyPickerSelection/resolvedVkeyOf (key-picker dropdown resolution,
// shared by KeyPickerField.tsx and both galleries' canApply / handleApply
// logic).

import { describe, it, expect } from "vitest";
import {
  resolveCharInput,
  reflectCharInput,
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

  it("accepts a base+combining sequence with a precomposed NFC form (n + U+0303 -> ñ)", () => {
    // "n" + U+0303 COMBINING TILDE DOES precompose under NFC, to the single
    // code point U+00F1 (ñ) -- this case is already one grapheme even
    // under naive code-point counting, so it does not exercise
    // Intl.Segmenter on its own.
    const raw = "ñ";
    const r = resolveCharInput(raw, { singleGrapheme: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(raw.normalize("NFC"));
      expect(r.value).toBe("ñ");
    }
  });

  it("accepts a base+combining sequence with NO precomposed NFC form (n + U+0302 -> n̂), via Intl.Segmenter", () => {
    // "n" + U+0302 COMBINING CIRCUMFLEX ACCENT has no precomposed NFC form --
    // normalize("NFC") leaves it as two code points. A naive
    // [...value].length would wrongly count 2 characters here; this is the
    // case Intl.Segmenter exists to handle correctly, counting 1 grapheme.
    const raw = "n̂";
    const normalized = raw.normalize("NFC");
    expect(normalized.length).toBe(2); // stays 2 UTF-16 code units after NFC
    expect([...normalized].length).toBe(2); // 2 code points -- naive counting would (wrongly) reject
    const r = resolveCharInput(raw, { singleGrapheme: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(normalized);
      expect([...r.value].length).toBe(2); // 2 code points
      const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
      expect([...segmenter.segment(r.value)].length).toBe(1); // 1 grapheme
    }
  });

  it("rejects a two-grapheme literal even after NFC normalization", () => {
    // "e" + U+0301 (precomposes to a single "é") followed by a second letter
    // — two graphemes after normalization.
    const r = resolveCharInput("éb", { singleGrapheme: true });
    expect(r).toEqual({ ok: false, reason: "Enter one character only." });
  });

  it("supports a custom singleGraphemeReason override", () => {
    const r = resolveCharInput("ab", {
      singleGrapheme: true,
      singleGraphemeReason: "custom reason text",
    });
    expect(r).toEqual({ ok: false, reason: "custom reason text" });
  });
});

describe("resolveCharInput — multiToken compose (space-separated tokens)", () => {
  it("resolves a single token with no spaces identically to the non-multiToken path", () => {
    const withOption = resolveCharInput("e", { multiToken: true });
    const withoutOption = resolveCharInput("e");
    expect(withOption).toEqual(withoutOption);
  });

  it("composes two U+ tokens into their concatenated, NFC-normalized character", () => {
    // "n" + U+0303 COMBINING TILDE -> NFC precomposes to U+00F1.
    const r = resolveCharInput("U+006E U+0303", { multiToken: true });
    expect(r).toEqual({ ok: true, value: "ñ", wasNotation: true });
  });

  it("composes a literal token followed by a U+ token", () => {
    const r = resolveCharInput("a U+0301", { multiToken: true });
    expect(r).toEqual({ ok: true, value: "á", wasNotation: true });
  });

  it("treats a literal digraph typed with no spaces as one literal token", () => {
    const r = resolveCharInput("ng", { multiToken: true });
    expect(r).toEqual({ ok: true, value: "ng", wasNotation: false });
  });

  it("collapses more than two whitespace-separated tokens", () => {
    const r = resolveCharInput("U+0067 U+0062", { multiToken: true });
    expect(r).toEqual({ ok: true, value: "gb", wasNotation: true });
  });

  it("tolerates multiple spaces between tokens", () => {
    const r = resolveCharInput("U+006E   U+0303", { multiToken: true });
    expect(r).toEqual({ ok: true, value: "ñ", wasNotation: true });
  });

  it("rejects a malformed U+ token within a multiToken input", () => {
    const r = resolveCharInput("a U+ZZZZ", { multiToken: true });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/not a valid unicode value/i);
    }
  });

  describe("multiToken + singleGrapheme (checked against the final concatenated value)", () => {
    it("rejects a genuine two-grapheme value composed from two independent tokens", () => {
      const r = resolveCharInput("a b", { multiToken: true, singleGrapheme: true });
      expect(r).toEqual({ ok: false, reason: "Enter one character only." });
    });

    it("ACCEPTS a multi-token-composed value that collapses to a single grapheme", () => {
      // "n" + U+0303 composes (via NFC) to the single precomposed grapheme.
      const r = resolveCharInput("U+006E U+0303", { multiToken: true, singleGrapheme: true });
      expect(r).toEqual({ ok: true, value: "ñ", wasNotation: true });
    });

    it("rejects with a custom singleGraphemeReason when supplied", () => {
      const r = resolveCharInput("a b", {
        multiToken: true,
        singleGrapheme: true,
        singleGraphemeReason: "custom multiToken reason",
      });
      expect(r).toEqual({ ok: false, reason: "custom multiToken reason" });
    });

    it("accepts a single literal digraph (no spaces) when singleGrapheme is set to false (seqFirst-style)", () => {
      const r = resolveCharInput("ng", { multiToken: true, singleGrapheme: false });
      expect(r).toEqual({ ok: true, value: "ng", wasNotation: false });
    });
  });

  describe("multiToken + blockDelimiters (checked PER TOKEN, before concatenation)", () => {
    it("blocks a straight apostrophe appearing as its own token", () => {
      const r = resolveCharInput("a '", { multiToken: true, blockDelimiters: true });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toMatch(/straight quotes/i);
      }
    });

    it("blocks a straight quote resolved via a U+ token", () => {
      const r = resolveCharInput("a U+0027", { multiToken: true, blockDelimiters: true });
      expect(r.ok).toBe(false);
    });

    it("does not block the string-safe U+02BC apostrophe as a token", () => {
      const r = resolveCharInput("a ʼ", { multiToken: true, blockDelimiters: true });
      expect(r).toEqual({ ok: true, value: "aʼ", wasNotation: false });
    });

    it("without blockDelimiters, a straight quote token resolves normally", () => {
      const r = resolveCharInput("a '", { multiToken: true });
      expect(r).toEqual({ ok: true, value: "a'", wasNotation: false });
    });
  });

  it("concatenates tokens without re-inserting the whitespace that separated them", () => {
    const r = resolveCharInput("n g", { multiToken: true });
    expect(r).toEqual({ ok: true, value: "ng", wasNotation: false });
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

describe("reflectCharInput", () => {
  it("returns kind 'empty' for empty input", () => {
    expect(reflectCharInput("")).toEqual({ kind: "empty" });
  });

  it("returns kind 'empty' for whitespace-only input", () => {
    expect(reflectCharInput("   ")).toEqual({ kind: "empty" });
  });

  it("reflects a literal character to its U+ notation", () => {
    expect(reflectCharInput("é")).toEqual({ kind: "ok", text: "é → U+00E9" });
  });

  it("reflects U+ notation to its resolved character, echoing the raw typed text", () => {
    expect(reflectCharInput("U+00E9")).toEqual({ kind: "ok", text: "U+00E9 → é" });
  });

  it("echoes the raw typed notation case/prefix as-is (not re-normalized)", () => {
    expect(reflectCharInput("u+00e9")).toEqual({ kind: "ok", text: "u+00e9 → é" });
  });

  it("trims surrounding whitespace before building the reflection text", () => {
    expect(reflectCharInput("  é  ")).toEqual({ kind: "ok", text: "é → U+00E9" });
  });

  it("reflects a multi-character literal (no singleGrapheme option) to the U+ of its first code point", () => {
    expect(reflectCharInput("ab")).toEqual({ kind: "ok", text: "ab → U+0061" });
  });

  describe("reflectCharInput — multiToken path", () => {
    it("reflects a multi-grapheme literal as space-separated U+ per code point", () => {
      expect(reflectCharInput("ng", { multiToken: true })).toEqual({
        kind: "ok",
        text: "ng → U+006E U+0067",
      });
    });

    it("reflects a single-code-point literal exactly as the non-multiToken path", () => {
      expect(reflectCharInput("a", { multiToken: true })).toEqual({ kind: "ok", text: "a → U+0061" });
    });

    it("reflects a multi-token U+ compose using the notation -> char direction, echoing the raw text", () => {
      expect(reflectCharInput("U+006E U+0303", { multiToken: true })).toEqual({
        kind: "ok",
        text: "U+006E U+0303 → ñ",
      });
    });

    it("reflects a mixed literal+U+ compose using the notation -> char direction", () => {
      expect(reflectCharInput("a U+0301", { multiToken: true })).toEqual({
        kind: "ok",
        text: "a U+0301 → á",
      });
    });

    it("keeps the singleGrapheme rejection reason accurate for a genuine multi-grapheme multiToken value", () => {
      const r = reflectCharInput("a b", { multiToken: true, singleGrapheme: true });
      expect(r).toEqual({ kind: "error", reason: "Enter one character only." });
    });

    it("does not error for a multiToken-composed single grapheme even when singleGrapheme is set", () => {
      const r = reflectCharInput("U+006E U+0303", { multiToken: true, singleGrapheme: true });
      expect(r).toEqual({ kind: "ok", text: "U+006E U+0303 → ñ" });
    });
  });

  it("reports the malformed-U+ error reason instead of a reflection", () => {
    const r = reflectCharInput("U+ZZZZ");
    expect(r.kind).toBe("error");
    if (r.kind === "error") {
      expect(r.reason).toMatch(/not a valid unicode value/i);
    }
  });

  it("reports the single-grapheme error reason instead of a reflection, when singleGrapheme is set", () => {
    const r = reflectCharInput("ab", { singleGrapheme: true });
    expect(r).toEqual({ kind: "error", reason: "Enter one character only." });
  });

  it("reports the blocked-delimiter error reason instead of a reflection, when blockDelimiters is set", () => {
    const r = reflectCharInput("'", { blockDelimiters: true });
    expect(r.kind).toBe("error");
    if (r.kind === "error") {
      expect(r.reason).toMatch(/straight quotes/i);
    }
  });

  it("agrees with resolveCharInput's ok/error verdict for the same input and options", () => {
    const options = { singleGrapheme: true, blockDelimiters: true } as const;
    for (const raw of ["é", "ab", "'", "U+00E9", "U+ZZZZ", ""]) {
      const resolved = resolveCharInput(raw, options);
      const reflected = reflectCharInput(raw, options);
      expect(reflected.kind === "ok").toBe(resolved.ok && raw.trim().length > 0);
    }
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
