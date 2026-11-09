import { describe, it, expect } from "vitest";
import { checkFontGlyphCoverage } from "./check-font-glyph-coverage.js";
import type { FontCoverage, IRGroup, KeyboardIR } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";

const KMN_PATH = "source/test.kmn";
const CODE = "KM_LINT_FONT_GLYPH_COVERAGE";

function makeIR(groups: IRGroup[]): KeyboardIR {
  return makeTestIR(groups, [], [], { origin: "imported" });
}

function charRule(id: string, value: string) {
  return {
    nodeId: id,
    context: [],
    output: [{ kind: "char", value } as const],
  };
}

function mainGroup(rules: ReturnType<typeof charRule>[]): IRGroup {
  return { nodeId: "g1", name: "main", usingKeys: true, readonly: false, rules };
}

const LATIN: FontCoverage = {
  ref: "AndikaAfr-R.ttf",
  covered: [{ start: 0x20, end: 0x7e }],
};
const FULL: FontCoverage = {
  ref: "Full.ttf",
  covered: [{ start: 0x0, end: 0x10ffff }],
};

describe("checkFontGlyphCoverage (18.13 KM_LINT_FONT_GLYPH_COVERAGE)", () => {
  it("passes when the packaged font covers every typed character", () => {
    const ir = makeIR([mainGroup([charRule("r1", "a"), charRule("r2", "b")])]);
    const result = checkFontGlyphCoverage({ ir, coverage: [LATIN], kmnPath: KMN_PATH });
    expect(result.code).toBe(CODE);
    expect(result.findings).toEqual([]);
    expect(result.verified).toHaveLength(1);
  });

  it("passes silently when no packaged font is in the VFS", () => {
    const ir = makeIR([mainGroup([charRule("r1", "a")])]);
    const result = checkFontGlyphCoverage({ ir, coverage: [], kmnPath: KMN_PATH });
    expect(result.findings).toEqual([]);
  });

  it("flags one font's missing glyphs, naming the characters", () => {
    const ir = makeIR([mainGroup([charRule("r1", "a"), charRule("r2", "ɛ")])]);
    const result = checkFontGlyphCoverage({ ir, coverage: [LATIN], kmnPath: KMN_PATH });
    expect(result.findings).toHaveLength(1);
    const [finding] = result.findings;
    expect(finding?.code).toBe(CODE);
    expect(finding?.severity).toBe("warning");
    expect(finding?.layer).toBe("C");
    expect(finding?.message).toContain('"AndikaAfr-R.ttf"');
    expect(finding?.message).toContain("U+025B");
    expect(finding?.message).toContain("ɛ");
    expect(finding?.location.file).toBe(KMN_PATH);
    expect(finding?.hint).toContain("AndikaAfr-R.ttf");
  });

  it("reports one finding per font with gaps and none for covering fonts", () => {
    const ir = makeIR([mainGroup([charRule("r1", "ɛ")])]);
    const result = checkFontGlyphCoverage({
      ir,
      coverage: [LATIN, FULL],
      kmnPath: KMN_PATH,
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.message).toContain("AndikaAfr-R.ttf");
  });

  it("caps the named characters and counts the rest", () => {
    const chars = Array.from({ length: 12 }, (_, i) => String.fromCodePoint(0x250 + i));
    const ir = makeIR([mainGroup(chars.map((c, i) => charRule(`r${i}`, c)))]);
    const result = checkFontGlyphCoverage({ ir, coverage: [LATIN], kmnPath: KMN_PATH });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.message).toContain("and 2 more");
    expect(result.findings[0]?.message).toContain("12 character(s)");
  });

  it("checks the NFC-precomposed codepoint for a base+mark run", () => {
    // One rule emitting e + combining acute run-merges to é: the font
    // needs é itself, even though it carries e and U+0301.
    const ir = makeIR([
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: [
          {
            nodeId: "r1",
            context: [],
            output: [
              { kind: "char", value: "e" },
              { kind: "char", value: "́" },
            ],
          },
        ],
      },
    ]);
    const decomposedOnly: FontCoverage = {
      ref: "Decomp.ttf",
      covered: [
        { start: 0x20, end: 0x7e },
        { start: 0x300, end: 0x36f },
      ],
    };
    const result = checkFontGlyphCoverage({
      ir,
      coverage: [decomposedOnly],
      kmnPath: KMN_PATH,
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.message).toContain("U+00E9");
  });

  it("passes (skips) when the IR carries raw fragments", () => {
    const ir = makeIR([mainGroup([charRule("r1", "ɛ")])]);
    ir.raw = [
      { nodeId: "raw1", origin: "imported", sourceText: "c('a')", reason: "outs()" },
    ];
    const result = checkFontGlyphCoverage({ ir, coverage: [LATIN], kmnPath: KMN_PATH });
    expect(result.findings).toEqual([]);
    expect(result.verified[0]).toMatch(/raw fragment/i);
  });
});
