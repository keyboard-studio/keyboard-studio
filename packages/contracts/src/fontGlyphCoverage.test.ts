import { describe, it, expect } from "vitest";
import {
  auditFontGlyphCoverage,
  coversCodepoint,
  formatCodepoint,
  producedCodepoints,
  type FontCoverage,
} from "./fontGlyphCoverage.js";
import { makeTestIR } from "./fixtures/keyboard-ir.js";
import { irGroup, vkeyRule } from "./fixtures/ir-builders.js";

function rule(chars: string[]) {
  return vkeyRule({
    output: chars.map((c) => ({ kind: "char", value: c })),
  });
}

describe("coversCodepoint", () => {
  it("finds codepoints inside sorted ranges and rejects the rest", () => {
    const covered = [
      { start: 0x41, end: 0x5a },
      { start: 0x61, end: 0x7a },
    ];
    expect(coversCodepoint(covered, 0x41)).toBe(true);
    expect(coversCodepoint(covered, 0x5a)).toBe(true);
    expect(coversCodepoint(covered, 0x60)).toBe(false);
    expect(coversCodepoint(covered, 0x7a)).toBe(true);
    expect(coversCodepoint(covered, 0x7b)).toBe(false);
    expect(coversCodepoint([], 0x41)).toBe(false);
  });
});

describe("formatCodepoint", () => {
  it("pads BMP codepoints to 4 digits and leaves astral ones long", () => {
    expect(formatCodepoint(0x25b)).toBe("U+025B");
    expect(formatCodepoint(0x41)).toBe("U+0041");
    expect(formatCodepoint(0x1d400)).toBe("U+1D400");
  });
});

describe("producedCodepoints", () => {
  it("splits the reachable produced set into sorted codepoints", () => {
    const ir = makeTestIR([
      irGroup({
        name: "main",
        rules: [rule(["a", "b"]), rule(["\u025b"])],
      }),
    ]);
    expect(producedCodepoints(ir)).toEqual([0x61, 0x62, 0x25b]);
  });

  it("reports the NFC-precomposed codepoint for a base+mark run, not the parts", () => {
    // One rule emitting e + combining acute run-merges to é (U+00E9):
    // the font needs é, not e and U+0301 separately.
    const ir = makeTestIR([
      irGroup({
        name: "main",
        rules: [
          vkeyRule({
            output: [
              { kind: "char", value: "e" },
              { kind: "char", value: "́" },
            ],
          }),
        ],
      }),
    ]);
    expect(producedCodepoints(ir)).toEqual([0xe9]);
  });

  it("reports a standalone combining mark as its own codepoint", () => {
    const ir = makeTestIR([
      irGroup({ name: "main", rules: [rule(["́"])] }),
    ]);
    expect(producedCodepoints(ir)).toEqual([0x301]);
  });
});

describe("auditFontGlyphCoverage", () => {
  const fonts: FontCoverage[] = [
    {
      ref: "AndikaAfr-R.ttf",
      covered: [
        { start: 0x20, end: 0x7e },
        { start: 0x100, end: 0x17f },
      ],
    },
    {
      ref: "Full.ttf",
      covered: [{ start: 0x0, end: 0x10ffff }],
    },
  ];

  it("lists the missing codepoints per font and omits fonts with no gaps", () => {
    const gaps = auditFontGlyphCoverage([0x61, 0x250, 0x25b], fonts);
    expect(gaps).toEqual([{ fontRef: "AndikaAfr-R.ttf", missing: [0x250, 0x25b] }]);
  });

  it("returns no gaps when every font covers everything typed", () => {
    expect(auditFontGlyphCoverage([0x61, 0x62], fonts)).toEqual([]);
  });

  it("returns no gaps for an empty produced set or no fonts", () => {
    expect(auditFontGlyphCoverage([], fonts)).toEqual([]);
    expect(auditFontGlyphCoverage([0x61], [])).toEqual([]);
  });
});
