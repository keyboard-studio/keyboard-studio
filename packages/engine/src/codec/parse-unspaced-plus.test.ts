/**
 * Unspaced `+` separator gluing (#2247): the codec tokeniser glued a bare
 * token and the context/keystroke separator into one raw element when no
 * space preceded the `+` — `dk(3)+ any(mey1)` parsed its context head as
 * `{kind:"raw", text:"dk(3)+"}`. The rule stayed "typed" (no opaque
 * reason), so the deadkey was invisible to every typed-IR consumer.
 *
 * kmcmplib lexes `+` as its own token with or without surrounding
 * whitespace, so the unspaced forms must parse EXACTLY as the spaced forms:
 * the token, a `{kind:"raw", text:"+"}` separator element, then the
 * keystroke element. These tests pin the whole unspaced class, not only
 * `dk(N)+`:
 *   - dk(N)+ / dk(name)+ / any(store)+ glued on the left of `+`
 *   - tokens glued on the right of `+` (`+any(store)`)
 *   - tokens glued on both sides (`dk(3)+any(mey1)`)
 *   - a bareword glued to a bracket keystroke (`nul+[K_A]`)
 *   - a U+XXXX literal before the separator (`U+0bb0+ 'p'`)
 * and the boundaries that must NOT move:
 *   - the `+` inside a U+XXXX literal is never the separator
 *   - a `+` inside quotes or inside an if(...) guard value is not split
 *   - the deadkey(name) long form stays unmodelled (raw, split only)
 *   - adjacent U+ literals in a store (`U+1027U+1017`) stay one raw item
 */
import { describe, it, expect } from "vitest";
import { parse } from "./parse.js";
import { emit } from "./emit.js";
import type { KeyboardIR } from "@keyboard-studio/contracts";

const HEAD = `store(&VERSION) '10.0'\nstore(&NAME) 'USP'\nstore(&TARGETS) 'any'\n`;
const TAIL = `begin Unicode > use(main)\ngroup(main) using keys\n`;

function kmn(rules: string, stores = ""): string {
  return HEAD + stores + TAIL + rules;
}

function firstRule(ir: KeyboardIR) {
  return ir.groups[0]!.rules[0]!;
}

describe("unspaced + separator (#2247) — glued forms type as the spaced forms", () => {
  it("thamizha_bamini :170-172 — dk(N)+ any(mey1) reaches typed deadkey elements", () => {
    // Verbatim rule shapes from release/t/thamizha_bamini :170-172 (the
    // S-06 library pattern's tier-2 resolutions). :169 is the spaced edge
    // rule and already typed before the fix.
    const { ir } = parse(
      kmn(
        "dk(3)+ any(mey1)    > index(meyr,2)  U+0bc8\n" +
          "dk(1)+ any(mey1)    > index(meyr,2)  U+0bc6\n" +
          "dk(2)+ any(mey1)    > index(meyr,2)  U+0bc7\n",
      ),
      "thamizha_bamini",
    );
    expect(ir.raw.length).toBe(0);
    const contexts = ir.groups[0]!.rules.map((r) => r.context);
    expect(contexts).toEqual([
      [
        { kind: "deadkey", id: 3 },
        { kind: "raw", text: "+" },
        { kind: "any", storeRef: "mey1" },
      ],
      [
        { kind: "deadkey", id: 1 },
        { kind: "raw", text: "+" },
        { kind: "any", storeRef: "mey1" },
      ],
      [
        { kind: "deadkey", id: 2 },
        { kind: "raw", text: "+" },
        { kind: "any", storeRef: "mey1" },
      ],
    ]);
  });

  it("glued and spaced spellings of the same rule produce identical IR context", () => {
    const glued = firstRule(parse(kmn("dk(3)+any(mey1) > index(meyr,2) U+0bc8\n"), "g").ir);
    const spaced = firstRule(parse(kmn("dk(3) + any(mey1) > index(meyr,2) U+0bc8\n"), "s").ir);
    expect(glued.context).toEqual(spaced.context);
    expect(glued.output).toEqual(spaced.output);
  });

  it("embera_north :67 — dk(Semicolon)+ reaches a typed namedDeadkey element (case-variant spelling)", () => {
    // Verbatim shapes from release/e/embera_north: :62 arms the lowercase
    // spelling, :128 fans out from it spaced, :67 is the double-tap escape
    // written with the capital spelling glued to `+`. Before the fix only
    // the lowercase spelling reached typed elements.
    const { ir } = parse(
      kmn(
        "+ \";\" > dk(semicolon)\n" +
          "dk(Semicolon)+ \";\" > \";\"\n" +
          "dk(semicolon) + \"a\" > U+00E3 U+0301\n",
      ),
      "embera_north",
    );
    expect(ir.raw.length).toBe(0);
    const escape = ir.groups[0]!.rules[1]!;
    expect(escape.context).toEqual([
      { kind: "namedDeadkey", name: "Semicolon" },
      { kind: "raw", text: "+" },
      { kind: "char", value: ";" },
    ]);
    // Both spellings of the case-variant pair now reach typed elements.
    const named: string[] = [];
    for (const g of ir.groups)
      for (const r of g.rules)
        for (const el of [...r.context, ...r.output])
          if (el.kind === "namedDeadkey") named.push(el.name);
    expect(named).toContain("semicolon");
    expect(named).toContain("Semicolon");
  });

  it("any(store)+ glued on the left types as any + separator", () => {
    const rule = firstRule(parse(kmn("any(all_letters)+ 'h' > 'h'\n"), "anyglue").ir);
    expect(rule.context).toEqual([
      { kind: "any", storeRef: "all_letters" },
      { kind: "raw", text: "+" },
      { kind: "char", value: "h" },
    ]);
  });

  it("a token glued on the RIGHT of + splits too (sil_myanmar_mywinext :290 shape)", () => {
    const rule = firstRule(
      parse(kmn("any(lodiaU) any(anusvaraU) +any(udiaK) > index(udiaU, 3)\n"), "rglue").ir,
    );
    expect(rule.context).toEqual([
      { kind: "any", storeRef: "lodiaU" },
      { kind: "any", storeRef: "anusvaraU" },
      { kind: "raw", text: "+" },
      { kind: "any", storeRef: "udiaK" },
    ]);
  });

  it("a bareword glued to a bracket keystroke splits (nul+[K_A])", () => {
    const rule = firstRule(parse(kmn("nul+[K_A] > 'a'\n"), "nulglue").ir);
    expect(rule.context).toEqual([
      { kind: "raw", text: "nul" },
      { kind: "raw", text: "+" },
      { kind: "vkey", name: "K_A", modifiers: [] },
    ]);
  });

  it("a U+XXXX literal before an unspaced + keeps its own + and splits at the separator", () => {
    const rule = firstRule(parse(kmn("U+0bb0+ 'p' > 'x'\n"), "cptrail").ir);
    expect(rule.context).toEqual([
      { kind: "char", value: "\u0bb0" },
      { kind: "raw", text: "+" },
      { kind: "char", value: "p" },
    ]);
  });

  it("parse → emit → parse of a glued rule is stable and emits the spaced canonical form", () => {
    const { ir } = parse(kmn("dk(3)+ any(mey1) > index(meyr,2) U+0bc8\n"), "rt");
    const text = emit(ir);
    expect(text).toContain("dk(0003) + any(mey1)");
    const twice = parse(text, "rt").ir;
    expect(firstRule(twice).context).toEqual(firstRule(ir).context);
    expect(emit(twice)).toBe(text);
  });
});

describe("unspaced + separator (#2247) — boundaries that must not move", () => {
  it("a + inside a quoted literal is not a separator", () => {
    const rule = firstRule(parse(kmn("'a+b' + 'c' > 'x'\n"), "qplus").ir);
    expect(rule.context).toEqual([
      { kind: "char", value: "a" },
      { kind: "char", value: "+" },
      { kind: "char", value: "b" },
      { kind: "raw", text: "+" },
      { kind: "char", value: "c" },
    ]);
  });

  it("a + inside an if(...) guard value is not a separator", () => {
    const rule = firstRule(parse(kmn("if(s = 'a+b') + [K_A] > 'x'\n", "store(s) 'a+b'\n"), "gplus").ir);
    expect(rule.context[0]).toEqual({ kind: "if", store: "s", value: "a+b" });
  });

  it("the deadkey(name) long form stays unmodelled — the glue splits, the token stays raw", () => {
    const rule = firstRule(parse(kmn("deadkey(5)+ 'a' > 'a'\n"), "longform").ir);
    expect(rule.context).toEqual([
      { kind: "raw", text: "deadkey(5)" },
      { kind: "raw", text: "+" },
      { kind: "char", value: "a" },
    ]);
  });

  it("a + in OUTPUT position is not split — separator splitting is context-scoped", () => {
    // `+` has no separator meaning on the RHS; a glued output token is
    // literal raw text (the corpus has exactly one, inside a misparsed
    // comment tail in burushaski_girminas_perso_arabic) and its
    // segmentation must not change.
    const rule = firstRule(parse(kmn("+ [K_R] > U+0613 FULL+\n"), "outplus").ir);
    expect(rule.output).toEqual([
      { kind: "char", value: "\u0613" },
      { kind: "raw", text: "FULL+" },
    ]);
  });

  it("adjacent U+ literals in a store body stay one raw item (no separator semantics in stores)", () => {
    const { ir } = parse(kmn("+ [K_A] > 'a'\n", "store(x) U+1027U+1017\n"), "storeplus");
    expect(ir.stores.find((s) => s.name === "x")?.items).toEqual([
      { kind: "raw", text: "U+1027U+1017" },
    ]);
  });
});
