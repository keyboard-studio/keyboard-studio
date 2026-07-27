import { describe, it, expect } from "vitest";
import { harvestChars, nfcDedup, segmentGraphemes } from "./charNormUtils.ts";

describe("nfcDedup", () => {
  it("NFC-normalizes and dedupes, preserving first-appearance order", () => {
    // decomposed é (e + U+0301) collapses onto the precomposed form.
    expect(nfcDedup(["a"], ["e" + "́", "é", "a"])).toEqual(["a", "é"]);
  });
});

describe("segmentGraphemes", () => {
  it("splits CRLF into a single grapheme cluster", () => {
    expect(segmentGraphemes("a\r\nb")).toEqual(["a", "\r\n", "b"]);
  });
});

describe("harvestChars", () => {
  it("captures every distinct grapheme in a whole string with no spaces (AS1.2)", () => {
    const { chars } = harvestChars("abcé");
    expect(chars).toEqual(["a", "b", "c", "é"]);
  });

  it("captures every distinct character from a sentence, not just word-initial letters (AS1.1)", () => {
    const { chars } = harvestChars("Naïve? Yes — 3 times.");
    // Every non-whitespace grapheme, deduped (the two 'e's collapse, etc.).
    for (const ch of ["N", "a", "ï", "v", "e", "?", "Y", "s", "—", "3", "t", "i", "m", "."]) {
      expect(chars).toContain(ch);
    }
    // Ordinary space is never captured (SC-006).
    expect(chars).not.toContain(" ");
  });

  it("drops ONLY CR/LF/CRLF/Tab/space; keeps NBSP and other invisibles (AS1.3, FR-002, SC-006)", () => {
    const { chars } = harvestChars("a\r\nb\tc d e​f");
    expect(chars).toEqual(["a", "b", "c", "d", " ", "e", "​", "f"]);
    // None of the five ordinary whitespace forms survive.
    for (const ws of ["\r", "\n", "\r\n", "\t", " "]) {
      expect(chars).not.toContain(ws);
    }
  });

  it("reports retained separators/format/control chars in `unusual` (FR-003)", () => {
    const { unusual } = harvestChars("a b​c");
    expect(unusual).toContain(" "); // NBSP — separator
    expect(unusual).toContain("​"); // ZWSP — format (control)
    expect(unusual).not.toContain("a");
    expect(unusual).not.toContain("b");
  });

  it("a whitespace-only string harvests nothing (edge case)", () => {
    expect(harvestChars("  \t\r\n ")).toEqual({ chars: [], unusual: [] });
  });

  it("NFC-normalizes and dedupes the captured chars", () => {
    const { chars } = harvestChars("e" + "́" + "é" + "e" + "́");
    expect(chars).toEqual(["é"]);
  });
});
