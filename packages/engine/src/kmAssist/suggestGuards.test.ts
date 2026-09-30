/**
 * kmAssist diacritic-guard analysis tests — spec 082 FR-020 / FR-022.
 *
 * Unicode data note: `getCategory`/`getName` come from the FR-021 pinned
 * in-repo table (`@keyboard-studio/contracts/unicode`, generated from
 * `lib/ucd/UnicodeData.txt`, Unicode 17.0.0) via the kmAssist adapter —
 * these tests exercise the real algorithm against the real table.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../codec/parse.js";
import type {
  ContextElement,
  IRRule,
  OutputElement,
} from "@keyboard-studio/contracts";
import {
  analyzeDiacriticGuards,
  proposeGuardStore,
  type OrthographyModel,
} from "./suggestGuards.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dir, "__fixtures__/sil_cameroon_qwerty.kmn");

const ACUTE = "́"; // U+0301
const CEDILLA = "̧"; // U+0327

function fixtureParsed() {
  const src = readFileSync(FIXTURE_PATH, "utf-8");
  return parse(src, "sil_cameroon_qwerty");
}

function fixtureRules(): IRRule[] {
  return fixtureParsed().ir.groups.flatMap((g) => g.rules);
}

function fixtureStores(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const s of fixtureParsed().ir.stores) {
    map.set(
      s.name,
      s.items.flatMap((i) => (i.kind === "char" ? [...i.value] : [])),
    );
  }
  return map;
}

/** Orthography stub: acute attaches to vowels, cedilla to c. */
function stubOrtho(): OrthographyModel {
  return {
    alphabet: ["a", "e", "i", "o", "u", "ɔ", "ɛ", "b", "c", "d", "f", " ", "1", "."],
    markAttachments: new Map<string, string[]>([
      [ACUTE, ["a", "e", "i", "o", "u", "ɔ", "ɛ"]],
      [CEDILLA, ["c"]],
    ]),
  };
}

function vkey(name: string, modifiers: string[] = []): ContextElement {
  return { kind: "vkey", name, modifiers };
}
function anyGuard(storeRef: string): ContextElement {
  return { kind: "any", storeRef };
}
function charOut(value: string): OutputElement {
  return { kind: "char", value };
}
function rawOut(text: string): OutputElement {
  return { kind: "raw", text };
}
function mkRule(nodeId: string, context: ContextElement[], output: OutputElement[]): IRRule {
  return { nodeId, context, output };
}

describe("analyzeDiacriticGuards — sil_cameroon_qwerty regression (FR-020)", () => {
  it("36 combining-mark keys, all guarded → empty missing set, no over-broad flags", () => {
    const analysis = analyzeDiacriticGuards(fixtureRules(), stubOrtho(), fixtureStores());
    expect(analysis.missing).toEqual([]);
    expect(analysis.overBroad).toEqual([]);
  });

  it("dropping one guard surfaces exactly that mark key under the diablock family", () => {
    const rules = fixtureRules();
    const guardRule = rules.find(
      (r) =>
        r.context.some((e) => e.kind === "any" && e.storeRef === "diablock") &&
        r.context.some((e) => e.kind === "vkey" && e.name === "K_C" && e.modifiers.includes("RALT")),
    );
    expect(guardRule).toBeDefined();
    const analysis = analyzeDiacriticGuards(
      rules.filter((r) => r !== guardRule),
      stubOrtho(),
    );
    expect(analysis.missing).toHaveLength(1);
    const group = analysis.missing[0];
    expect(group?.store).toBe("diablock");
    expect(group?.familyName).toBe('Guards using "diablock"');
    expect(group?.missing).toHaveLength(1);
    const item = group?.missing[0];
    expect(item?.key).toBe("Right Alt+C");
    expect(item?.outputChar).toBe(CEDILLA);
    expect(item?.outputName).toBe("COMBINING CEDILLA");
    expect(item?.suggestedStore).toBe("diablock");
    // Scoped to the cedilla's non-base set, attachment set named.
    expect(item?.reasoning).toContain("cedilla attaches to {c} in your orthography");
    expect(item?.reasoning).toContain("guard it after everything else:");
  });

  it("a > nul guard also counts as guarding the key", () => {
    const rules = [
      mkRule("r-acute", [vkey("K_Q")], [charOut(ACUTE)]),
      mkRule("g", [anyGuard("diablock"), vkey("K_Q")], [rawOut("nul")]),
    ];
    expect(analyzeDiacriticGuards(rules, stubOrtho()).missing).toEqual([]);
  });
});

describe("analyzeDiacriticGuards — direction A, missing guards (FR-022)", () => {
  it("unguarded mark key joins the existing guard family with mark-scoped reasoning", () => {
    const rules = [
      mkRule("r-acute", [vkey("K_Q")], [charOut(ACUTE)]),
      mkRule("r-letter", [vkey("K_W")], [charOut("a")]),
      mkRule("r-guard", [anyGuard("diablock"), vkey("K_E")], [rawOut("context")]),
    ];
    const analysis = analyzeDiacriticGuards(rules, stubOrtho());
    expect(analysis.overBroad).toEqual([]);
    expect(analysis.missing).toHaveLength(1);
    const group = analysis.missing[0];
    expect(group?.store).toBe("diablock");
    expect(group?.missing).toHaveLength(1); // the plain letter key is never suggested
    const item = group?.missing[0];
    expect(item?.key).toBe("Q");
    expect(item?.suggestedStore).toBe("diablock");
    expect(item?.outputName).toBe("COMBINING ACUTE ACCENT");
    // The suggestion is scoped to the acute's non-base set; the attachment
    // set is named in the reasoning.
    expect(item?.reasoning).toContain("acute attaches to {a e i o u ɔ ɛ} in your orthography");
    expect(item?.reasoning).toContain("guard it after everything else:");
    expect(item?.reasoning).toContain("b c d f");
  });

  it("proposes a per-mark store when the keyboard has no guard family yet", () => {
    const rules = [mkRule("r-acute", [vkey("K_Q")], [charOut(ACUTE)])];
    const analysis = analyzeDiacriticGuards(rules, stubOrtho());
    expect(analysis.missing).toHaveLength(1);
    expect(analysis.missing[0]?.store).toBe("block-acute");
    expect(analysis.missing[0]?.familyName).toBe('Proposed "block-acute" guards');
    expect(analysis.missing[0]?.missing[0]?.suggestedStore).toBe("block-acute");
  });
});

describe("analyzeDiacriticGuards — direction B, over-broad guards (FR-022)", () => {
  it("flags a guard blocking a mark after one of its valid bases, as a question", () => {
    const rules = [
      mkRule("r-acute", [vkey("K_X")], [charOut(ACUTE)]),
      mkRule("g-acute", [anyGuard("testblock"), vkey("K_X")], [rawOut("context")]),
    ];
    const stores = new Map<string, string[]>([["testblock", ["e", "b"]]]);
    const analysis = analyzeDiacriticGuards(rules, stubOrtho(), stores);
    expect(analysis.missing).toEqual([]);
    expect(analysis.overBroad).toHaveLength(1); // 'b' is not a base: no flag
    expect(analysis.overBroad[0]).toEqual({
      markKey: "X",
      markChar: ACUTE,
      blockedChar: "e",
      guardRuleId: "g-acute",
      question:
        "You block the acute key after 'e', but your orthography says acute combines with e. Intentional?",
    });
  });

  it("stays silent when the guard blocks only non-bases", () => {
    const rules = [
      mkRule("r-acute", [vkey("K_X")], [charOut(ACUTE)]),
      mkRule("g-acute", [anyGuard("testblock"), vkey("K_X")], [rawOut("context")]),
    ];
    const stores = new Map<string, string[]>([["testblock", ["b", "1", " "]]]);
    expect(analyzeDiacriticGuards(rules, stubOrtho(), stores).overBroad).toEqual([]);
  });
});

describe("proposeGuardStore (FR-022)", () => {
  it("per-mark: the mark's non-base set, in alphabet order", () => {
    expect(proposeGuardStore(stubOrtho(), ACUTE)).toEqual(["b", "c", "d", "f", " ", "1", "."]);
  });

  it("default: characters that are never any mark's base", () => {
    expect(proposeGuardStore(stubOrtho())).toEqual(["b", "d", "f", " ", "1", "."]);
  });
});
