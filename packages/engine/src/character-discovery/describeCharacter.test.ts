// Tests for describeCharacter — the character map info popover's Unicode
// facts helper.
//
// The helper is pure and dependency-free by design (the 1.5 MB pinned table
// is injected, never imported), so the category matrix below runs against a
// small stub table — fast, deterministic, and independent of the pinned
// data's version. A final block exercises the REAL pinned table to pin the
// wiring (stub shape matches the real module's exports).

import { describe, expect, it } from "vitest";
import {
  describeCharacter,
  type UnicodeCharacterLookups,
} from "./describeCharacter.ts";

// ---------------------------------------------------------------------------
// Stub table — just enough rows for the category matrix. Shape mirrors
// @keyboard-studio/contracts/unicode's { getName, getCategory, getCCC }.
// ---------------------------------------------------------------------------

interface StubRow {
  name: string;
  category: string;
  ccc: number;
}

const STUB_ROWS: Record<number, StubRow> = {
  0x41: { name: "LATIN CAPITAL LETTER A", category: "Lu", ccc: 0 },
  0x61: { name: "LATIN SMALL LETTER A", category: "Ll", ccc: 0 },
  0x2b0: { name: "MODIFIER LETTER SMALL H", category: "Lm", ccc: 0 },
  0xb4: { name: "ACUTE ACCENT", category: "Sk", ccc: 0 },
  0x301: { name: "COMBINING ACUTE ACCENT", category: "Mn", ccc: 230 },
  0x93e: { name: "DEVANAGARI VOWEL SIGN AA", category: "Mc", ccc: 0 },
  0x2e: { name: "FULL STOP", category: "Po", ccc: 0 },
  0x200d: { name: "ZERO WIDTH JOINER", category: "Cf", ccc: 0 },
  0x915: { name: "DEVANAGARI LETTER KA", category: "Lo", ccc: 0 },
  0x94d: { name: "DEVANAGARI SIGN VIRAMA", category: "Mn", ccc: 9 },
  0x937: { name: "DEVANAGARI LETTER SSA", category: "Lo", ccc: 0 },
};

const stubUnicode: UnicodeCharacterLookups = {
  getName: (cp) => STUB_ROWS[cp]?.name,
  getCategory: (cp) => STUB_ROWS[cp]?.category,
  getCCC: (cp) => STUB_ROWS[cp]?.ccc,
};

// ---------------------------------------------------------------------------
// Category matrix — the issue's acceptance criterion: at least one each of
// Lu/Ll, Lm, Sk, Mn, Mc, Po, Cf.
// ---------------------------------------------------------------------------

describe("describeCharacter category matrix", () => {
  const cases: Array<{
    char: string;
    category: string;
    name: string;
    combining: boolean;
  }> = [
    { char: "A", category: "Lu", name: "LATIN CAPITAL LETTER A", combining: false },
    { char: "a", category: "Ll", name: "LATIN SMALL LETTER A", combining: false },
    { char: "ʰ", category: "Lm", name: "MODIFIER LETTER SMALL H", combining: false },
    { char: "´", category: "Sk", name: "ACUTE ACCENT", combining: false },
    { char: "́", category: "Mn", name: "COMBINING ACUTE ACCENT", combining: true },
    { char: "ा", category: "Mc", name: "DEVANAGARI VOWEL SIGN AA", combining: false },
    { char: ".", category: "Po", name: "FULL STOP", combining: false },
    { char: "‍", category: "Cf", name: "ZERO WIDTH JOINER", combining: false },
  ];

  for (const { char, category, name, combining } of cases) {
    it(`U+${char.codePointAt(0)!.toString(16).toUpperCase()} is ${category} (${combining ? "combining" : "standalone"})`, () => {
      const d = describeCharacter(char, stubUnicode);
      expect(d.char).toBe(char);
      expect(d.codePoints).toHaveLength(1);
      const cp = d.codePoints[0]!;
      expect(cp.category).toBe(category);
      expect(cp.name).toBe(name);
      expect(d.isCombining).toBe(combining);
    });
  }

  it("reports Script from the runtime ICU (Latin / Inherited / Common)", () => {
    expect(describeCharacter("A", stubUnicode).codePoints[0]!.script).toBe("Latin");
    // U+0301's Script is Inherited, not Latin — the probe must not attribute
    // a combining mark to the base letter's script.
    expect(describeCharacter("́", stubUnicode).codePoints[0]!.script).toBe("Inherited");
    // U+00B4 ACUTE ACCENT is a spacing symbol: Script=Common.
    expect(describeCharacter("´", stubUnicode).codePoints[0]!.script).toBe("Common");
  });

  it("reports Script_Extensions where they add something", () => {
    // U+0041: scx is exactly {Latin} — nothing beyond Script, so the UI
    // hides the row. The helper still returns the full set honestly.
    const a = describeCharacter("A", stubUnicode).codePoints[0]!;
    expect(a.scriptExtensions).toEqual(["Latin"]);
    expect(a.scriptExtensions.filter((s) => s !== a.script)).toEqual([]);
    // U+0301: Script=Inherited but usable with many scripts. Note scx does
    // NOT contain "Inherited" itself — it lists the scripts the mark is
    // used with — so "adds something" is measured against the set minus
    // the primary script.
    const acute = describeCharacter("́", stubUnicode).codePoints[0]!;
    expect(acute.script).toBe("Inherited");
    const extras = acute.scriptExtensions.filter((s) => s !== acute.script);
    expect(extras).toContain("Latin");
    expect(extras.length).toBeGreaterThan(0);
  });

  it("carries the canonical combining class through", () => {
    expect(describeCharacter("́", stubUnicode).codePoints[0]!.ccc).toBe(230);
    expect(describeCharacter("A", stubUnicode).codePoints[0]!.ccc).toBe(0);
  });
});

describe("describeCharacter multi-codepoint graphemes", () => {
  it("lists every code point of an NFC-stable cluster, each with its own name", () => {
    // क्ष (ka + virama + ssa) is NFC-stable as three code points.
    const d = describeCharacter("क्ष", stubUnicode);
    expect(d.char).toBe("क्ष");
    expect(d.codePoints.map((c) => c.codePoint)).toEqual([0x915, 0x94d, 0x937]);
    expect(d.codePoints.map((c) => c.name)).toEqual([
      "DEVANAGARI LETTER KA",
      "DEVANAGARI SIGN VIRAMA",
      "DEVANAGARI LETTER SSA",
    ]);
    // The grapheme starts with a base letter — it stands alone even though
    // its middle code point is a combining mark.
    expect(d.isCombining).toBe(false);
  });

  it("NFC-normalizes the input before splitting", () => {
    // e + combining acute in NFD order normalizes to é (single code point).
    const d = describeCharacter("é", stubUnicode);
    expect(d.char).toBe("é");
    expect(d.codePoints).toHaveLength(1);
    expect(d.codePoints[0]!.codePoint).toBe(0xe9);
  });
});

describe("describeCharacter unknown code points", () => {
  it("degrades honestly for unassigned code points (no invented data)", () => {
    const d = describeCharacter("͸", stubUnicode); // U+0378, unassigned
    expect(d.codePoints).toHaveLength(1);
    const cp = d.codePoints[0]!;
    expect(cp.codePoint).toBe(0x378);
    expect(cp.name).toBeUndefined();
    expect(cp.category).toBeUndefined();
    expect(cp.ccc).toBeUndefined();
    expect(cp.script).toBe("Unknown");
    expect(d.isCombining).toBe(false);
  });

  it("handles the empty string without throwing", () => {
    const d = describeCharacter("", stubUnicode);
    expect(d.char).toBe("");
    expect(d.codePoints).toEqual([]);
    expect(d.isCombining).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Real pinned table — pins the wiring: the stub shape above matches the
// real @keyboard-studio/contracts/unicode module's exports.
// ---------------------------------------------------------------------------

describe("describeCharacter with the real pinned Unicode table", () => {
  it("resolves name/category/ccc/script for a modifier letter", async () => {
    const unicode = await import("@keyboard-studio/contracts/unicode");
    const d = describeCharacter("ʰ", unicode);
    const cp = d.codePoints[0]!;
    expect(cp.name).toBe("MODIFIER LETTER SMALL H");
    expect(cp.category).toBe("Lm");
    expect(cp.script).toBe("Latin");
    expect(d.isCombining).toBe(false);
  });

  it("names every code point of a multi-codepoint grapheme", async () => {
    const unicode = await import("@keyboard-studio/contracts/unicode");
    const d = describeCharacter("क्ष", unicode);
    expect(d.codePoints.map((c) => c.name)).toEqual([
      "DEVANAGARI LETTER KA",
      "DEVANAGARI SIGN VIRAMA",
      "DEVANAGARI LETTER SSA",
    ]);
  });
});
