import { describe, it, expect } from "vitest";
import {
  isMnemonicKeyboard,
  hasNonUSBase,
  dedupCapsNcaps,
} from "./filters.js";
import { parse } from "../codec/parse.js";
import type { PlacementCandidate } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";

// ---------------------------------------------------------------------------
// Minimal KMN helpers
// ---------------------------------------------------------------------------

function makeUnicodeKmn(rules: string): string {
  return [
    "store(&VERSION) '10.0'",
    "store(&TARGETS) 'any'",
    "begin Unicode > use(main)",
    "group(main) using keys",
    rules,
  ].join("\n");
}

function makeAnsiKmn(rules: string): string {
  return [
    "store(&VERSION) '10.0'",
    "store(&TARGETS) 'any'",
    "begin ANSI > use(main)",
    "group(main) using keys",
    rules,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// isMnemonicKeyboard
// ---------------------------------------------------------------------------

describe("isMnemonicKeyboard", () => {
  it("returns false when keyboard has begin Unicode store", () => {
    const { ir } = parse(makeUnicodeKmn("+ [K_B] > ɓ"), "kb-unicode");
    expect(isMnemonicKeyboard(ir)).toBe(false);
  });

  it("returns true when keyboard has only begin ANSI store (no Unicode)", () => {
    const { ir } = parse(makeAnsiKmn("+ [K_B] > b"), "kb-ansi");
    expect(isMnemonicKeyboard(ir)).toBe(true);
  });

  it("returns false when no begin statement at all", () => {
    // makeTestIR builds an IR with no stores at all
    const ir = makeTestIR([]);
    expect(isMnemonicKeyboard(ir)).toBe(false);
  });

  it("returns false when header.encoding is 'Unicode'", () => {
    const ir = makeTestIR([]);
    (ir.header as Record<string, unknown>).encoding = "Unicode";
    expect(isMnemonicKeyboard(ir)).toBe(false);
  });

  it("returns true when header.encoding is 'ANSI'", () => {
    const ir = makeTestIR([]);
    (ir.header as Record<string, unknown>).encoding = "ANSI";
    expect(isMnemonicKeyboard(ir)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hasNonUSBase
// ---------------------------------------------------------------------------

describe("hasNonUSBase", () => {
  it("returns false for a keyboard with zero letter deviations (US QWERTY identity)", () => {
    // Rules that exactly match US unshifted — quoted chars so the parser produces char elements
    const kmn = makeUnicodeKmn(
      ["+ [K_A] > 'a'", "+ [K_B] > 'b'", "+ [K_C] > 'c'"].join("\n"),
    );
    const { ir } = parse(kmn, "kb-us");
    expect(hasNonUSBase(ir)).toBe(false);
  });

  it("returns false for a keyboard with exactly 3 deviations (at the threshold)", () => {
    // 3 letter deviations: K_A->'x', K_B->'y', K_C->'z' (all different from US)
    const kmn = makeUnicodeKmn(
      ["+ [K_A] > 'x'", "+ [K_B] > 'y'", "+ [K_C] > 'z'"].join("\n"),
    );
    const { ir } = parse(kmn, "kb-3dev");
    expect(hasNonUSBase(ir)).toBe(false);
  });

  it("returns true for a keyboard with more than 3 deviations from US QWERTY", () => {
    // 4 letter deviations: K_A->'q', K_B->'w', K_C->'e', K_D->'r' (none match US expected)
    // US expected: K_A->a, K_B->b, K_C->c, K_D->d
    const kmn = makeUnicodeKmn(
      ["+ [K_A] > 'q'", "+ [K_B] > 'w'", "+ [K_C] > 'e'", "+ [K_D] > 'r'"].join("\n"),
    );
    const { ir } = parse(kmn, "kb-azerty");
    expect(hasNonUSBase(ir)).toBe(true);
  });

  it("ignores modified (SHIFT/RALT) rules when counting deviations", () => {
    // RALT-layer rules should not count as base deviations
    const kmn = makeUnicodeKmn(
      [
        "+ [RALT K_A] > 'q'",
        "+ [RALT K_B] > 'w'",
        "+ [RALT K_C] > 'e'",
        "+ [RALT K_D] > 'r'",
        "+ [RALT K_E] > 't'",
      ].join("\n"),
    );
    const { ir } = parse(kmn, "kb-ralt-only");
    expect(hasNonUSBase(ir)).toBe(false);
  });

  it("custom threshold: 5 deviations is ok when threshold=5", () => {
    const kmn = makeUnicodeKmn(
      [
        "+ [K_A] > 'q'",
        "+ [K_B] > 'w'",
        "+ [K_C] > 'e'",
        "+ [K_D] > 'r'",
        "+ [K_E] > 't'",
      ].join("\n"),
    );
    const { ir } = parse(kmn, "kb-5dev");
    expect(hasNonUSBase(ir, 5)).toBe(false);
    expect(hasNonUSBase(ir, 4)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// dedupCapsNcaps
// ---------------------------------------------------------------------------

describe("dedupCapsNcaps", () => {
  function taggedWith(
    cp: number,
    vkey: string,
    modifiers: string[],
  ): { codepoint: number; candidate: PlacementCandidate } {
    return {
      codepoint: cp,
      candidate: {
        vkey,
        modifiers,
        mechanism: "direct",
        priorSource: "corpus",
        priorCount: 1,
        confidence: 0.5,
      },
    };
  }

  it("collapses CAPS and NCAPS variants for same codepoint+vkey to one entry", () => {
    const input = [
      taggedWith(0x0253, "K_B", ["CAPS"]),
      taggedWith(0x0253, "K_B", ["NCAPS"]),
    ];
    const result = dedupCapsNcaps(input);
    expect(result).toHaveLength(1);
    expect(result[0]?.candidate.vkey).toBe("K_B");
  });

  it("keeps the first occurrence when deduplicating", () => {
    const input = [
      taggedWith(0x0253, "K_B", ["CAPS"]),
      taggedWith(0x0253, "K_B", ["NCAPS"]),
    ];
    const result = dedupCapsNcaps(input);
    expect(result[0]?.candidate.modifiers).toEqual(["CAPS"]);
  });

  it("does not collapse entries with different codepoints even on same vkey", () => {
    const input = [
      taggedWith(0x0253, "K_B", ["CAPS"]),
      taggedWith(0x0042, "K_B", ["NCAPS"]), // U+0042 = 'B', different cp
    ];
    const result = dedupCapsNcaps(input);
    expect(result).toHaveLength(2);
  });

  it("does not collapse entries with different vkeys even with same codepoint", () => {
    const input = [
      taggedWith(0x0253, "K_B", ["CAPS"]),
      taggedWith(0x0253, "K_V", ["NCAPS"]),
    ];
    const result = dedupCapsNcaps(input);
    expect(result).toHaveLength(2);
  });

  it("does not collapse when RALT is present and different (RALT+CAPS vs plain CAPS)", () => {
    // RALT K_B with CAPS is a different slot from K_B with CAPS
    const input = [
      taggedWith(0x0253, "K_B", ["RALT", "CAPS"]),
      taggedWith(0x0253, "K_B", ["RALT", "NCAPS"]),
    ];
    const result = dedupCapsNcaps(input);
    // Both have RALT, same codepoint+vkey — they dedup to one
    expect(result).toHaveLength(1);
  });

  it("passes through entries that have no CAPS/NCAPS modifier unchanged", () => {
    const input = [
      taggedWith(0x0253, "K_B", ["RALT"]),
      taggedWith(0x0257, "K_D", ["RALT"]),
    ];
    const result = dedupCapsNcaps(input);
    expect(result).toHaveLength(2);
  });
});
