/**
 * kmAssist deterministic explainer tests — spec 082 FR-019 (FR-023 read-only).
 *
 * Unicode data note: `getCategory`/`getName` come from the FR-021 adapter
 * stub (currently returning undefined), so these tests substitute a
 * faithful mock derived from the repo's pinned UCD
 * (`lib/ucd/UnicodeData.txt`, Unicode 17.0.0, via scripts/ucd-version.json)
 * for exactly the code points appearing in the fixtures. The mock is
 * labelled MOCK-FR021 and disappears when the pinned table lands — the
 * assertions exercise the real composer through the real adapter
 * signatures. No LLM is involved; every sentence is template-composed.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../codec/parse.js";
import type { IRRule } from "@keyboard-studio/contracts";
import { explainRule, type ExplainContext } from "./explain.js";

const MOCK_UNICODE = vi.hoisted(() => ({
  data: {
  0x20: ["SPACE", "Zs"],
  0x21: ["EXCLAMATION MARK", "Po"],
  0x22: ["QUOTATION MARK", "Po"],
  0x23: ["NUMBER SIGN", "Po"],
  0x24: ["DOLLAR SIGN", "Sc"],
  0x25: ["PERCENT SIGN", "Po"],
  0x26: ["AMPERSAND", "Po"],
  0x27: ["APOSTROPHE", "Po"],
  0x28: ["LEFT PARENTHESIS", "Ps"],
  0x29: ["RIGHT PARENTHESIS", "Pe"],
  0x2a: ["ASTERISK", "Po"],
  0x2b: ["PLUS SIGN", "Sm"],
  0x2c: ["COMMA", "Po"],
  0x2d: ["HYPHEN-MINUS", "Pd"],
  0x2e: ["FULL STOP", "Po"],
  0x2f: ["SOLIDUS", "Po"],
  0x30: ["DIGIT ZERO", "Nd"],
  0x31: ["DIGIT ONE", "Nd"],
  0x32: ["DIGIT TWO", "Nd"],
  0x33: ["DIGIT THREE", "Nd"],
  0x34: ["DIGIT FOUR", "Nd"],
  0x35: ["DIGIT FIVE", "Nd"],
  0x36: ["DIGIT SIX", "Nd"],
  0x37: ["DIGIT SEVEN", "Nd"],
  0x38: ["DIGIT EIGHT", "Nd"],
  0x39: ["DIGIT NINE", "Nd"],
  0x3a: ["COLON", "Po"],
  0x3b: ["SEMICOLON", "Po"],
  0x3c: ["LESS-THAN SIGN", "Sm"],
  0x3d: ["EQUALS SIGN", "Sm"],
  0x3e: ["GREATER-THAN SIGN", "Sm"],
  0x3f: ["QUESTION MARK", "Po"],
  0x40: ["COMMERCIAL AT", "Po"],
  0x41: ["LATIN CAPITAL LETTER A", "Lu"],
  0x42: ["LATIN CAPITAL LETTER B", "Lu"],
  0x43: ["LATIN CAPITAL LETTER C", "Lu"],
  0x44: ["LATIN CAPITAL LETTER D", "Lu"],
  0x45: ["LATIN CAPITAL LETTER E", "Lu"],
  0x46: ["LATIN CAPITAL LETTER F", "Lu"],
  0x47: ["LATIN CAPITAL LETTER G", "Lu"],
  0x48: ["LATIN CAPITAL LETTER H", "Lu"],
  0x49: ["LATIN CAPITAL LETTER I", "Lu"],
  0x4a: ["LATIN CAPITAL LETTER J", "Lu"],
  0x4b: ["LATIN CAPITAL LETTER K", "Lu"],
  0x4c: ["LATIN CAPITAL LETTER L", "Lu"],
  0x4d: ["LATIN CAPITAL LETTER M", "Lu"],
  0x4e: ["LATIN CAPITAL LETTER N", "Lu"],
  0x4f: ["LATIN CAPITAL LETTER O", "Lu"],
  0x50: ["LATIN CAPITAL LETTER P", "Lu"],
  0x51: ["LATIN CAPITAL LETTER Q", "Lu"],
  0x52: ["LATIN CAPITAL LETTER R", "Lu"],
  0x53: ["LATIN CAPITAL LETTER S", "Lu"],
  0x54: ["LATIN CAPITAL LETTER T", "Lu"],
  0x55: ["LATIN CAPITAL LETTER U", "Lu"],
  0x56: ["LATIN CAPITAL LETTER V", "Lu"],
  0x57: ["LATIN CAPITAL LETTER W", "Lu"],
  0x58: ["LATIN CAPITAL LETTER X", "Lu"],
  0x59: ["LATIN CAPITAL LETTER Y", "Lu"],
  0x5a: ["LATIN CAPITAL LETTER Z", "Lu"],
  0x5b: ["LEFT SQUARE BRACKET", "Ps"],
  0x5c: ["REVERSE SOLIDUS", "Po"],
  0x5d: ["RIGHT SQUARE BRACKET", "Pe"],
  0x5e: ["CIRCUMFLEX ACCENT", "Sk"],
  0x5f: ["LOW LINE", "Pc"],
  0x60: ["GRAVE ACCENT", "Sk"],
  0x61: ["LATIN SMALL LETTER A", "Ll"],
  0x62: ["LATIN SMALL LETTER B", "Ll"],
  0x63: ["LATIN SMALL LETTER C", "Ll"],
  0x64: ["LATIN SMALL LETTER D", "Ll"],
  0x65: ["LATIN SMALL LETTER E", "Ll"],
  0x66: ["LATIN SMALL LETTER F", "Ll"],
  0x67: ["LATIN SMALL LETTER G", "Ll"],
  0x68: ["LATIN SMALL LETTER H", "Ll"],
  0x69: ["LATIN SMALL LETTER I", "Ll"],
  0x6a: ["LATIN SMALL LETTER J", "Ll"],
  0x6b: ["LATIN SMALL LETTER K", "Ll"],
  0x6c: ["LATIN SMALL LETTER L", "Ll"],
  0x6d: ["LATIN SMALL LETTER M", "Ll"],
  0x6e: ["LATIN SMALL LETTER N", "Ll"],
  0x6f: ["LATIN SMALL LETTER O", "Ll"],
  0x70: ["LATIN SMALL LETTER P", "Ll"],
  0x71: ["LATIN SMALL LETTER Q", "Ll"],
  0x72: ["LATIN SMALL LETTER R", "Ll"],
  0x73: ["LATIN SMALL LETTER S", "Ll"],
  0x74: ["LATIN SMALL LETTER T", "Ll"],
  0x75: ["LATIN SMALL LETTER U", "Ll"],
  0x76: ["LATIN SMALL LETTER V", "Ll"],
  0x77: ["LATIN SMALL LETTER W", "Ll"],
  0x78: ["LATIN SMALL LETTER X", "Ll"],
  0x79: ["LATIN SMALL LETTER Y", "Ll"],
  0x7a: ["LATIN SMALL LETTER Z", "Ll"],
  0x7b: ["LEFT CURLY BRACKET", "Ps"],
  0x7c: ["VERTICAL LINE", "Sm"],
  0x7d: ["RIGHT CURLY BRACKET", "Pe"],
  0x7e: ["TILDE", "Sm"],
  0xa0: ["NO-BREAK SPACE", "Zs"],
  0xa3: ["POUND SIGN", "Sc"],
  0xa5: ["YEN SIGN", "Sc"],
  0xa9: ["COPYRIGHT SIGN", "So"],
  0xab: ["LEFT-POINTING DOUBLE ANGLE QUOTATION MARK", "Pi"],
  0xae: ["REGISTERED SIGN", "So"],
  0xb0: ["DEGREE SIGN", "So"],
  0xb1: ["PLUS-MINUS SIGN", "Sm"],
  0xbb: ["RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK", "Pf"],
  0xbc: ["VULGAR FRACTION ONE QUARTER", "No"],
  0xbd: ["VULGAR FRACTION ONE HALF", "No"],
  0xbe: ["VULGAR FRACTION THREE QUARTERS", "No"],
  0xc6: ["LATIN CAPITAL LETTER AE", "Lu"],
  0xd7: ["MULTIPLICATION SIGN", "Sm"],
  0xd8: ["LATIN CAPITAL LETTER O WITH STROKE", "Lu"],
  0xe6: ["LATIN SMALL LETTER AE", "Ll"],
  0xf7: ["DIVISION SIGN", "Sm"],
  0xf8: ["LATIN SMALL LETTER O WITH STROKE", "Ll"],
  0x14a: ["LATIN CAPITAL LETTER ENG", "Lu"],
  0x14b: ["LATIN SMALL LETTER ENG", "Ll"],
  0x152: ["LATIN CAPITAL LIGATURE OE", "Lu"],
  0x153: ["LATIN SMALL LIGATURE OE", "Ll"],
  0x181: ["LATIN CAPITAL LETTER B WITH HOOK", "Lu"],
  0x186: ["LATIN CAPITAL LETTER OPEN O", "Lu"],
  0x18a: ["LATIN CAPITAL LETTER D WITH HOOK", "Lu"],
  0x18f: ["LATIN CAPITAL LETTER SCHWA", "Lu"],
  0x190: ["LATIN CAPITAL LETTER OPEN E", "Lu"],
  0x197: ["LATIN CAPITAL LETTER I WITH STROKE", "Lu"],
  0x1b3: ["LATIN CAPITAL LETTER Y WITH HOOK", "Lu"],
  0x1b4: ["LATIN SMALL LETTER Y WITH HOOK", "Ll"],
  0x244: ["LATIN CAPITAL LETTER U BAR", "Lu"],
  0x253: ["LATIN SMALL LETTER B WITH HOOK", "Ll"],
  0x254: ["LATIN SMALL LETTER OPEN O", "Ll"],
  0x257: ["LATIN SMALL LETTER D WITH HOOK", "Ll"],
  0x259: ["LATIN SMALL LETTER SCHWA", "Ll"],
  0x25b: ["LATIN SMALL LETTER OPEN E", "Ll"],
  0x268: ["LATIN SMALL LETTER I WITH STROKE", "Ll"],
  0x289: ["LATIN SMALL LETTER U BAR", "Ll"],
  0x2bc: ["MODIFIER LETTER APOSTROPHE", "Lm"],
  0x300: ["COMBINING GRAVE ACCENT", "Mn"],
  0x301: ["COMBINING ACUTE ACCENT", "Mn"],
  0x302: ["COMBINING CIRCUMFLEX ACCENT", "Mn"],
  0x303: ["COMBINING TILDE", "Mn"],
  0x304: ["COMBINING MACRON", "Mn"],
  0x308: ["COMBINING DIAERESIS", "Mn"],
  0x30c: ["COMBINING CARON", "Mn"],
  0x30d: ["COMBINING VERTICAL LINE ABOVE", "Mn"],
  0x323: ["COMBINING DOT BELOW", "Mn"],
  0x327: ["COMBINING CEDILLA", "Mn"],
  0x330: ["COMBINING TILDE BELOW", "Mn"],
  0x3b1: ["GREEK SMALL LETTER ALPHA", "Ll"],
  0x1dc4: ["COMBINING MACRON-ACUTE", "Mn"],
  0x1dc5: ["COMBINING GRAVE-MACRON", "Mn"],
  0x1dc6: ["COMBINING MACRON-GRAVE", "Mn"],
  0x1dc7: ["COMBINING ACUTE-MACRON", "Mn"],
  0x1e84: ["LATIN CAPITAL LETTER W WITH DIAERESIS", "Lu"],
  0x1e85: ["LATIN SMALL LETTER W WITH DIAERESIS", "Ll"],
  0x2013: ["EN DASH", "Pd"],
  0x2014: ["EM DASH", "Pd"],
  0x2018: ["LEFT SINGLE QUOTATION MARK", "Pi"],
  0x2019: ["RIGHT SINGLE QUOTATION MARK", "Pf"],
  0x201c: ["LEFT DOUBLE QUOTATION MARK", "Pi"],
  0x201d: ["RIGHT DOUBLE QUOTATION MARK", "Pf"],
  0x2020: ["DAGGER", "Po"],
  0x2026: ["HORIZONTAL ELLIPSIS", "Po"],
  0x2039: ["SINGLE LEFT-POINTING ANGLE QUOTATION MARK", "Pi"],
  0x203a: ["SINGLE RIGHT-POINTING ANGLE QUOTATION MARK", "Pf"],
  0x20ac: ["EURO SIGN", "Sc"],
  0x2122: ["TRADE MARK SIGN", "So"],
  0x25cc: ["DOTTED CIRCLE", "So"],
  0x2c6d: ["LATIN CAPITAL LETTER ALPHA", "Lu"],
  0xa78b: ["LATIN CAPITAL LETTER SALTILLO", "Lu"],
  0xa78c: ["LATIN SMALL LETTER SALTILLO", "Ll"],
  } as Record<number, [string, string]>,
}));

vi.mock("./unicodeAdapter.js", () => ({
  // MOCK-FR021: stands in for the FR-021 pinned table until WS-5 lands.
  getCategory: (cp: number) => MOCK_UNICODE.data[cp]?.[1] || undefined,
  getName: (cp: number) => MOCK_UNICODE.data[cp]?.[0] || undefined,
  getCCC: (_cp: number) => undefined,
}));

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dir, "__fixtures__/sil_cameroon_qwerty.kmn");

function fixtureParsed() {
  const src = readFileSync(FIXTURE_PATH, "utf-8");
  return parse(src, "sil_cameroon_qwerty");
}

function fixtureContext(): ExplainContext {
  const { ir } = fixtureParsed();
  const stores = new Map<string, string[]>();
  for (const s of ir.stores) {
    stores.set(
      s.name,
      s.items.flatMap((i) => (i.kind === "char" ? [...i.value] : [])),
    );
  }
  return { rules: ir.groups.flatMap((g) => g.rules), stores };
}

function mustFind(label: string, pred: (r: IRRule) => boolean): IRRule {
  const found = fixtureContext().rules.find(pred);
  if (found === undefined) throw new Error(`fixture rule not found: ${label}`);
  return found;
}

const isDiablockGuard = (r: IRRule) =>
  r.context.some((e) => e.kind === "any" && e.storeRef === "diablock") &&
  r.context.some((e) => e.kind === "vkey" && e.name === "K_C" && e.modifiers.includes("RALT"));

describe("explainRule FR-019 — guard-family reference (fixture)", () => {
  it("any(diablock) + [RALT K_C] > context composes the reference explanation", () => {
    const ctx = fixtureContext();
    const rule = mustFind("diablock guard on RALT K_C", isDiablockGuard);
    expect(explainRule(rule, ctx)).toBe(
      "Right Alt + C types a combining cedilla — a mark that needs a base letter. " +
        "After a space, digit or punctuation, which can never take a diacritic, " +
        "this rule swallows the keystroke so stray marks can't corrupt your text. " +
        "It wins over the plain cedilla rule by being more specific (longest match).",
    );
  });

  it("the reference's key sentences hold individually", () => {
    const ctx = fixtureContext();
    const text = explainRule(mustFind("diablock guard on RALT K_C", isDiablockGuard), ctx);
    expect(text).toContain("types a combining cedilla — a mark that needs a base letter.");
    expect(text).toContain(
      "After a space, digit or punctuation, which can never take a diacritic, " +
        "this rule swallows the keystroke so stray marks can't corrupt your text.",
    );
    expect(text).toContain("It wins over the plain cedilla rule by being more specific (longest match).");
  });

  it("single-arg call keeps today's shape sentence (back-compat)", () => {
    const rule = mustFind("diablock guard on RALT K_C", isDiablockGuard);
    expect(explainRule(rule)).toBe(
      'Swallows the key when a character from the "diablock" store precedes it, ' +
        "keeping the existing text — Right Alt+C produces nothing.",
    );
  });
});

describe("explainRule FR-019 — mark-emitting keys", () => {
  const bareCedilla = () =>
    mustFind(
      "bare RALT K_C",
      (r) =>
        r.context.some((e) => e.kind === "vkey" && e.name === "K_C" && e.modifiers.join(",") === "RALT") &&
        !r.context.some((e) => e.kind === "any"),
    );

  it("single-arg plain-output keeps today's sentence", () => {
    expect(explainRule(bareCedilla())).toBe('Right Alt+C types "̧".');
  });

  it("with context, a mark key is named with its Unicode name and mark judgement", () => {
    expect(explainRule(bareCedilla(), fixtureContext())).toBe(
      "Right Alt + C types a combining cedilla — a mark that needs a base letter.",
    );
  });
});

describe("explainRule FR-019 — honest fallbacks", () => {
  it("unrecognized shape keeps the honest fallback, even with context", () => {
    const opaque: IRRule = {
      nodeId: "x",
      context: [{ kind: "raw", text: "if(some_option)" }],
      output: [{ kind: "raw", text: "nul" }],
    };
    expect(explainRule(opaque, fixtureContext())).toBe(
      "This rule has a shape the assist layer doesn't recognise yet — it is shown as written.",
    );
  });

  it("unknown guard store falls back to naming the store, not guessing its contents", () => {
    const rules: IRRule[] = [
      {
        nodeId: "e",
        context: [{ kind: "vkey", name: "K_Q", modifiers: [] }],
        output: [{ kind: "char", value: "́" }],
      },
      {
        nodeId: "g",
        context: [
          { kind: "any", storeRef: "mystore" },
          { kind: "vkey", name: "K_Q", modifiers: [] },
        ],
        output: [{ kind: "raw", text: "context" }],
      },
    ];
    const ctx: ExplainContext = { rules, stores: new Map() };
    const guard = rules[1];
    if (guard === undefined) throw new Error("unreachable");
    expect(explainRule(guard, ctx)).toBe(
      "Q types a combining acute accent — a mark that needs a base letter. " +
        'After a character from the "mystore" store, ' +
        "this rule swallows the keystroke so stray marks can't corrupt your text. " +
        "It wins over the plain acute accent rule by being more specific (longest match).",
    );
  });

  it("guard with no emitting counterpart makes no lead and no priority claim", () => {
    const rules: IRRule[] = [
      {
        nodeId: "g",
        context: [
          { kind: "any", storeRef: "diablock" },
          { kind: "vkey", name: "K_C", modifiers: ["RALT"] },
        ],
        output: [{ kind: "raw", text: "context" }],
      },
    ];
    const ctx: ExplainContext = { rules, stores: fixtureContext().stores };
    const guard = rules[0];
    if (guard === undefined) throw new Error("unreachable");
    expect(explainRule(guard, ctx)).toBe(
      "After a space, digit or punctuation, which can never take a diacritic, " +
        "this rule swallows the Right Alt + C keystroke so nothing unexpected reaches your text.",
    );
  });
});
